"""
market_cache.py — Multi-tier cache for TIME_SERIES_DAILY_ADJUSTED results.

Tier 1  Redis           24-hour TTL  (shared across all workers/containers)
Tier 2  Supabase table  24-hour TTL  (persistent fallback when Redis is down)
Tier 3  In-process dict  1-hour TTL  (last resort; per-worker, non-shared)

Key format:  neufin:timeseries:{SYMBOL}:{DAYS}

When the second user requests AAPL data within 24 hours of the first, Tier-1 or
Tier-2 returns the serialised pandas Series immediately — no Alpha Vantage call.
"""

from __future__ import annotations

import datetime
import json
import math
import time
from dataclasses import dataclass

import pandas as pd
import structlog
from dotenv import load_dotenv

from core.config import settings

load_dotenv()

logger = structlog.get_logger("neufin.market_cache")

# ── Ticker alias map ───────────────────────────────────────────────────────────
# When a ticker fails all 6 providers, try these aliases before giving up.
TICKER_ALIASES: dict[str, list[str]] = {
    "SQ": ["SQ", "BLOCK"],  # Block Inc (rebranded from Square)
    "FB": ["META"],  # Meta Platforms
    "GOOG": ["GOOGL"],  # Alphabet Class A
    "TWTR": ["X"],  # X Corp (formerly Twitter)
    "SNAP": ["SNAP"],
    "BRK-B": ["BRK.B"],
    "BRK-A": ["BRK.A"],
}


@dataclass
class PriceResult:
    symbol: str
    price: float | None
    status: str  # live | alias | stale | unresolvable
    warning: str = ""
    alias_used: str = ""
    stale_age_hours: float = 0.0


# ── Optional Redis ─────────────────────────────────────────────────────────────
try:
    import redis as _redis_lib

    _REDIS_AVAILABLE = True
except ImportError:
    _REDIS_AVAILABLE = False
    logger.warning("market_cache.redis_missing")

# ── Optional Supabase ──────────────────────────────────────────────────────────
try:
    from database import get_supabase_client

    _SUPABASE_AVAILABLE = True
except Exception:
    _SUPABASE_AVAILABLE = False
    logger.warning("market_cache.supabase_missing")

REDIS_URL = settings.REDIS_URL
_REDIS_TTL = 86_400  # 24 hours
_SUPABASE_TTL = 86_400  # 24 hours
_MEMORY_TTL = 3_600  # 1 hour  (in-process tier)
_TABLE = "market_data_cache"

# ── In-process fallback ────────────────────────────────────────────────────────
_MEMORY: dict[str, tuple[pd.Series, float]] = {}  # key → (series, epoch_ts)

# ── Redis singleton ────────────────────────────────────────────────────────────
_redis_client: object | None = None


def _get_redis():
    global _redis_client
    if not _REDIS_AVAILABLE or not REDIS_URL:
        return None
    if _redis_client is None:
        try:
            _redis_client = _redis_lib.from_url(  # type: ignore[attr-defined]
                REDIS_URL,
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2,
            )
            _redis_client.ping()  # type: ignore[attr-defined]
        except Exception as e:
            logger.warning("market_cache.redis_connection_failed", error=str(e))
            _redis_client = None
    return _redis_client


# ── Serialisation helpers ──────────────────────────────────────────────────────
def _series_to_json(s: pd.Series) -> str:
    """Serialise a pandas Series (string-indexed) to a compact JSON string."""
    return json.dumps({"index": list(s.index), "values": list(s.values), "name": s.name})


def _json_to_series(raw: str) -> pd.Series:
    d = json.loads(raw)
    s = pd.Series(d["values"], index=d["index"], dtype=float)
    s.name = d.get("name")
    return s


# ── Cache key ──────────────────────────────────────────────────────────────────
def _key(symbol: str, days: int) -> str:
    return f"neufin:timeseries:{symbol.upper()}:{days}"


# ══════════════════════════════════════════════════════════════════════════════
# Public API
# ══════════════════════════════════════════════════════════════════════════════


def get_closes(symbol: str, days: int) -> pd.Series | None:
    """
    Return cached daily closes or None if not found / expired.
    Checks Tier-1 (Redis) → Tier-2 (Supabase) → Tier-3 (memory).
    """
    k = _key(symbol, days)

    # ── Tier-1: Redis ─────────────────────────────────────────────────────────
    r = _get_redis()
    if r is not None:
        try:
            raw = r.get(k)  # type: ignore[attr-defined]
            if raw:
                logger.debug("market_cache.redis_hit", key=k)
                return _json_to_series(raw)
        except Exception as e:
            logger.warning("market_cache.redis_get_error", error=str(e))

    # ── Tier-2: Supabase ──────────────────────────────────────────────────────
    if _SUPABASE_AVAILABLE:
        try:
            sb = get_supabase_client()
            now_iso = datetime.datetime.now(datetime.UTC).isoformat()
            row = (
                sb.table(_TABLE)
                .select("payload")
                .eq("cache_key", k)
                .gt("expires_at", now_iso)
                .maybe_single()
                .execute()
            )
            if (
                row is not None and row.data
            ):  # FIXED: guard against None response from maybe_single()
                series = _json_to_series(row.data["payload"])
                logger.debug("market_cache.supabase_hit", key=k)
                # Backfill Redis so the next hit is faster
                _redis_set(k, row.data["payload"])
                return series
        except Exception as e:
            logger.warning("market_cache.supabase_get_error", error=str(e))

    # ── Tier-3: In-process memory ─────────────────────────────────────────────
    entry = _MEMORY.get(k)
    if entry and (time.time() - entry[1]) < _MEMORY_TTL:
        logger.debug("market_cache.memory_hit", key=k)
        return entry[0]

    return None


