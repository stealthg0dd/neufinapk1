"""
risk_engine.py — Institutional-grade quantitative risk engine for Neufin.

Public API
----------
# Institutional risk report (new)
build_risk_report(symbols, weights, threshold=0.70) -> dict

# DNA scoring pipeline (used by main.py → analyze_dna)
build_correlation_matrix(symbols)                    -> pd.DataFrame
find_correlation_clusters(matrix, weights, ...)      -> list[list[str]]
correlation_penalty_score(clusters, matrix)          -> tuple[float, float]
format_clusters_for_ai(clusters)                     -> str
"""

from __future__ import annotations

import asyncio
import os
import sys
import time
import requests
import numpy as np
import pandas as pd
from typing import Any
from dotenv import load_dotenv

# ── API key ────────────────────────────────────────────────────────────────────
ALPHA_VANTAGE_API_KEY = os.environ.get("ALPHA_VANTAGE_API_KEY")
if not ALPHA_VANTAGE_API_KEY:
    load_dotenv()
    ALPHA_VANTAGE_API_KEY = os.getenv("ALPHA_VANTAGE_API_KEY")

# ── Multi-tier cache (Redis 24h → Supabase 24h → in-process 1h) ───────────────
try:
    from services.market_cache import get_closes as _cache_get, set_closes as _cache_set
    _MARKET_CACHE_AVAILABLE = True
except Exception as _mc_err:
    print(f"[RiskEngine] market_cache unavailable ({_mc_err}) — using in-process cache", file=sys.stderr)
    _MARKET_CACHE_AVAILABLE = False
    # Legacy in-process fallback
    _CLOSES_CACHE: dict[str, tuple[pd.Series, float]] = {}
    _CACHE_TTL = 3600

# Alternative price providers — fallback chain when AV is rate-limited or premium-blocked
FINNHUB_API_KEY = os.environ.get("FINNHUB_API_KEY") or os.getenv("FINNHUB_API_KEY")
POLYGON_API_KEY = os.environ.get("POLYGON_API_KEY") or os.getenv("POLYGON_API_KEY")

# Alpha Vantage free tier: 25 req/day, ~5 req/min.
# Set to 0 in production if using a paid key.
_AV_REQUEST_DELAY = float(os.environ.get("AV_REQUEST_DELAY", "1.2"))

# ── Provider blacklist (batch-level skip for rate-limited providers) ───────────
# Maps provider name → expiry epoch.  When a provider signals rate-limit /
# quota exhaustion, all subsequent calls in this process skip it for 5 minutes.
_PROVIDER_SKIP: dict[str, float] = {}
_PROVIDER_SKIP_TTL = 300  # seconds


def _is_blacklisted(name: str) -> bool:
    """Return True if *name* is currently blacklisted (rate-limited)."""
    exp = _PROVIDER_SKIP.get(name)
    if exp is None:
        return False
    if time.time() > exp:
        del _PROVIDER_SKIP[name]
        return False
    return True


def _blacklist(name: str) -> None:
    """Mark *name* as rate-limited for _PROVIDER_SKIP_TTL seconds."""
    _PROVIDER_SKIP[name] = time.time() + _PROVIDER_SKIP_TTL
    print(
        f"[RiskEngine] Provider '{name}' blacklisted for {_PROVIDER_SKIP_TTL}s "
        "— skipping for remainder of batch.",
        file=sys.stderr,
    )


# ── Finnhub daily-closes fallback ─────────────────────────────────────────────
def _fetch_daily_closes_finnhub(sym: str, days: int = 60) -> pd.Series:
    """
    Finnhub /stock/candle daily closes — used when AV is rate-limited or premium-blocked.
    Returns an empty Series on any failure.
    """
    if not FINNHUB_API_KEY or _is_blacklisted('finnhub'):
        return pd.Series(dtype=float, name=sym.upper())
    sym_upper = sym.upper()
    try:
        import datetime as _dt
        unix_to   = int(_dt.datetime.utcnow().timestamp())
        unix_from = unix_to - int(days * 1.8 * 86_400)   # generous window to cover weekends
        r = requests.get(
            "https://finnhub.io/api/v1/stock/candle",
            params={
                "symbol":     sym_upper.replace(".", "-"),
                "resolution": "D",
                "from":       unix_from,
                "to":         unix_to,
                "token":      FINNHUB_API_KEY,
            },
            timeout=8.0,
        )
        if r.status_code == 429:
            _blacklist('finnhub')
            return pd.Series(dtype=float, name=sym_upper)
        data = r.json()
        if data.get("s") != "ok" or not data.get("c"):
            return pd.Series(dtype=float, name=sym_upper)
        closes = {
            _dt.date.fromtimestamp(ts).isoformat(): c
            for ts, c in zip(data["t"], data["c"])
        }
        series = pd.Series(closes, dtype=float).sort_index().tail(days)
        series.name = sym_upper
        if _MARKET_CACHE_AVAILABLE:
            _cache_set(sym_upper, days, series)
        return series
    except Exception as e:
        print(f"[RiskEngine] Finnhub fallback failed for {sym_upper}: {e}", file=sys.stderr)
        return pd.Series(dtype=float, name=sym_upper)


