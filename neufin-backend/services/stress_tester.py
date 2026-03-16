"""
stress_tester.py — Historical regime stress-testing for the Neufin Swarm.

Three hardcoded scenarios with precise date ranges:

  2022_RATE_SHOCK    Inflationary Trap       Jan 2022 – Oct 2022    S&P −25.4%
  2020_LIQUIDITY     Pandemic Crash          Feb 2020 – Apr 2020    S&P −33.9%
  2024_AI_ROTATION   Growth Correction       Jul 2024 – Aug 2024    S&P  −8.5%
                     (Japan Carry Trade Unwind + AI valuation reset)

For each scenario:
  - Fetch start/end prices using market_cache (full AV history, 24h TTL).
  - Compute weighted portfolio return: Σ(weight_i × return_i).
  - Identify the 'Weakest Link': the position with the largest negative
    weighted contribution (weight_i × return_i, most negative).
  - Build a MD-ready narrative string for the IC Briefing.

compute_factor_metrics() returns per-symbol 60-day:
  - beta        (from AV OVERVIEW via fetch_beta — same values quant_node uses)
  - spy_correlation (Pearson ρ to SPY daily returns)
  - risk_tier   HIGH | MEDIUM | LOW
Used by the frontend RiskMatrix Cluster Map (X=Beta, Y=SPY Correlation).
"""

from __future__ import annotations

import os
import sys
import time
import datetime
import requests
import asyncio
import numpy as np
import pandas as pd
from dotenv import load_dotenv

load_dotenv()  # No-op when Railway injects env vars; loads .env in local dev

ALPHA_VANTAGE_API_KEY = os.environ.get("ALPHA_VANTAGE_API_KEY")
POLYGON_API_KEY       = os.environ.get("POLYGON_API_KEY")
FINNHUB_API_KEY       = os.environ.get("FINNHUB_API_KEY")

try:
    from services.market_cache import get_closes as _cache_get, set_closes as _cache_set
    _CACHE_AVAILABLE = True
except Exception:
    _CACHE_AVAILABLE = False

_FULL_HIST_DAYS = 3650          # sentinel key for "full" history in market_cache
_LOCAL_FULL: dict[str, tuple[pd.Series, float]] = {}
_LOCAL_TTL  = 86_400
_AV_DELAY   = float(os.environ.get("AV_REQUEST_DELAY", "0.0"))


# ══════════════════════════════════════════════════════════════════════════════
# Scenario definitions
# ══════════════════════════════════════════════════════════════════════════════
SCENARIOS: dict[str, dict] = {
    "2022_RATE_SHOCK": {
        "key":            "2022_RATE_SHOCK",
        "scenario_name":  "Inflationary Trap",
        "label":          "'22 Rate Shock",
        "short_label":    "2022-style rate shock",
        "start":          "2022-01-03",
        "end":            "2022-10-12",
        "description":    "Fed tightening cycle: 425bp hike campaign — S&P 500 fell 25.4%, "
                          "growth/tech equities fell >40%, bonds offered no shelter.",
        "spy_return_pct": -25.4,
        "regime":         "Inflationary",
    },
    "2020_LIQUIDITY": {
        "key":            "2020_LIQUIDITY",
        "scenario_name":  "Pandemic Crash",
        "label":          "'20 COVID Crash",
        "short_label":    "2020-style liquidity trap",
        "start":          "2020-02-19",
        "end":            "2020-04-07",
        "description":    "COVID-19 demand shock: S&P 500 fell 33.9% in 33 days, "
                          "followed by a violent 15% bounce to April 7. All sectors fell.",
        "spy_return_pct": -20.0,   # trough-to-April-7 partial recovery period
        "regime":         "Crisis",
    },
    "2024_AI_CORRECTION": {
        "key":            "2024_AI_CORRECTION",
        "scenario_name":  "Growth Correction",
        "label":          "'24 AI Rotation",
        "short_label":    "2024-style AI rotation",
        "start":          "2024-07-10",
        "end":            "2024-08-07",
        "description":    "Japan BOJ rate hike triggered a yen carry-trade unwind. "
                          "Combined with AI valuation concerns, Nasdaq fell 12%, "
                          "NVDA fell 35% from peak. The sharpest correction since 2022.",
        "spy_return_pct": -8.5,
        "regime":         "Growth Correction",
    },
}


