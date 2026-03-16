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

import io
import json
import sys
import time
import datetime
from typing import Optional

import pandas as pd

# ── Optional Redis ─────────────────────────────────────────────────────────────
try:
    import redis as _redis_lib
    _REDIS_AVAILABLE = True
except ImportError:
    _REDIS_AVAILABLE = False
    print("[MarketCache] redis-py not installed — Redis tier disabled", file=sys.stderr)

# ── Optional Supabase ──────────────────────────────────────────────────────────
try:
    from database import get_supabase_client
    _SUPABASE_AVAILABLE = True
except Exception:
    _SUPABASE_AVAILABLE = False
    print("[MarketCache] Supabase client unavailable — Supabase tier disabled", file=sys.stderr)

# ── Config ─────────────────────────────────────────────────────────────────────
import os
from dotenv import load_dotenv
load_dotenv()

REDIS_URL        = os.environ.get("REDIS_URL", "")
_REDIS_TTL       = 86_400        # 24 hours
_SUPABASE_TTL    = 86_400        # 24 hours
_MEMORY_TTL      = 3_600         # 1 hour  (in-process tier)
_TABLE           = "market_data_cache"

# ── In-process fallback ────────────────────────────────────────────────────────
_MEMORY: dict[str, tuple[pd.Series, float]] = {}   # key → (series, epoch_ts)

# ── Redis singleton ────────────────────────────────────────────────────────────
_redis_client: Optional[object] = None

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
            print(f"[MarketCache] Redis connection failed: {e}", file=sys.stderr)
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

def get_closes(symbol: str, days: int) -> Optional[pd.Series]:
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
                print(f"[MarketCache] Redis HIT {k}", file=sys.stderr)
                return _json_to_series(raw)
        except Exception as e:
            print(f"[MarketCache] Redis GET error: {e}", file=sys.stderr)

    # ── Tier-2: Supabase ──────────────────────────────────────────────────────
    if _SUPABASE_AVAILABLE:
        try:
            sb = get_supabase_client()
            now_iso = datetime.datetime.utcnow().isoformat()
            row = (
                sb.table(_TABLE)
                .select("payload")
                .eq("cache_key", k)
                .gt("expires_at", now_iso)
                .maybe_single()
                .execute()
            )
            if row is not None and row.data:  # FIXED: guard against None response from maybe_single()
                series = _json_to_series(row.data["payload"])
                print(f"[MarketCache] Supabase HIT {k}", file=sys.stderr)
                # Backfill Redis so the next hit is faster
                _redis_set(k, row.data["payload"])
                return series
        except Exception as e:
            print(f"[MarketCache] Supabase GET error: {e}", file=sys.stderr)

    # ── Tier-3: In-process memory ─────────────────────────────────────────────
    entry = _MEMORY.get(k)
    if entry and (time.time() - entry[1]) < _MEMORY_TTL:
        print(f"[MarketCache] Memory HIT {k}", file=sys.stderr)
        return entry[0]

    return None


def set_closes(symbol: str, days: int, series: pd.Series) -> None:
    """
    Persist daily closes to all available cache tiers.
    """
    k   = _key(symbol, days)
    raw = _series_to_json(series)

    # Tier-1: Redis
    _redis_set(k, raw)

    # Tier-2: Supabase
    if _SUPABASE_AVAILABLE:
        try:
            sb  = get_supabase_client()
            exp = (datetime.datetime.utcnow() + datetime.timedelta(seconds=_SUPABASE_TTL)).isoformat()
            sb.table(_TABLE).upsert(
                {"cache_key": k, "payload": raw, "expires_at": exp},
                on_conflict="cache_key",
            ).execute()
        except Exception as e:
            print(f"[MarketCache] Supabase SET error: {e}", file=sys.stderr)

    # Tier-3: memory
    _MEMORY[k] = (series, time.time())


def _redis_set(k: str, raw: str) -> None:
    r = _get_redis()
    if r is None:
        return
    try:
        r.setex(k, _REDIS_TTL, raw)  # type: ignore[attr-defined]
    except Exception as e:
        print(f"[MarketCache] Redis SET error: {e}", file=sys.stderr)


# ══════════════════════════════════════════════════════════════════════════════
# MarketCache singleton — object-oriented interface used by StressTester
# ══════════════════════════════════════════════════════════════════════════════
_FULL_HIST_SENTINEL = 3650   # cache key sentinel for full AV history

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
                return s   # index cannot be compared — return unsliced

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
        """Synchronous AV TIME_SERIES_DAILY_ADJUSTED full history fetch."""
        import requests as _req
        av_key = os.environ.get("ALPHA_VANTAGE_API_KEY", "") or os.getenv("ALPHA_VANTAGE_API_KEY", "")
        if not av_key:
            return pd.Series(dtype=float, name=sym)
        try:
            r = _req.get(
                "https://www.alphavantage.co/query",
                params={
                    "function":   "TIME_SERIES_DAILY_ADJUSTED",
                    "symbol":     sym.replace("-", "."),
                    "outputsize": "full",
                    "apikey":     av_key,
                },
                timeout=20.0,
            )
            r.raise_for_status()
            payload = r.json()
            if "Information" in payload:
                print(f"[MarketCache] AV rate-limit for {sym}", file=sys.stderr)
                return pd.Series(dtype=float, name=sym)
            ts = payload.get("Time Series (Daily)", {})
            closes = {
                d: float(v.get("5. adjusted close") or v.get("4. close") or 0)
                for d, v in ts.items()
                if v.get("5. adjusted close") or v.get("4. close")
            }
            series = pd.Series(closes, dtype=float).sort_index()
            series.name = sym
            return series
        except Exception as e:
            print(f"[MarketCache] AV full-history fetch failed for {sym}: {e}", file=sys.stderr)
            return pd.Series(dtype=float, name=sym)


# Module-level singleton — import as: from services.market_cache import market_cache
market_cache = MarketCache()