# ── Polygon daily-closes fallback ─────────────────────────────────────────────
def _fetch_daily_closes_polygon(sym: str, days: int = 60) -> pd.Series:
    """
    Polygon /v2/aggs compact daily closes — second-tier fallback after Finnhub.
    Returns an empty Series on any failure.
    """
    if not POLYGON_API_KEY or _is_blacklisted('polygon'):
        return pd.Series(dtype=float, name=sym.upper())
    sym_upper = sym.upper()
    try:
        import datetime as _dt
        date_to   = _dt.date.today().isoformat()
        date_from = (_dt.date.today() - _dt.timedelta(days=int(days * 1.8))).isoformat()
        r = requests.get(
            f"https://api.polygon.io/v2/aggs/ticker/{sym_upper}/range/1/day/{date_from}/{date_to}",
            params={"adjusted": "true", "sort": "asc", "limit": 300, "apiKey": POLYGON_API_KEY},
            timeout=10.0,
        )
        if r.status_code == 429:
            _blacklist('polygon')
            return pd.Series(dtype=float, name=sym_upper)
        if r.status_code != 200:
            return pd.Series(dtype=float, name=sym_upper)
        data    = r.json()
        results = data.get("results") or []
        if not results:
            return pd.Series(dtype=float, name=sym_upper)
        closes = {
            _dt.date.fromtimestamp(bar["t"] / 1000).isoformat(): bar["c"]
            for bar in results
        }
        series = pd.Series(closes, dtype=float).sort_index().tail(days)
        series.name = sym_upper
        if _MARKET_CACHE_AVAILABLE:
            _cache_set(sym_upper, days, series)
        return series
    except Exception as e:
        print(f"[RiskEngine] Polygon fallback failed for {sym_upper}: {e}", file=sys.stderr)
        return pd.Series(dtype=float, name=sym_upper)


# ── Ticker normalisation ───────────────────────────────────────────────────────
def _av_ticker(sym: str) -> str:
    """
    Normalise a user-supplied ticker for Alpha Vantage.
    BRK-B  →  BRK.B
    brk.b  →  BRK.B
    """
    return sym.replace("-", ".").upper()