# ══════════════════════════════════════════════════════════════════════════════
# Data layer
# ══════════════════════════════════════════════════════════════════════════════
def _av_ticker(sym: str) -> str:
    return sym.replace("-", ".").upper()


def _fetch_full_history(sym: str) -> pd.Series:
    """
    Full AV TIME_SERIES_DAILY_ADJUSTED history, cached 24h.
    Returns an empty Series on failure — never raises.
    """
    sym_upper = sym.upper()

    if _CACHE_AVAILABLE:
        cached = _cache_get(sym_upper, _FULL_HIST_DAYS)
        if cached is not None:
            return cached

    entry = _LOCAL_FULL.get(sym_upper)
    if entry and (time.time() - entry[1]) < _LOCAL_TTL:
        return entry[0]

    if not ALPHA_VANTAGE_API_KEY:
        return pd.Series(dtype=float, name=sym_upper)

    if _AV_DELAY > 0:
        time.sleep(_AV_DELAY)

    try:
        r = requests.get(
            "https://www.alphavantage.co/query",
            params={
                "function":   "TIME_SERIES_DAILY_ADJUSTED",
                "symbol":     _av_ticker(sym_upper),
                "outputsize": "full",
                "apikey":     ALPHA_VANTAGE_API_KEY,
            },
            timeout=20.0,
        )
        r.raise_for_status()
        payload = r.json()

        _av_msg = payload.get("Information", "") or payload.get("Note", "")
        if _av_msg:
            _reason = "premium endpoint" if "premium" in _av_msg.lower() else "rate-limit"
            print(f"[StressTester] AV {_reason} for {sym_upper} — skipping: {_av_msg[:120]}", file=sys.stderr)
            return pd.Series(dtype=float, name=sym_upper)

        ts = payload.get("Time Series (Daily)", {})
        if not ts:
            return pd.Series(dtype=float, name=sym_upper)

        closes = {
            d: float(v.get("5. adjusted close") or v.get("4. close") or 0)
            for d, v in ts.items()
            if v.get("5. adjusted close") or v.get("4. close")
        }
        series = pd.Series(closes, dtype=float).sort_index()
        series.name = sym_upper

        if _CACHE_AVAILABLE:
            _cache_set(sym_upper, _FULL_HIST_DAYS, series)
        _LOCAL_FULL[sym_upper] = (series, time.time())
        return series

    except Exception as e:
        print(f"[StressTester] full-history fetch failed for {sym_upper}: {e}", file=sys.stderr)
        return pd.Series(dtype=float, name=sym_upper)


def _price_on_or_after(s: pd.Series, date_str: str) -> float | None:
    """Return the first close on or after date_str, or None if unavailable.

    Converts the index to str before comparison so a RangeIndex(int64) —
    which arises from an empty/un-indexed Series stored in cache — never
    raises 'Invalid comparison between dtype=int64 and str'.
    """
    if s is None or s.empty:
        return None
    try:
        idx = s.index.astype(str)
        mask = idx >= date_str
        c = s.iloc[mask.values]
    except Exception:
        return None
    return float(c.iloc[0]) if not c.empty else None


def _price_on_or_before(s: pd.Series, date_str: str) -> float | None:
    """Return the last close on or before date_str, or None if unavailable.

    Same int64-RangeIndex guard as _price_on_or_after.
    """
    if s is None or s.empty:
        return None
    try:
        idx = s.index.astype(str)
        mask = idx <= date_str
        c = s.iloc[mask.values]
    except Exception:
        return None
    return float(c.iloc[-1]) if not c.empty else None


