"""
services/research/news_intelligence.py — Financial News Ingestion Agent
=======================================================================
Fetches financial news from free public sources:
  - NewsAPI.org (free tier: 100 req/day)
  - Financial Modeling Prep (free tier): earnings calendar, company news
  - RSS feeds: Reuters Markets, CNA Business

For each article:
  - Extracts mentioned ticker symbols via regex + company name lookup
  - Scores sentiment using Claude via ai_router (batch, cost-efficient)
  - Stores in market_events with embedding

Schedule: every 2 hours via APScheduler.
"""

from __future__ import annotations

import asyncio
import hashlib
import re
from datetime import UTC, datetime

import feedparser
import httpx
import structlog

from core.config import settings
from database import supabase
from services.ai_router import get_ai_analysis

logger = structlog.get_logger("neufin.news_intelligence")

NEWSAPI_BASE = "https://newsapi.org/v2/everything"
FMP_BASE = "https://financialmodelingprep.com/api/v3"

# SEA-focused financial RSS feeds (free, no auth)
RSS_FEEDS = [
    ("https://feeds.reuters.com/reuters/businessNews", "rss_reuters"),
    (
        "https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6311",
        "rss_cna",
    ),
]

# NewsAPI search queries for SEA financial news
NEWSAPI_QUERIES = [
    "Singapore financial markets",
    "Southeast Asia economy",
    "Asia Pacific stock market",
    "SGX Singapore exchange",
    "ASEAN investment",
]

# Regex to extract common stock ticker symbols (3-5 uppercase letters, optionally .SI/.HK/.KL)
_TICKER_RE = re.compile(r"\b([A-Z]{2,5}(?:\.SI|\.HK|\.KL|\.NS)?)\b")

# Well-known SEA company name to ticker mappings
_COMPANY_TICKERS: dict[str, str] = {
    "DBS": "DBS.SI",
    "OCBC": "OCBC.SI",
    "UOB": "U11.SI",
    "Singtel": "Z74.SI",
    "Grab": "GRAB",
    "Sea Limited": "SE",
    "Shopee": "SE",
    "GoTo": "GOTO.JK",
    "Maybank": "MAY.KL",
    "Petronas": "PETD.KL",
    "Telkom": "TLKM.JK",
    "Gojek": "GOTO.JK",
    "AIA": "1299.HK",
    "HSBC": "HSBC",
    "Standard Chartered": "2888.HK",
}


def _extract_tickers(text: str) -> list[str]:
    """Extract plausible ticker symbols from text."""
    # Known company names
    found = []
    for name, ticker in _COMPANY_TICKERS.items():
        if name.lower() in text.lower():
            found.append(ticker)
    # Regex-based
    regex_matches = _TICKER_RE.findall(text)
    # Filter out common false positives (all-caps English words)
    _STOPWORDS = {
        "THE",
        "FOR",
        "AND",
        "BUT",
        "NOT",
        "ARE",
        "FROM",
        "WITH",
        "THIS",
        "THAT",
        "CEO",
        "CFO",
        "IPO",
        "MAS",
        "SGX",
        "GDP",
        "CPI",
        "FED",
        "IMF",
        "AUM",
        "USD",
        "SGD",
        "HKD",
        "MYR",
        "IDR",
        "EUR",
        "GBP",
        "YEN",
    }
    regex_matches = [t for t in regex_matches if t not in _STOPWORDS and len(t) >= 2]
    combined = list(dict.fromkeys(found + regex_matches))  # dedupe, preserve order
    return combined[:6]  # cap at 6 tickers per article


def _sentiment_to_score(sentiment: str) -> float:
    return {
        "very_negative": -1.0,
        "negative": -0.5,
        "neutral": 0.0,
        "positive": 0.5,
        "very_positive": 1.0,
    }.get(sentiment, 0.0)


def _get_embedding_sync(text: str) -> list[float] | None:
    try:
        from openai import OpenAI

        client = OpenAI(api_key=settings.OPENAI_KEY)
        resp = client.embeddings.create(
            model="text-embedding-3-small", input=text[:8000]
        )
        return resp.data[0].embedding
    except Exception as exc:
        logger.warning("news_intelligence.embedding_failed", error=str(exc))
        return None