# ── Data layer ─────────────────────────────────────────────────────────────────
def _fetch_daily_closes_av(sym: str, days: int = 60) -> pd.Series:
    """
    Fetch the last *days* adjusted daily closes for *sym* via
    Alpha Vantage TIME_SERIES_DAILY_ADJUSTED (compact = 100 rows).

    Cache hierarchy: Redis 24h → Supabase 24h → in-process 1h.
    Returns an empty pd.Series on any failure — never raises.
    """
    sym_upper = sym.upper()

    # ── Multi-tier cache lookup ────────────────────────────────────────────────
    if _MARKET_CACHE_AVAILABLE:
        cached = _cache_get(sym_upper, days)
        if cached is not None:
            return cached
    else:
        cache_key = f"{sym_upper}:{days}"
        _cached = _CLOSES_CACHE.get(cache_key)
        if _cached and (time.time() - _cached[1]) < _CACHE_TTL:
            return _cached[0]

    # ── Batch blacklist check: skip AV entirely if it was rate-limited earlier ──
    if _is_blacklisted('av'):
        series = _fetch_daily_closes_finnhub(sym_upper, days)
        return series if not series.empty else _fetch_daily_closes_polygon(sym_upper, days)

    if not ALPHA_VANTAGE_API_KEY:
        print(f"[RiskEngine] ALPHA_VANTAGE_API_KEY not set — skipping {sym_upper}", file=sys.stderr)
        return pd.Series(dtype=float, name=sym_upper)

    if _AV_REQUEST_DELAY > 0:
        time.sleep(_AV_REQUEST_DELAY)

    try:
        r = requests.get(
            "https://www.alphavantage.co/query",
            params={
                "function":   "TIME_SERIES_DAILY_ADJUSTED",
                "symbol":     _av_ticker(sym_upper),
                "outputsize": "compact",   # last 100 trading days
                "apikey":     ALPHA_VANTAGE_API_KEY,
            },
            timeout=20.0,
        )
        r.raise_for_status()
        payload = r.json()

        # AV returns "Information" for rate-limits / "Note" for premium/quota blocks
        _av_msg = payload.get("Information", "") or payload.get("Note", "")
        if _av_msg:
            _reason = "premium endpoint" if "premium" in _av_msg.lower() else "rate-limit"
            print(f"[RiskEngine] AV {_reason} for {sym_upper} — blacklisting AV, trying Finnhub→Polygon", file=sys.stderr)
            _blacklist('av')
            series = _fetch_daily_closes_finnhub(sym_upper, days)
            if not series.empty:
                return series
            return _fetch_daily_closes_polygon(sym_upper, days)

        ts_data = payload.get("Time Series (Daily)", {})
        if not ts_data:
            print(f"[RiskEngine] No time-series data returned for {sym_upper}", file=sys.stderr)
            return pd.Series(dtype=float, name=sym_upper)

        # "5. adjusted close" — fall back to "4. close" for non-adjusted feeds
        closes: dict[str, float] = {}
        for date_str, ohlcv in ts_data.items():
            price_str = ohlcv.get("5. adjusted close") or ohlcv.get("4. close")
            if price_str:
                closes[date_str] = float(price_str)

        if not closes:
            return pd.Series(dtype=float, name=sym_upper)

        series = pd.Series(closes, dtype=float).sort_index().tail(days)
        series.name = sym_upper

        # Write to all cache tiers
        if _MARKET_CACHE_AVAILABLE:
            _cache_set(sym_upper, days, series)
        else:
            _CLOSES_CACHE[cache_key] = (series, time.time())  # type: ignore[possibly-undefined]

        return series

    except requests.RequestException as e:
        print(f"[RiskEngine] HTTP error fetching {sym_upper}: {e}", file=sys.stderr)
    except Exception as e:
        print(f"[RiskEngine] Unexpected error for {sym_upper}: {e}", file=sys.stderr)

    return pd.Series(dtype=float, name=sym_upper)


# ── Quantitative core ──────────────────────────────────────────────────────────
def _compute_returns(price_df: pd.DataFrame) -> pd.DataFrame:
    """Compute daily percentage returns, drop the first NaN row."""
    return price_df.pct_change().dropna()


def _pearson_matrix(returns_df: pd.DataFrame) -> pd.DataFrame:
    """Pearson correlation matrix of daily returns."""
    return returns_df.corr(method="pearson")


def _effective_number_of_bets(
    corr_matrix: pd.DataFrame,
    weights: dict[str, float],
) -> float:
    """
    Effective Number of Bets (diversification index):

        N_eff = 1 / Σ_i Σ_j  w_i * w_j * ρ_ij

    where the sum runs over all i, j (including i == j where ρ_ii = 1).

    Interpretation:
        N_eff = 1   → single undiversified bet
        N_eff = n   → n perfectly uncorrelated, equal-weight bets

    Returns 0.0 if the denominator is zero or the matrix is empty.
    """
    symbols = list(corr_matrix.columns)
    if not symbols:
        return 0.0

    # Build weight vector aligned to matrix columns
    w = np.array([weights.get(s, 0.0) for s in symbols], dtype=float)
    total = w.sum()
    if total <= 0:
        return 0.0
    w = w / total  # normalise

    rho = corr_matrix.values.astype(float)
    denominator = float(w @ rho @ w)  # scalar: Σ_ij w_i ρ_ij w_j
    if denominator <= 0:
        return 0.0
    return round(1.0 / denominator, 4)