def set_closes(symbol: str, days: int, series: pd.Series) -> None:
    """
    Persist daily closes to all available cache tiers.
    """
    k = _key(symbol, days)
    raw = _series_to_json(series)

    # Tier-1: Redis
    _redis_set(k, raw)

    # Tier-2: Supabase
    if _SUPABASE_AVAILABLE:
        try:
            sb = get_supabase_client()
            exp = (
                datetime.datetime.now(datetime.UTC) + datetime.timedelta(seconds=_SUPABASE_TTL)
            ).isoformat()
            sb.table(_TABLE).upsert(
                {"cache_key": k, "payload": raw, "expires_at": exp},
                on_conflict="cache_key",
            ).execute()
        except Exception as e:
            logger.warning("market_cache.supabase_set_error", error=str(e))

    # Tier-3: memory
    _MEMORY[k] = (series, time.time())


def _redis_set(k: str, raw: str) -> None:
    r = _get_redis()
    if r is None:
        return
    try:
        r.setex(k, _REDIS_TTL, raw)  # type: ignore[attr-defined]
    except Exception as e:
        logger.warning("market_cache.redis_set_error", error=str(e))


# ══════════════════════════════════════════════════════════════════════════════
# MarketCache singleton — object-oriented interface used by StressTester
# ══════════════════════════════════════════════════════════════════════════════
_FULL_HIST_SENTINEL = 3650  # cache key sentinel for full AV history


class MarketCache:
    """
    Thin async wrapper over the module-level get_closes/set_closes functions.
    Exposes get_historical_range(ticker, start, end) for StressTester.
    """

    async def get_historical_range(self, ticker: str, start: str, end: str) -> pd.Series:
        """
        Return daily closes for *ticker* between *start* and *end* (YYYY-MM-DD).
        Fetches full AV history, caches it with the _FULL_HIST_SENTINEL key,
        then slices to the requested date range.
        Returns an empty Series on any failure — never raises.
        """
        import asyncio

        sym = ticker.upper()

        def _slice(s: pd.Series) -> pd.Series:
            """Slice s to [start, end] using string-cast index to prevent
            'Invalid comparison between dtype=int64 and str' in pandas 2.x."""
            if s.empty:
                return s
            try:
                idx = s.index.astype(str)
                mask = (idx >= start) & (idx <= end)
                return s.iloc[mask.values]
            except Exception:
                return s  # index cannot be compared — return unsliced

        # 1. Try the cache first (full-history key)
        cached = get_closes(sym, _FULL_HIST_SENTINEL)
        if cached is not None and not cached.empty:
            return _slice(cached)

        # 2. Fetch from Alpha Vantage in a thread (sync HTTP call)
        series = await asyncio.to_thread(self._fetch_av_full, sym)
        if not series.empty:
            set_closes(sym, _FULL_HIST_SENTINEL, series)

        return _slice(series)

    @staticmethod
    def _fetch_av_full(sym: str) -> pd.Series:
        """
        Synchronous full-history fetch.  Waterfall:
          1. AV TIME_SERIES_DAILY_ADJUSTED (outputsize=full)
          2. Finnhub /stock/candle  (5-year window)          — when AV is blocked
          3. Polygon /v2/aggs       (5-year window)          — when Finnhub also fails
        Returns an empty Series on complete failure — never raises.
        """
        import datetime as _dt

        import requests as _req

        av_key = settings.ALPHA_VANTAGE_API_KEY or ""

        # ── 1. Alpha Vantage ──────────────────────────────────────────────────
        if av_key:
            try:
                r = _req.get(
                    "https://www.alphavantage.co/query",
                    params={
                        "function": "TIME_SERIES_DAILY_ADJUSTED",
                        "symbol": sym.replace("-", "."),
                        "outputsize": "full",
                        "apikey": av_key,
                    },
                    timeout=20.0,
                )
                r.raise_for_status()
                payload = r.json()
                _av_msg = payload.get("Information", "") or payload.get("Note", "")
                if not _av_msg:
                    ts = payload.get("Time Series (Daily)", {})
                    if ts:
                        closes = {
                            d: float(v.get("5. adjusted close") or v.get("4. close") or 0)
                            for d, v in ts.items()
                            if v.get("5. adjusted close") or v.get("4. close")
                        }
                        series = pd.Series(closes, dtype=float).sort_index()
                        series.name = sym
                        return series
                else:
                    _reason = "premium" if "premium" in _av_msg.lower() else "rate-limit"
                    logger.warning("market_cache.av_blocked", symbol=sym, reason=_reason)
            except Exception as e:
                logger.warning("market_cache.av_fetch_error", symbol=sym, error=str(e))

        # ── 2. Finnhub fallback ───────────────────────────────────────────────
        fh_key = settings.FINNHUB_API_KEY or ""
        if fh_key:
            try:
                start_5y = (_dt.date.today() - _dt.timedelta(days=5 * 365)).isoformat()
                unix_from = int(_dt.datetime.strptime(start_5y, "%Y-%m-%d").timestamp())
                unix_to = int(_dt.datetime.now(_dt.UTC).timestamp())
                fh_sym = sym.replace(".", "-")
                r = _req.get(
                    "https://finnhub.io/api/v1/stock/candle",
                    params={
                        "symbol": fh_sym,
                        "resolution": "D",
                        "from": unix_from,
                        "to": unix_to,
                        "token": fh_key,
                    },
                    timeout=10.0,
                )
                data = r.json()
                if data.get("s") == "ok" and data.get("c"):
                    closes = {
                        _dt.date.fromtimestamp(ts).isoformat(): float(c)
                        for ts, c in zip(data["t"], data["c"], strict=False)
                        if _coerce_price(c) is not None
                    }
                    if closes:
                        series = pd.Series(closes, dtype=float).sort_index()
                        series.name = sym
                        logger.info(
                            "market_cache.finnhub_history_ok",
                            symbol=sym,
                            rows=len(series),
                        )
                        return series
            except Exception as e:
                logger.warning("market_cache.finnhub_fallback_error", symbol=sym, error=str(e))

        # ── 3. Polygon fallback ───────────────────────────────────────────────
        pg_key = settings.POLYGON_API_KEY or ""
        if pg_key:
            try:
                start_5y = (_dt.date.today() - _dt.timedelta(days=5 * 365)).isoformat()
                end_today = _dt.date.today().isoformat()
                r = _req.get(
                    f"https://api.polygon.io/v2/aggs/ticker/{sym}/range/1/day/{start_5y}/{end_today}",
                    params={
                        "adjusted": "true",
                        "sort": "asc",
                        "limit": 2000,
                        "apiKey": pg_key,
                    },
                    timeout=10.0,
                )
                if r.status_code == 200:
                    results = r.json().get("results") or []
                    if results:
                        closes = {
                            _dt.date.fromtimestamp(bar["t"] / 1000).isoformat(): float(bar["c"])
                            for bar in results
                            if _coerce_price(bar.get("c")) is not None
                        }
                        if closes:
                            series = pd.Series(closes, dtype=float).sort_index()
                            series.name = sym
                            logger.info(
                                "market_cache.polygon_history_ok",
                                symbol=sym,
                                rows=len(series),
                            )
                            return series
            except Exception as e:
                logger.warning("market_cache.polygon_fallback_error", symbol=sym, error=str(e))

        return pd.Series(dtype=float, name=sym)