async def _score_article_sentiment(title: str, summary: str) -> tuple[str, float]:
    """Use Claude to classify sentiment of a financial news article."""
    text = f"{title}. {summary[:300]}"
    prompt = f"""Classify the financial market sentiment of this news article.

Article: "{text}"

Return ONLY valid JSON:
{{
  "sentiment": "very_negative|negative|neutral|positive|very_positive",
  "impact_score": <float -1.0 to 1.0>,
  "sector": "<primary affected sector or null>",
  "event_type": "earnings|ipo|merger|regulatory|macro|news"
}}"""
    try:
        result = await get_ai_analysis(prompt)
        sentiment = result.get("sentiment", "neutral")
        score = float(result.get("impact_score", 0.0))
        return sentiment, score
    except Exception:
        return "neutral", 0.0


def _article_already_exists(source_url: str) -> bool:
    try:
        resp = (
            supabase.table("market_events")
            .select("id")
            .eq("source_url", source_url)
            .limit(1)
            .execute()
        )
        return bool(resp.data)
    except Exception:
        return False


def _insert_event(
    event_type: str,
    title: str,
    summary: str,
    tickers: list[str],
    sector: str | None,
    region: str,
    sentiment: str,
    score: float,
    event_date: str,
    source_url: str,
    source: str,
    raw: dict,
) -> bool:
    embed_text = f"{title}. {summary[:400]}"
    embedding = _get_embedding_sync(embed_text)

    payload = {
        "event_type": event_type,
        "company_ticker": tickers[0] if tickers else None,
        "company_name": None,
        "sector": sector,
        "region": region,
        "title": title[:500],
        "summary": summary[:2000],
        "impact_sentiment": sentiment,
        "impact_score": score,
        "event_date": event_date,
        "source_url": source_url,
        "source": source,
        "raw_data": {"tickers": tickers, **raw},
    }
    if embedding:
        payload["embedding"] = embedding

    try:
        supabase.table("market_events").insert(payload).execute()
        return True
    except Exception as exc:
        # Duplicate source_url constraint is the expected case
        if "duplicate" not in str(exc).lower() and "unique" not in str(exc).lower():
            logger.error("news_intelligence.insert_failed", error=str(exc))
        return False


async def ingest_newsapi(query: str) -> int:
    """Fetch articles from NewsAPI for a given query. Returns new count."""
    if not settings.NEWSAPI_KEY:
        return 0
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                NEWSAPI_BASE,
                params={
                    "q": query,
                    "language": "en",
                    "sortBy": "publishedAt",
                    "pageSize": "10",
                    "apiKey": settings.NEWSAPI_KEY,
                },
            )
            if resp.status_code != 200:
                return 0
            articles = resp.json().get("articles", [])
    except Exception as exc:
        logger.warning("news_intelligence.newsapi_failed", query=query, error=str(exc))
        return 0

    new_count = 0
    for article in articles[:8]:
        url = article.get("url", "")
        if not url or _article_already_exists(url):
            continue
        title = article.get("title", "") or ""
        description = article.get("description", "") or ""
        content = f"{description} {article.get('content', '') or ''}"
        tickers = _extract_tickers(f"{title} {content}")
        published = article.get("publishedAt", datetime.now(UTC).isoformat())

        sentiment, score = await _score_article_sentiment(title, content[:400])
        inserted = _insert_event(
            event_type="news",
            title=title,
            summary=content[:500],
            tickers=tickers,
            sector=None,
            region="SEA",
            sentiment=sentiment,
            score=score,
            event_date=published,
            source_url=url,
            source="newsapi",
            raw={"source": article.get("source", {}).get("name", "")},
        )
        if inserted:
            new_count += 1
    return new_count