# ── Institutional risk report ──────────────────────────────────────────────────
def build_risk_report(
    symbols: list[str],
    weights: dict[str, float],
    threshold: float = 0.70,
    days: int = 60,
) -> dict[str, Any]:
    """
    Build a full institutional risk report for *symbols*.

    Parameters
    ----------
    symbols   : list of ticker strings (e.g. ["AAPL", "MSFT", "BRK-B"])
    weights   : {symbol: portfolio_weight} — used for N_eff and cluster ranking.
                Weights need not sum to 1; they are normalised internally.
    threshold : Pearson ρ above which a pair is flagged as a risk cluster (default 0.70).
    days      : lookback window in trading days (default 60).

    Returns
    -------
    {
      "symbols_requested":  list[str],
      "symbols_used":       list[str],      # subset with sufficient data
      "symbols_failed":     list[str],      # tickers dropped due to fetch errors
      "correlation_matrix": dict,           # nested dict of all (i, j) correlations
      "risk_clusters":      list[dict],     # pairs with |ρ| > threshold
      "diversification_index": float,       # Effective Number of Bets
      "avg_pairwise_correlation": float,    # mean |ρ| off-diagonal
      "metadata": dict,
    }
    """
    symbols_upper = [s.upper() for s in symbols]

    # 1. Fetch price series for all symbols
    price_series: dict[str, pd.Series] = {}
    failed: list[str] = []
    for sym in symbols_upper:
        s = _fetch_daily_closes_av(sym, days=days)
        if len(s) >= max(10, days // 6):   # need at least 1/6 of window
            price_series[sym] = s
        else:
            failed.append(sym)
            if sym not in [s.upper() for s in symbols]:
                print(f"[RiskEngine] {sym} dropped — insufficient data ({len(s)} rows)", file=sys.stderr)

    symbols_used: list[str] = list(price_series.keys())

    # 2. Build aligned price DataFrame → returns → correlation matrix
    if len(symbols_used) < 2:
        return {
            "symbols_requested":        symbols_upper,
            "symbols_used":             symbols_used,
            "symbols_failed":           failed,
            "correlation_matrix":       {},
            "risk_clusters":            [],
            "diversification_index":    0.0,
            "avg_pairwise_correlation": 0.0,
            "metadata": {"error": "Fewer than 2 symbols had sufficient data."},
        }

    price_df   = pd.DataFrame(price_series).dropna()
    returns_df = _compute_returns(price_df)
    corr_df    = _pearson_matrix(returns_df)

    # 3. Flatten correlation matrix to nested dict
    corr_dict: dict[str, dict[str, float]] = {}
    for row_sym in corr_df.index:
        corr_dict[row_sym] = {}
        for col_sym in corr_df.columns:
            val = corr_df.loc[row_sym, col_sym]
            corr_dict[row_sym][col_sym] = round(float(val), 4) if not np.isnan(val) else None

    # 4. Identify risk clusters: all unique pairs with |ρ| > threshold
    risk_clusters: list[dict[str, Any]] = []
    cols = list(corr_df.columns)
    for i in range(len(cols)):
        for j in range(i + 1, len(cols)):
            rho = corr_df.iloc[i, j]
            if not np.isnan(rho) and abs(rho) > threshold:
                risk_clusters.append({
                    "symbol_a":    cols[i],
                    "symbol_b":    cols[j],
                    "correlation": round(float(rho), 4),
                    "risk_flag":   "HIGH_POSITIVE" if rho > 0 else "HIGH_NEGATIVE",
                })

    # Sort descending by absolute correlation
    risk_clusters.sort(key=lambda x: abs(x["correlation"]), reverse=True)

    # 5. Average off-diagonal |ρ|
    n = len(cols)
    off_diag_values = [
        abs(corr_df.iloc[i, j])
        for i in range(n)
        for j in range(i + 1, n)
        if not np.isnan(corr_df.iloc[i, j])
    ]
    avg_pairwise = round(float(np.mean(off_diag_values)), 4) if off_diag_values else 0.0

    # 6. Effective Number of Bets (sub-matrix for used symbols only)
    used_weights = {s: weights.get(s, 1.0 / len(symbols_used)) for s in symbols_used}
    n_eff = _effective_number_of_bets(corr_df, used_weights)

    return {
        "symbols_requested":        symbols_upper,
        "symbols_used":             symbols_used,
        "symbols_failed":           failed,
        "correlation_matrix":       corr_dict,
        "risk_clusters":            risk_clusters,
        "diversification_index":    n_eff,
        "avg_pairwise_correlation": avg_pairwise,
        "metadata": {
            "lookback_days":       days,
            "threshold":           threshold,
            "num_risk_pairs":      len(risk_clusters),
            "returns_observations": len(returns_df),
        },
    }


# ── DNA scoring pipeline (called by main.py → analyze_dna) ────────────────────
def build_correlation_matrix(symbols: list[str]) -> pd.DataFrame:
    """
    Fetch 60-day adjusted closes for *symbols* and return a Pearson
    correlation matrix.  Symbols with < 10 rows are silently excluded.
    Returns an empty DataFrame when < 2 symbols have sufficient data.
    """
    all_series: dict[str, pd.Series] = {}
    for sym in symbols:
        s = _fetch_daily_closes_av(sym, days=60)
        if len(s) >= 10:
            all_series[sym] = s

    if len(all_series) < 2:
        return pd.DataFrame()

    price_df   = pd.DataFrame(all_series).dropna()
    returns_df = _compute_returns(price_df)
    return _pearson_matrix(returns_df)


def build_correlation_matrix_from_series(
    price_series: dict[str, pd.Series],
    min_rows: int = 10,
) -> pd.DataFrame:
    """
    Build a Pearson correlation matrix from *pre-fetched* price series.
    Avoids redundant HTTP calls when data is already available.
    Returns an empty DataFrame when < 2 symbols have sufficient data.
    """
    valid = {sym: s for sym, s in price_series.items() if len(s) >= min_rows}
    if len(valid) < 2:
        return pd.DataFrame()
    price_df   = pd.DataFrame(valid).dropna()
    returns_df = _compute_returns(price_df)
    return _pearson_matrix(returns_df)


async def fetch_all_closes(
    symbols: list[str],
    days: int = 60,
) -> dict[str, pd.Series]:
    """
    Fetch daily closes for *all* symbols **in parallel** using asyncio.gather.

    Each symbol runs in its own thread-pool slot via asyncio.to_thread so the
    event loop is never blocked.  The module-level provider blacklist ensures
    that once Alpha Vantage (or Finnhub) signals rate-limiting, every
    *subsequent* call in the batch skips that provider immediately — instead
    of retrying it for every remaining ticker.

    Returns a dict mapping upper-case symbol → pd.Series (may be empty on failure).
    """
    syms_upper = [s.upper() for s in symbols]
    results: list[pd.Series] = await asyncio.gather(*[
        asyncio.to_thread(_fetch_daily_closes_av, sym, days)
        for sym in syms_upper
    ])
    return dict(zip(syms_upper, results))


def find_correlation_clusters(
    corr_matrix: pd.DataFrame,
    weights: dict[str, float],
    threshold: float = 0.75,
    top_n: int = 5,
) -> list[list[str]]:
    """
    Union-Find clustering of the top-N holdings (by weight) where
    pairwise |ρ| ≥ threshold.

    Returns a list of clusters; each cluster is a sorted list of tickers.
    """
    if corr_matrix.empty or len(corr_matrix.columns) < 2:
        return []

    ranked = sorted(
        [s for s in corr_matrix.columns if s in weights],
        key=lambda s: weights.get(s, 0.0),
        reverse=True,
    )[:top_n]

    if len(ranked) < 2:
        return []

    sub = corr_matrix.loc[ranked, ranked]
    clusters: list[set[str]] = []

    for i, a in enumerate(sub.columns):
        for j, b in enumerate(sub.columns):
            if j <= i:
                continue
            if abs(sub.loc[a, b]) >= threshold:
                merged = False
                for cluster in clusters:
                    if a in cluster or b in cluster:
                        cluster.add(a)
                        cluster.add(b)
                        merged = True
                        break
                if not merged:
                    clusters.append({a, b})

    return [sorted(list(c)) for c in clusters]


def correlation_penalty_score(
    clusters: list[list[str]],
    corr_matrix: pd.DataFrame,
) -> tuple[float, float]:
    """
    Compute the DNA correlation score component (0–30 pts) and mean |ρ|.

    Penalty: 5 pts per symbol that belongs to a correlated cluster, max 30.
    Returns (score, avg_corr).
    """
    if not corr_matrix.empty and len(corr_matrix) > 1:
        n = len(corr_matrix)
        off_diag = [
            abs(corr_matrix.iloc[i, j])
            for i in range(n)
            for j in range(i + 1, n)
            if not np.isnan(corr_matrix.iloc[i, j])
        ]
        avg_corr = float(np.mean(off_diag)) if off_diag else 0.0
    else:
        avg_corr = 0.0

    total_clustered = sum(len(c) for c in clusters)
    penalty = min(30.0, total_clustered * 5.0)
    score   = round(max(0.0, 30.0 - penalty), 2)
    return score, round(avg_corr, 3)


def format_clusters_for_ai(clusters: list[list[str]]) -> str:
    """Format correlation clusters as human-readable text for AI prompt injection."""
    if not clusters:
        return "No significant correlation clusters detected among the top 5 holdings."

    lines = ["High-correlation risk clusters detected (Pearson r ≥ 0.75):"]
    for i, cluster in enumerate(clusters, 1):
        tickers = ", ".join(cluster)
        lines.append(
            f"  Cluster {i}: {tickers} — these positions move in lockstep, "
            "amplifying drawdown risk during market stress."
        )
    return "\n".join(lines)