# ══════════════════════════════════════════════════════════════════════════════
# Core stress-test engine
# ══════════════════════════════════════════════════════════════════════════════
def run_stress_tests(
    symbols:    list[str],
    weights:    dict[str, float],
    ticker_data: list[dict] | None = None,   # optional — for sector tagging
) -> list[dict]:
    """
    Returns one result dict per scenario:
    {
      key, scenario_name, label, short_label, start, end, description,
      spy_return_pct, regime,
      portfolio_return_pct,
      outperformance_vs_spy_pct,
      weakest_link: {symbol, return_pct, weighted_contribution_pct, weight_pct},
      per_symbol: [{symbol, return_pct, weighted_contribution_pct, weight_pct, data_available}],
      data_coverage_pct,
      md_narrative,           # pre-formed string for the IC Briefing MD
    }
    """
    results: list[dict] = []

    for scenario in SCENARIOS.values():
        start = scenario["start"]
        end   = scenario["end"]

        per_sym: list[dict] = []
        weighted_return = 0.0
        covered_weight  = 0.0

        for sym in symbols:
            w  = weights.get(sym, 0.0)
            s  = _fetch_full_history(sym)
            p0 = _price_on_or_after(s, start)
            p1 = _price_on_or_before(s, end)

            if p0 and p1 and p0 > 0:
                ret         = (p1 / p0 - 1) * 100
                contribution = w * ret
                weighted_return += contribution
                covered_weight  += w
                per_sym.append({
                    "symbol":                  sym,
                    "return_pct":              round(ret, 2),
                    "weighted_contribution_pct": round(contribution, 2),
                    "weight_pct":              round(w * 100, 1),
                    "data_available":          True,
                })
            else:
                per_sym.append({
                    "symbol":                  sym,
                    "return_pct":              None,
                    "weighted_contribution_pct": None,
                    "weight_pct":              round(w * 100, 1),
                    "data_available":          False,
                })

        if covered_weight > 0 and covered_weight < 1.0:
            weighted_return = weighted_return / covered_weight

        # Weakest Link — largest negative weighted contribution
        negative = [p for p in per_sym if p["weighted_contribution_pct"] is not None and p["weighted_contribution_pct"] < 0]
        weakest_link: dict = {}
        if negative:
            wl = min(negative, key=lambda x: x["weighted_contribution_pct"])
            weakest_link = {
                "symbol":                  wl["symbol"],
                "return_pct":              wl["return_pct"],
                "weighted_contribution_pct": wl["weighted_contribution_pct"],
                "weight_pct":              wl["weight_pct"],
            }

        spy_ret     = scenario["spy_return_pct"]
        port_ret    = round(weighted_return, 2)
        outperf     = round(port_ret - spy_ret, 2)
        cov_pct     = round(covered_weight * 100, 1)

        # Identify tech concentration for narrative
        tech_syms   = [p for p in per_sym if p["data_available"]]
        tech_weight = sum(p["weight_pct"] for p in tech_syms if p["symbol"] in {
            "AAPL","MSFT","NVDA","GOOGL","META","AMZN","TSLA","AMD","AVGO","QCOM","CRM","ORCL",
        })

        wl_clause = (
            f", with {weakest_link['symbol']} as the primary drag "
            f"({weakest_link['weighted_contribution_pct']:+.1f}% contribution)"
            if weakest_link else ""
        )

        md_narrative = (
            f"In a {scenario['short_label']}, this portfolio's current "
            f"{tech_weight:.0f}% tech-adjacent concentration would result in a "
            f"{port_ret:+.1f}% peak-to-trough return (vs. S&P {spy_ret:+.1f}%), "
            f"representing a {outperf:+.1f}% alpha versus the index{wl_clause}."
        )

        results.append({
            **scenario,
            "portfolio_return_pct":       port_ret,
            "outperformance_vs_spy_pct":  outperf,
            "weakest_link":               weakest_link,
            "per_symbol":                 per_sym,
            "data_coverage_pct":          cov_pct,
            "md_narrative":               md_narrative,
        })

    return results


