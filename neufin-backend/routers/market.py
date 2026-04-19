"""
Global Market Health
---------------------
Aggregated, anonymised statistics across all Neufin portfolios.

GET /api/market/health           → platform-wide DNA stats (5-min cache)
GET /api/market/score-trend      → avg DNA score per day, last 30 days (5-min cache)
GET /api/market/indices          → live global index quotes (SEA + US, 5-min cache)
POST /api/analytics/track        → client-side funnel event ingestion
"""

from __future__ import annotations

import time

import structlog
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import supabase
from services.market_resolver import fetch_twelve_data

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["market"])

# ── Simple in-process 5-minute dict cache ─────────────────────────────────────
_cache: dict[str, tuple[float, object]] = {}
_CACHE_TTL = 300  # seconds


def _cached(key: str, ttl: int = _CACHE_TTL):
    """Return (hit, value). hit=True means cache is fresh."""
    if key in _cache:
        ts, value = _cache[key]
        if time.monotonic() - ts < ttl:
            return True, value
    return False, None


def _store(key: str, value: object):
    _cache[key] = (time.monotonic(), value)


# ── Investor type metadata ─────────────────────────────────────────────────────
_TYPE_META = {
    "Diversified Strategist": {"sector": "Balanced", "color": "#3b82f6"},
    "Conviction Growth": {"sector": "Growth", "color": "#8b5cf6"},
    "Momentum Trader": {"sector": "Momentum", "color": "#f59e0b"},
    "Defensive Allocator": {"sector": "Defensive", "color": "#22c55e"},
    "Speculative Investor": {"sector": "Speculative", "color": "#ef4444"},
}

_SCORE_BANDS = [
    {"range": "0-20", "label": "High Risk"},
    {"range": "21-40", "label": "Below Avg"},
    {"range": "41-60", "label": "Average"},
    {"range": "61-80", "label": "Good"},
    {"range": "81-100", "label": "Excellent"},
]


# ── Endpoints ──────────────────────────────────────────────────────────────────