# Module-level singleton — import as: from services.market_cache import market_cache
market_cache = MarketCache()


# ══════════════════════════════════════════════════════════════════════════════
# Ticker price cache — last-known-price fallback (Supabase-backed)
# ══════════════════════════════════════════════════════════════════════════════
_PRICE_CACHE_TABLE = "ticker_price_cache"


def _coerce_price(value: object) -> float | None:
    """Return a positive finite float, else None."""
    try:
        price = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    if not math.isfinite(price) or price <= 0:
        return None
    return price


def upsert_ticker_price_cache(symbol: str, price: float, source: str = "live") -> None:
    """Persist a known-good price to Supabase for future stale fallback."""
    safe_price = _coerce_price(price)
    if safe_price is None:
        return
    if not _SUPABASE_AVAILABLE:
        return
    try:
        sb = get_supabase_client()
        sb.table(_PRICE_CACHE_TABLE).upsert(
            {
                "symbol": symbol.upper(),
                "price": safe_price,
                "source": source,
                "recorded_at": datetime.datetime.now(datetime.UTC).isoformat(),
            },
            on_conflict="symbol",
        ).execute()
    except Exception as e:
        logger.warning("market_cache.pricecache_upsert_failed", symbol=symbol, error=str(e))


def get_ticker_price_cache(symbol: str) -> dict | None:
    """
    Return the last-known price row for *symbol* from Supabase, or None.
    Row shape: {symbol, price, source, recorded_at}
    """
    if not _SUPABASE_AVAILABLE:
        return None
    try:
        sb = get_supabase_client()
        row = (
            sb.table(_PRICE_CACHE_TABLE)
            .select("symbol, price, source, recorded_at")
            .eq("symbol", symbol.upper())
            .maybe_single()
            .execute()
        )
        if not row or not row.data:
            return None
        safe_price = _coerce_price(row.data.get("price"))
        if safe_price is None:
            return None
        row_data = dict(row.data)
        row_data["price"] = safe_price
        return row_data
    except Exception as e:
        logger.warning("market_cache.pricecache_get_failed", symbol=symbol, error=str(e))
        return None