# ══════════════════════════════════════════════════════════════════════════════
# Factor metrics for Cluster Map (X=Beta, Y=SPY Correlation)
# ══════════════════════════════════════════════════════════════════════════════
def compute_factor_metrics(
    symbols:  list[str],
    weights:  dict[str, float],
    beta_map: dict[str, float] | None = None,  # from quant_node — skip re-fetch if provided
    days:     int = 60,
) -> list[dict]:
    """
    Per-symbol factor metrics for the RiskMatrix Cluster Map.

    Returns:
    [{
      symbol, weight_pct,
      beta,              # AV OVERVIEW beta (passed in or fetched)
      spy_correlation,   # 60-day Pearson ρ to SPY daily returns
      risk_tier,         # "HIGH" | "MEDIUM" | "LOW"
    }]
    """
    # Fetch betas if not supplied
    if beta_map is None:
        try:
            from services.calculator import fetch_beta
            beta_map = {s: fetch_beta(s) for s in symbols}
        except Exception:
            beta_map = {s: 1.0 for s in symbols}

    # Fetch 60-day closes for SPY correlation
    all_syms = list(set(symbols + ["SPY"]))
    series_map: dict[str, pd.Series] = {}
    try:
        from services.risk_engine import _fetch_daily_closes_av
        for sym in all_syms:
            s = _fetch_daily_closes_av(sym, days=days)
            if len(s) >= 10:
                series_map[sym] = s
    except Exception as e:
        print(f"[StressTester] factor metrics fetch error: {e}", file=sys.stderr)

    spy_corr_map: dict[str, float] = {}
    if "SPY" in series_map and len(series_map) >= 2:
        price_df = pd.DataFrame(series_map).dropna()
        if len(price_df) >= 5:
            returns  = price_df.pct_change().dropna()
            spy_ret  = returns.get("SPY")
            if spy_ret is not None:
                for sym in symbols:
                    if sym in returns.columns:
                        spy_corr_map[sym] = round(float(returns[sym].corr(spy_ret)), 3)

    factor_list: list[dict] = []
    for sym in symbols:
        beta       = round(float(beta_map.get(sym, 1.0)), 2)
        spy_corr   = spy_corr_map.get(sym, 0.0)

        # Risk tier: X=Beta (>1.5 is high), Y=SPY ρ (>0.80 is high)
        if spy_corr > 0.80 and beta > 1.5:
            tier = "HIGH"
        elif spy_corr > 0.65 or beta > 1.2:
            tier = "MEDIUM"
        else:
            tier = "LOW"

        factor_list.append({
            "symbol":          sym,
            "weight_pct":      round(weights.get(sym, 0.0) * 100, 1),
            "beta":            beta,
            "spy_correlation": spy_corr,
            "risk_tier":       tier,
        })

    return factor_list


# ══════════════════════════════════════════════════════════════════════════════
# Direct Polygon / Finnhub candle fetcher (bypasses market_cache / AV)
# ══════════════════════════════════════════════════════════════════════════════