@router.get("/api/market/health")
async def market_health():
    """
    Returns aggregated platform stats — all data is anonymous.
    Cached for 5 minutes to reduce Supabase load.
    """
    hit, cached = _cached("market_health")
    if hit:
        return cached

    try:
        result = (
            supabase.table("dna_scores")
            .select(
                "dna_score, investor_type, total_value, max_position_pct, created_at"
            )
            .not_.is_("dna_score", "null")
            .execute()
        )
        rows = result.data or []
    except Exception as e:
        raise HTTPException(500, f"Could not fetch market data: {e}") from e

    if not rows:
        payload = {
            "total_portfolios": 0,
            "avg_dna_score": 0,
            "median_dna_score": 0,
            "avg_concentration": 0,
            "score_distribution": [],
            "strategy_mix": [],
        }
        _store("market_health", payload)
        return payload

    scores = [r["dna_score"] for r in rows if r.get("dna_score") is not None]
    concentrations = [
        r["max_position_pct"] for r in rows if r.get("max_position_pct") is not None
    ]

    # Score distribution
    bands = [0, 0, 0, 0, 0]
    for s in scores:
        idx = min(int(s // 20), 4)
        bands[idx] += 1

    score_distribution = [
        {
            **_SCORE_BANDS[i],
            "count": bands[i],
            "pct": round(bands[i] / len(scores) * 100, 1),
        }
        for i in range(5)
    ]

    # Strategy mix (investor_type breakdown)
    type_counts: dict[str, int] = {}
    for r in rows:
        t = r.get("investor_type") or "Unknown"
        type_counts[t] = type_counts.get(t, 0) + 1

    total = len(rows)
    strategy_mix = sorted(
        [
            {
                "type": t,
                "count": cnt,
                "pct": round(cnt / total * 100, 1),
                "color": _TYPE_META.get(t, {}).get("color", "#6b7280"),
                "sector": _TYPE_META.get(t, {}).get("sector", t),
            }
            for t, cnt in type_counts.items()
        ],
        key=lambda x: x["count"],
        reverse=True,
    )

    sorted_scores = sorted(scores)
    mid = len(sorted_scores) // 2
    median = (
        sorted_scores[mid]
        if len(sorted_scores) % 2 == 1
        else (sorted_scores[mid - 1] + sorted_scores[mid]) / 2
    )

    payload = {
        "total_portfolios": total,
        "avg_dna_score": round(sum(scores) / len(scores), 1),
        "median_dna_score": round(median, 1),
        "avg_concentration": (
            round(sum(concentrations) / len(concentrations), 1) if concentrations else 0
        ),
        "score_distribution": score_distribution,
        "strategy_mix": strategy_mix,
    }
    _store("market_health", payload)
    return payload


@router.get("/api/market/score-trend")
async def score_trend():
    """
    Daily average DNA score for the last 30 days.
    Cached for 5 minutes.
    """
    hit, cached = _cached("score_trend")
    if hit:
        return cached

    try:
        result = (
            supabase.table("dna_scores")
            .select("dna_score, created_at")
            .not_.is_("dna_score", "null")
            .order("created_at", desc=False)
            .limit(2000)
            .execute()
        )
        rows = result.data or []
    except Exception as e:
        raise HTTPException(500, f"Could not fetch trend data: {e}") from e

    # Bucket by date (YYYY-MM-DD)
    daily: dict[str, list[int]] = {}
    for r in rows:
        day = (r.get("created_at") or "")[:10]
        if day:
            daily.setdefault(day, []).append(r["dna_score"])

    trend = [
        {
            "date": day,
            "avg_score": round(sum(scores) / len(scores), 1),
            "count": len(scores),
        }
        for day, scores in sorted(daily.items())
    ]

    payload = {"trend": trend}
    _store("score_trend", payload)
    return payload


# ── Global index quotes (SEA + US) ────────────────────────────────────────────

# Yahoo Finance symbols for each display label
_INDEX_MAP: dict[str, dict] = {
    "S&P 500": {"symbol": "^GSPC", "currency": "USD", "region": "US"},
    "NASDAQ": {"symbol": "^IXIC", "currency": "USD", "region": "US"},
    "FTSE 100": {"symbol": "^FTSE", "currency": "GBP", "region": "UK"},
    "STI": {"symbol": "^STI", "currency": "SGD", "region": "SG"},
    "VNIndex": {"symbol": "^VNINDEX", "currency": "VND", "region": "VN"},
    "KLCI": {"symbol": "^KLSE", "currency": "MYR", "region": "MY"},
    "SET": {"symbol": "^SET.BK", "currency": "THB", "region": "TH"},
    "HSI": {"symbol": "^HSI", "currency": "HKD", "region": "HK"},
}

_INDEX_CACHE_TTL = 300  # 5 minutes


def _fetch_index_quotes() -> list[dict]:
    """Fetch latest quotes for all tracked indices using yfinance."""
    try:
        import yfinance as yf
    except ImportError:
        logger.warning("market.indices_yfinance_missing")
        return []

    symbols = [v["symbol"] for v in _INDEX_MAP.values()]
    labels = {v["symbol"]: k for k, v in _INDEX_MAP.items()}

    try:
        tickers = yf.Tickers(" ".join(symbols))
        results = []
        for sym in symbols:
            label = labels[sym]
            meta = _INDEX_MAP[label]
            try:
                info = tickers.tickers[sym].fast_info
                price = float(getattr(info, "last_price", None) or 0)
                prev_close = float(getattr(info, "previous_close", None) or 0)
                change_pct = (
                    round((price - prev_close) / prev_close * 100, 2)
                    if prev_close and prev_close > 0
                    else None
                )
                results.append(
                    {
                        "label": label,
                        "symbol": sym,
                        "price": round(price, 2) if price > 0 else None,
                        "change_pct": change_pct,
                        "currency": meta["currency"],
                        "region": meta["region"],
                        "status": "live" if price > 0 else "unavailable",
                    }
                )
            except Exception as exc:
                logger.warning("market.index_quote_failed", symbol=sym, error=str(exc))
                results.append(
                    {
                        "label": label,
                        "symbol": sym,
                        "price": None,
                        "change_pct": None,
                        "currency": meta["currency"],
                        "region": meta["region"],
                        "status": "unavailable",
                    }
                )
        return results
    except Exception as exc:
        logger.warning("market.indices_batch_failed", error=str(exc))
        return []


@router.get("/api/market/indices")
async def market_indices():
    """
    Live quotes for all tracked global indices (US + SEA).
    Cached for 5 minutes. Falls back to empty list if yfinance unavailable.
    """
    hit, cached = _cached("market_indices", ttl=_INDEX_CACHE_TTL)
    if hit:
        return cached

    import asyncio

    quotes = await asyncio.to_thread(_fetch_index_quotes)
    payload = {"indices": quotes, "count": len(quotes)}
    _store("market_indices", payload)
    return payload


# ── Client-side analytics ingestion ───────────────────────────────────────────


class TrackRequest(BaseModel):
    event: str
    properties: dict | None = None
    session_id: str | None = None


@router.post("/api/analytics/track")
async def track_event(body: TrackRequest):
    """
    Lightweight first-party analytics event ingestion.
    Called from the frontend useAnalytics hook.
    Silently ignores failures so it never breaks the UI.
    """
    try:
        supabase.table("analytics_events").insert(
            {
                "event": body.event,
                "session_id": body.session_id,
                "properties": body.properties or {},
            }
        ).execute()
    except Exception:
        logger.warning(
            "Failed to track analytics event", exc_info=True
        )  # fire-and-forget
    return {"ok": True}


# ── SEA Market Pulse ──────────────────────────────────────────────────────────
# GET /api/market/sea-pulse
# Returns 1D/1W/1M performance, regime classification, and volatility for the
# five core SEA indices.  Falls back gracefully when yfinance is unavailable.

_SEA_INDICES = {
    "^VNINDEX": {
        "label": "VN-Index",
        "region": "Vietnam",
        "currency": "VND",
        "flag": "🇻🇳",
    },
    "^JKSE": {
        "label": "IDX Composite",
        "region": "Indonesia",
        "currency": "IDR",
        "flag": "🇮🇩",
    },
    "^SET.BK": {
        "label": "SET Index",
        "region": "Thailand",
        "currency": "THB",
        "flag": "🇹🇭",
    },
    "^KLSE": {
        "label": "FBM KLCI",
        "region": "Malaysia",
        "currency": "MYR",
        "flag": "🇲🇾",
    },
    "^STI": {
        "label": "Straits Times Index",
        "region": "Singapore",
        "currency": "SGD",
        "flag": "🇸🇬",
    },
}

_REGIME_THRESHOLDS = [
    (5, "Strong Rally", "bullish"),
    (2, "Mild Uptrend", "bullish"),
    (-2, "Sideways", "neutral"),
    (-5, "Mild Pullback", "bearish"),
]


def _classify_regime(change_pct_1m: float | None) -> tuple[str, str]:
    """Returns (regime_label, regime_class) from 1-month return."""
    if change_pct_1m is None:
        return "Unavailable", "neutral"
    for threshold, label, cls in _REGIME_THRESHOLDS:
        if change_pct_1m >= threshold:
            return label, cls
    return "Correction", "bearish"


def _volatility_label(std_5d: float | None) -> str:
    if std_5d is None:
        return "Unknown"
    if std_5d < 0.5:
        return "Low"
    if std_5d < 1.2:
        return "Moderate"
    return "High"


def _fetch_sea_pulse() -> list[dict]:
    try:
        import yfinance as yf
    except ImportError:
        return []

    symbols = list(_SEA_INDICES.keys())
    results = []

    for sym in symbols:
        meta = _SEA_INDICES[sym]
        try:
            td_quote = fetch_twelve_data(sym)
            if td_quote and td_quote.price:
                chg_1d = (
                    round(td_quote.percent_change_1d, 2)
                    if td_quote.percent_change_1d is not None
                    else None
                )
                regime_label, regime_class = _classify_regime(chg_1d)
                results.append(
                    {
                        "symbol": sym,
                        "label": meta["label"],
                        "region": meta["region"],
                        "currency": meta["currency"],
                        "flag": meta["flag"],
                        "price": round(td_quote.price, 2),
                        "change_1d": chg_1d,
                        "change_1w": None,
                        "change_1m": None,
                        "regime": regime_label,
                        "regime_class": regime_class,
                        "volatility": "Live",
                        "status": "live",
                        "source": "twelvedata",
                    }
                )
                continue

            ticker = yf.Ticker(sym)
            hist = ticker.history(period="1mo", interval="1d", auto_adjust=True)
            if hist.empty or len(hist) < 2:
                raise ValueError("insufficient history")

            closes = hist["Close"].dropna().tolist()
            price_now = closes[-1]
            price_1d = closes[-2] if len(closes) >= 2 else None
            price_1w = closes[-6] if len(closes) >= 6 else closes[0]
            price_1m = closes[0]

            chg_1d = (
                round((price_now - price_1d) / price_1d * 100, 2) if price_1d else None
            )
            chg_1w = (
                round((price_now - price_1w) / price_1w * 100, 2) if price_1w else None
            )
            chg_1m = (
                round((price_now - price_1m) / price_1m * 100, 2) if price_1m else None
            )

            # 5-day daily pct std as volatility proxy
            if len(closes) >= 5:
                recent = closes[-5:]
                pct_changes = [
                    abs((recent[i] - recent[i - 1]) / recent[i - 1] * 100)
                    for i in range(1, len(recent))
                ]
                std_5d = sum(pct_changes) / len(pct_changes) if pct_changes else None
            else:
                std_5d = None

            regime_label, regime_class = _classify_regime(chg_1m)

            results.append(
                {
                    "symbol": sym,
                    "label": meta["label"],
                    "region": meta["region"],
                    "currency": meta["currency"],
                    "flag": meta["flag"],
                    "price": round(price_now, 2),
                    "change_1d": chg_1d,
                    "change_1w": chg_1w,
                    "change_1m": chg_1m,
                    "regime": regime_label,
                    "regime_class": regime_class,
                    "volatility": _volatility_label(std_5d),
                    "status": "live",
                    "source": "yahoo",
                }
            )
        except Exception as exc:
            logger.warning("market.sea_pulse_failed", symbol=sym, error=str(exc))
            results.append(
                {
                    "symbol": sym,
                    "label": meta["label"],
                    "region": meta["region"],
                    "currency": meta["currency"],
                    "flag": meta["flag"],
                    "price": None,
                    "change_1d": None,
                    "change_1w": None,
                    "change_1m": None,
                    "regime": "Unavailable",
                    "regime_class": "neutral",
                    "volatility": "Unknown",
                    "status": "unavailable",
                }
            )

    return results


@router.get("/api/market/sea-pulse")
async def sea_market_pulse():
    """
    1D / 1W / 1M performance + regime + volatility for the five SEA indices.
    Cached for 5 minutes.
    """
    hit, cached = _cached("sea_pulse", ttl=_INDEX_CACHE_TTL)
    if hit:
        return cached

    import asyncio

    data = await asyncio.to_thread(_fetch_sea_pulse)
    payload = {"indices": data, "count": len(data)}
    _store("sea_pulse", payload)
    return payload