async def ingest_rss_feed(feed_url: str, source_name: str) -> int:
    """Parse an RSS feed and ingest financial articles. Returns new count."""
    try:
        loop = asyncio.get_event_loop()
        feed = await loop.run_in_executor(None, feedparser.parse, feed_url)
        entries = feed.entries[:10]
    except Exception as exc:
        logger.warning("news_intelligence.rss_failed", feed=feed_url, error=str(exc))
        return 0

    new_count = 0
    for entry in entries:
        url = getattr(entry, "link", "") or ""
        if not url:
            # Generate a stable URL from title hash if no link
            url = f"rss://{source_name}/{hashlib.md5(getattr(entry, 'title', '').encode()).hexdigest()}"  # noqa: S324

        if _article_already_exists(url):
            continue

        title = getattr(entry, "title", "") or ""
        summary = getattr(entry, "summary", "") or ""
        tickers = _extract_tickers(f"{title} {summary}")
        published = getattr(entry, "published", datetime.now(UTC).isoformat())

        sentiment, score = await _score_article_sentiment(title, summary[:400])
        inserted = _insert_event(
            event_type="news",
            title=title,
            summary=summary[:500],
            tickers=tickers,
            sector=None,
            region="SEA",
            sentiment=sentiment,
            score=score,
            event_date=published,
            source_url=url,
            source=source_name,
            raw={},
        )
        if inserted:
            new_count += 1
    return new_count


async def ingest_fmp_earnings(days_ahead: int = 7) -> int:
    """Fetch upcoming earnings from Financial Modeling Prep (free tier)."""
    if not settings.FMP_API_KEY:
        return 0
    try:
        from datetime import timedelta

        today = datetime.now(UTC).date()
        end = today + timedelta(days=days_ahead)
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{FMP_BASE}/earning_calendar",
                params={
                    "from": today.isoformat(),
                    "to": end.isoformat(),
                    "apikey": settings.FMP_API_KEY,
                },
            )
            if resp.status_code != 200:
                return 0
            events = resp.json()
    except Exception as exc:
        logger.warning("news_intelligence.fmp_failed", error=str(exc))
        return 0

    new_count = 0
    for event in (events or [])[:15]:
        symbol = event.get("symbol", "") or ""
        if not symbol:
            continue
        url = f"fmp://earnings/{symbol}/{event.get('date', '')}"
        if _article_already_exists(url):
            continue

        title = f"Earnings: {event.get('company', symbol)} ({symbol})"
        eps_est = event.get("epsEstimated")
        title_detail = f"{title} — EPS est: {eps_est}" if eps_est else title

        inserted = _insert_event(
            event_type="earnings",
            title=title_detail,
            summary=f"Upcoming earnings release for {symbol}.",
            tickers=[symbol],
            sector=None,
            region="US",
            sentiment="neutral",
            score=0.0,
            event_date=f"{event.get('date', today.isoformat())}T00:00:00Z",
            source_url=url,
            source="fmp",
            raw=event,
        )
        if inserted:
            new_count += 1
    return new_count


async def run_news_intelligence() -> dict:
    """
    Main entry point — run all news sources concurrently.
    Called by APScheduler every 2 hours.
    """
    logger.info("news_intelligence.run_start")

    # NewsAPI queries (sequential to avoid hammering rate limits on free tier)
    newsapi_total = 0
    for query in NEWSAPI_QUERIES[:3]:  # Limit to 3 queries to stay within free tier
        newsapi_total += await ingest_newsapi(query)
        await asyncio.sleep(0.5)

    # RSS feeds (parallel — no rate limits)
    rss_tasks = [ingest_rss_feed(url, name) for url, name in RSS_FEEDS]
    rss_results = await asyncio.gather(*rss_tasks, return_exceptions=True)
    rss_total = sum(r for r in rss_results if isinstance(r, int))

    # FMP earnings calendar
    fmp_total = await ingest_fmp_earnings()

    total = newsapi_total + rss_total + fmp_total
    logger.info(
        "news_intelligence.run_complete",
        newsapi=newsapi_total,
        rss=rss_total,
        fmp=fmp_total,
        total=total,
    )
    return {
        "newsapi": newsapi_total,
        "rss": rss_total,
        "fmp": fmp_total,
        "total": total,
    }