def _fetch_history_polygon(sym: str, start: str, end: str) -> pd.Series:
    """
    Polygon /v2/aggs daily aggregates for a date range.
    Returns an empty Series on failure.
    """
    if not POLYGON_API_KEY:
        return pd.Series(dtype=float, name=sym)
    try:
        r = requests.get(
            f"https://api.polygon.io/v2/aggs/ticker/{sym}/range/1/day/{start}/{end}",
            params={"adjusted": "true", "sort": "asc", "limit": 500, "apiKey": POLYGON_API_KEY},
            timeout=10.0,
        )
        if r.status_code != 200:
            return pd.Series(dtype=float, name=sym)
        data = r.json()
        results = data.get("results") or []
        if not results:
            return pd.Series(dtype=float, name=sym)
        closes = {
            datetime.date.fromtimestamp(bar["t"] / 1000).isoformat(): bar["c"]
            for bar in results
        }
        series = pd.Series(closes, dtype=float)
        series.name = sym
        return series
    except Exception as e:
        print(f"[IndexPerf] Polygon candle {sym} failed: {e}", file=sys.stderr)
        return pd.Series(dtype=float, name=sym)


def _fetch_history_finnhub(sym: str, start: str, end: str) -> pd.Series:
    """
    Finnhub /stock/candle daily for a date range.
    Returns an empty Series on failure.
    """
    if not FINNHUB_API_KEY:
        return pd.Series(dtype=float, name=sym)
    try:
        fh_sym = sym.replace(".", "-").upper()
        unix_from = int(datetime.datetime.strptime(start, "%Y-%m-%d").timestamp())
        unix_to   = int(datetime.datetime.strptime(end,   "%Y-%m-%d").timestamp())
        r = requests.get(
            "https://finnhub.io/api/v1/stock/candle",
            params={
                "symbol":     fh_sym,
                "resolution": "D",
                "from":       unix_from,
                "to":         unix_to,
                "token":      FINNHUB_API_KEY,
            },
            timeout=8.0,
        )
        data = r.json()
        if data.get("s") != "ok" or not data.get("c"):
            return pd.Series(dtype=float, name=sym)
        closes = {
            datetime.date.fromtimestamp(ts).isoformat(): c
            for ts, c in zip(data["t"], data["c"])
        }
        series = pd.Series(closes, dtype=float)
        series.name = sym
        return series
    except Exception as e:
        print(f"[IndexPerf] Finnhub candle {sym} failed: {e}", file=sys.stderr)
        return pd.Series(dtype=float, name=sym)


def _period_return(series: pd.Series) -> float | None:
    """Return (end/start - 1) * 100 for a sorted price series, or None if empty."""
    if series.empty or len(series) < 2:
        return None
    p0, p1 = float(series.iloc[0]), float(series.iloc[-1])
    if p0 <= 0:
        return None
    return round((p1 / p0 - 1) * 100, 2)


# ══════════════════════════════════════════════════════════════════════════════
# Module-level: get_index_performance
# ══════════════════════════════════════════════════════════════════════════════

