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

# Alpha Vantage free tier: 25 req/day, ~5 req/min.
# Set to 0 in production if using a paid key.
_AV_REQUEST_DELAY = float(os.environ.get("AV_REQUEST_DELAY", "1.2"))  # FIXED: default 1.2s throttle for free-tier rate limit


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
            timeout=12.0,
        )
        r.raise_for_status()
        payload = r.json()

        # AV returns an "Information" key when the API limit is hit
        if "Information" in payload:
            print(f"[RiskEngine] AV rate-limit hit for {sym_upper}: {payload['Information']}", file=sys.stderr)
            return pd.Series(dtype=float, name=sym_upper)

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