async def get_index_performance(stress_dict: dict) -> dict[str, dict]:
    """
    Enrich each scenario in *stress_dict* (from StressTester.run_stress_test)
    with real-time index returns fetched via Polygon → Finnhub and an
    alpha_gap narrative comparing the portfolio against the index.

    Returns a dict keyed by scenario_key:
    {
      "spy_return_pct":      float,
      "qqq_return_pct":      float,
      "portfolio_return_pct": float,
      "alpha_gap_spy":       float,   # portfolio − SPY
      "alpha_gap_qqq":       float,   # portfolio − QQQ
      "alpha_gap_narrative": str,
    }
    """

    async def _fetch_one(sym: str, start: str, end: str) -> pd.Series:
        """Polygon → Finnhub async wrapper (runs sync IO in thread)."""
        series = await asyncio.to_thread(_fetch_history_polygon, sym, start, end)
        if series.empty:
            series = await asyncio.to_thread(_fetch_history_finnhub, sym, start, end)
        return series

    output: dict[str, dict] = {}

    for key, r in stress_dict.items():
        meta = SCENARIOS.get(key, {})
        start = r.get("start") or meta.get("start", "")
        end   = r.get("end")   or meta.get("end", "")

        if not start or not end:
            continue

        spy_series, qqq_series = await asyncio.gather(
            _fetch_one("SPY", start, end),
            _fetch_one("QQQ", start, end),
        )

        spy_ret = _period_return(spy_series)
        qqq_ret = _period_return(qqq_series)

        # Fall back to hardcoded scenario values if live fetch fails
        if spy_ret is None:
            spy_ret = r.get("spy_return_pct") or meta.get("spy_return_pct", 0.0)
        if qqq_ret is None:
            qqq_ret = r.get("qqq_return_pct", 0.0)

        port_ret    = r.get("impact_pct") or r.get("portfolio_return_pct", 0.0)
        alpha_spy   = round(port_ret - spy_ret, 2)
        alpha_qqq   = round(port_ret - qqq_ret, 2)
        label       = r.get("label") or key

        # Human-readable alpha gap
        if alpha_spy < 0:
            alpha_clause = (
                f"Portfolio underperformed SPY by {abs(alpha_spy):.1f}% "
                f"during {label}"
            )
        elif alpha_spy > 0:
            alpha_clause = (
                f"Portfolio outperformed SPY by {alpha_spy:.1f}% "
                f"during {label}"
            )
        else:
            alpha_clause = f"Portfolio matched SPY during {label}"

        qqq_clause = (
            f" (vs. Nasdaq-100 {qqq_ret:+.1f}%)" if qqq_ret != 0.0 else ""
        )

        output[key] = {
            "spy_return_pct":        spy_ret,
            "qqq_return_pct":        qqq_ret,
            "portfolio_return_pct":  port_ret,
            "alpha_gap_spy":         alpha_spy,
            "alpha_gap_qqq":         alpha_qqq,
            "alpha_gap_narrative":   f"{alpha_clause}{qqq_clause}.",
        }

    return output


# ══════════════════════════════════════════════════════════════════════════════
# StressTester — async class interface (used by quant_node)
# ══════════════════════════════════════════════════════════════════════════════
class StressTester:
    """
    Async interface over SCENARIOS using market_cache.get_historical_range.

    Accepts a DataFrame with columns:
        ticker  — symbol string
        weight  — fractional portfolio weight (sums to ~1.0)

    Returns:
        {
          scenario_key: {
            "scenario_name": str,
            "impact_pct":    float,   # weighted portfolio return %
            "weak_link":     {"ticker": str, "drawdown": float},
            "description":   str,
          },
          ...
        }
    """

    @staticmethod
    async def get_benchmark_performance(scenario_key: str) -> dict:
        """
        Fetch SPY and QQQ returns for a specific scenario.

        Returns:
            {"SPY": float, "QQQ": float}  — period return % for each index.
            Missing benchmarks default to the hardcoded spy_return_pct from SCENARIOS.
        """
        from services.market_cache import market_cache as _mc

        meta = SCENARIOS.get(scenario_key)
        if not meta:
            return {"SPY": 0.0, "QQQ": 0.0}

        start = meta["start"]
        end   = meta["end"]
        out   = {"SPY": meta["spy_return_pct"], "QQQ": 0.0}

        for bench in ("SPY", "QQQ"):
            prices = await _mc.get_historical_range(bench, start, end)
            if prices is not None and not prices.empty and float(prices.iloc[0]) > 0:
                ret = (float(prices.iloc[-1]) / float(prices.iloc[0]) - 1) * 100
                out[bench] = round(ret, 2)

        return out

    async def run_stress_test(self, portfolio_df: "pd.DataFrame") -> dict:
        from services.market_cache import market_cache as _mc

        tickers = portfolio_df["ticker"].tolist()
        weights = portfolio_df.set_index("ticker")["weight"]

        results: dict = {}

        for key, meta in SCENARIOS.items():
            start = meta["start"]
            end   = meta["end"]

            scenario_returns: list[float] = []
            weak_link: dict = {"ticker": None, "drawdown": 0.0}

            # Fetch portfolio positions + benchmarks concurrently
            price_tasks = {t: _mc.get_historical_range(t, start, end) for t in tickers}
            benchmark_task = self.get_benchmark_performance(key)
            all_prices, benchmark = await asyncio.gather(
                asyncio.gather(*[price_tasks[t] for t in tickers]),
                benchmark_task,
            )

            for ticker, prices in zip(tickers, all_prices):
                if prices is not None and not prices.empty:
                    start_p = float(prices.iloc[0])
                    end_p   = float(prices.iloc[-1])
                    if start_p > 0:
                        period_ret = (end_p / start_p) - 1
                        w = float(weights.get(ticker, 0.0))

                        if period_ret < weak_link["drawdown"]:
                            weak_link = {
                                "ticker":   ticker,
                                "drawdown": round(period_ret * 100, 2),
                            }

                        scenario_returns.append(period_ret * w)

            portfolio_impact = sum(scenario_returns)

            results[key] = {
                "scenario_name":   meta["scenario_name"],
                "impact_pct":      round(portfolio_impact * 100, 2),
                "weak_link":       weak_link,
                "description":     meta["description"],
                "key":             key,
                "label":           meta["label"],
                "start":           start,
                "end":             end,
                "spy_return_pct":  benchmark["SPY"],
                "qqq_return_pct":  benchmark["QQQ"],
                "benchmark_impact": benchmark,
                "outperformance_vs_spy_pct": round(portfolio_impact * 100 - benchmark["SPY"], 2),
            }

        return results

    async def run_stress_test_with_alpha(self, portfolio_df: "pd.DataFrame") -> dict:
        """
        Runs run_stress_test then enriches each result with get_index_performance
        so callers get alpha_gap_narrative, alpha_gap_spy, alpha_gap_qqq.
        """
        stress_dict = await self.run_stress_test(portfolio_df)
        alpha_data  = await get_index_performance(stress_dict)
        for key, alpha in alpha_data.items():
            if key in stress_dict:
                stress_dict[key].update(alpha)
        return stress_dict

    @staticmethod
    def to_list(stress_dict: dict) -> list[dict]:
        """
        Convert the dict output of run_stress_test to the list format
        expected by the rest of the pipeline (synthesizer_node, frontend).
        Mirrors the shape produced by run_stress_tests().
        """
        out = []
        for key, r in stress_dict.items():
            wl = r.get("weak_link") or {}
            out.append({
                "key":                       r["key"],
                "scenario_name":             r["scenario_name"],
                "label":                     r["label"],
                "start":                     r["start"],
                "end":                       r["end"],
                "description":               r["description"],
                "spy_return_pct":            r["spy_return_pct"],
                "portfolio_return_pct":      r["impact_pct"],
                "outperformance_vs_spy_pct": r["outperformance_vs_spy_pct"],
                "weakest_link": {
                    "symbol":                  wl.get("ticker"),
                    "return_pct":              wl.get("drawdown"),
                    "weighted_contribution_pct": None,
                } if wl.get("ticker") else {},
                "qqq_return_pct":             r.get("qqq_return_pct", 0.0),
                "benchmark_impact":           r.get("benchmark_impact", {"SPY": r["spy_return_pct"], "QQQ": 0.0}),
                "data_coverage_pct":         100.0,
                "alpha_gap_spy":             r.get("alpha_gap_spy",   r["outperformance_vs_spy_pct"]),
                "alpha_gap_qqq":             r.get("alpha_gap_qqq",   0.0),
                "alpha_gap_narrative":       r.get("alpha_gap_narrative", ""),
                "md_narrative":              (
                    f"In a {r.get('label', key)}-style scenario, this portfolio would "
                    f"have returned {r['impact_pct']:+.1f}% "
                    f"(vs. S&P {r['spy_return_pct']:+.1f}%, QQQ {r.get('qqq_return_pct', 0.0):+.1f}%), "
                    f"a {r['outperformance_vs_spy_pct']:+.1f}% alpha versus the index."
                ),
            })
        return out
