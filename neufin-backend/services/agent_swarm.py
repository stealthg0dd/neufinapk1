"""
agent_swarm.py — Neufin Agentic Swarm (LangGraph orchestration)

Seven specialised agents run in a directed graph, sharing a typed state object.
Each node appends to agent_trace for the Bloomberg-style "Thinking Trace" UI.

Graph topology:
  START → market_regime → strategist → quant → tax_arch → risk_sentinel → alpha_scout → critic → synthesizer → END
                                                                                  └──(revision)──→ quant

Agents
------
  Market Regime   FRED CPI → 5-category macro regime classification (growth/inflation/
                  recession/stagflation/risk-off) with confidence score
  Strategist      Finnhub company news + FRED CPI → market-regime narrative
  Quant           HHI, weighted beta, Sharpe, Pearson correlation clusters
  Tax Architect   Per-position liability / harvest analysis at 20% LT-CGT
  Risk Sentinel   Independent watchdog: HHI, correlation, beta, Sharpe → risk level
  Alpha Scout     AI-driven opportunity discovery outside current portfolio
  Critic          Challenges the quant model; triggers one revision pass
  Synthesizer     Combines all 7 outputs into IC Briefing + structured Investment Thesis

Fallback: if langgraph is not installed the same nodes run sequentially.
"""

from __future__ import annotations

import asyncio
import datetime
import json
import operator
import time
from typing import Annotated, Any, TypedDict

import numpy as np
import pandas as pd
import requests
import structlog

logger = structlog.get_logger("neufin.agent_swarm")

# ── LangGraph (optional — graceful fallback) ───────────────────────────────────
try:
    from langgraph.graph import END, START, StateGraph

    _LANGGRAPH = True
except ImportError:
    _LANGGRAPH = False
    logger.warning("swarm.langgraph_missing")

# ── Service imports ────────────────────────────────────────────────────────────
from services.ai_router import get_ai_analysis, get_ai_briefing  # noqa: E402
from services.calculator import (  # noqa: E402
    _beta_score,
    _hhi_score,
    _tax_alpha_score,
    fetch_beta,
    get_tax_impact_analysis,
    get_tax_neutral_pairs,
)
from services.market_cache import get_swarm_job, update_swarm_job  # noqa: E402
from services.risk_engine import (  # noqa: E402
    _fetch_daily_closes_av,
    build_correlation_matrix_from_series,
    correlation_penalty_score,
    fetch_all_closes,
    find_correlation_clusters,
    format_clusters_for_ai,
)
from services.stress_tester import StressTester, compute_factor_metrics  # noqa: E402


# alerts router is in routers/ — import lazily to avoid circular dependency at
# module load time (routers import services, not the other way around normally).
def _get_notify_fn():
    try:
        from routers.alerts import notify_macro_shift

        return notify_macro_shift
    except Exception:
        return None


# Regimes that warrant a push notification
_ALERT_REGIMES = {"High Inflation", "Inflationary", "Elevated Inflation"}

# ── API keys ───────────────────────────────────────────────────────────────────
from core.config import settings  # noqa: E402

FINNHUB_API_KEY = settings.FINNHUB_API_KEY
FRED_API_KEY = settings.FRED_API_KEY

# fredapi is optional — graceful fallback if not installed
try:
    from fredapi import Fred as _Fred

    _FREDAPI_AVAILABLE = True
except ImportError:
    _Fred = None  # type: ignore[assignment,misc]
    _FREDAPI_AVAILABLE = False
    logger.warning("swarm.fredapi_missing")

_RISK_FREE_ANNUAL = 0.053  # ~Fed funds rate — override via env var
_CORR_REVISION_THRESHOLD = 0.80  # critic triggers quant revision above this


# ══════════════════════════════════════════════════════════════════════════════
# Shared State
# ══════════════════════════════════════════════════════════════════════════════
class SwarmState(TypedDict):
    # ── Input (caller must provide) ────────────────────────────────────────────
    ticker_data: list[dict]  # [{symbol, shares, price, value, weight, cost_basis?}]
    total_value: float
    external_quant_intelligence: dict

    # ── Agent outputs ──────────────────────────────────────────────────────────
    macro_context: str  # Strategist: regime + news summary
    market_regime: dict  # Market Regime Agent: 5-category classification
    risk_metrics: dict  # Quant: HHI, beta, Sharpe, correlation
    tax_estimates: dict  # Tax Architect: liability + harvesting
    risk_sentinel_output: dict  # Risk Sentinel: independent risk watchdog
    alpha_opportunities: dict  # Alpha Scout: opportunity discovery
    critique: str  # Critic: issues to address

    # ── Control ────────────────────────────────────────────────────────────────
    revision_count: int  # Critic uses this to cap revision loops at 1
    needs_revision: bool  # Critic sets True to trigger quant re-run

    # ── Final output ───────────────────────────────────────────────────────────
    investment_thesis: dict  # Synthesizer JSON

    # ── UI thinking trace (each node appends its steps) ───────────────────────
    agent_trace: Annotated[list[str], operator.add]


# ══════════════════════════════════════════════════════════════════════════════
# Helper functions
# ══════════════════════════════════════════════════════════════════════════════
def _fetch_finnhub_news(symbol: str, days: int = 7) -> list[dict]:
    """Fetch recent company news from Finnhub. Returns [] on failure."""
    if not FINNHUB_API_KEY:
        return []
    try:
        date_to = datetime.date.today().isoformat()
        date_from = (datetime.date.today() - datetime.timedelta(days=days)).isoformat()
        r = requests.get(
            "https://finnhub.io/api/v1/company-news",
            params={
                "symbol": symbol,
                "from": date_from,
                "to": date_to,
                "token": FINNHUB_API_KEY,
            },
            timeout=6.0,
        )
        items = r.json() if isinstance(r.json(), list) else []
        # Return top-3 headlines to keep prompts concise
        return [
            {"headline": i.get("headline", ""), "summary": i.get("summary", "")[:200]}
            for i in items[:3]
        ]
    except Exception as e:
        logger.warning("swarm.news_fetch_failed", symbol=symbol, error=str(e))
        return []


def _get_fred_cpi_analysis() -> dict:
    """
    Fetch the last 13 months of CPIAUCSL from FRED using fredapi.
    Calculates YoY % and 3-month annualised trend to classify macro regime.

    Falls back to the raw FRED REST API if fredapi is not installed.
    Returns a dict with: yoy_pct, trend_3m_ann, regime, regime_description.
    """
    _EMPTY = {
        "yoy_pct": None,
        "trend_3m_ann": None,
        "regime": "Unknown",
        "regime_description": "FRED data unavailable.",
    }
    if not FRED_API_KEY:
        return _EMPTY

    values: list[float] = []

    # ── 1. fredapi (preferred) ────────────────────────────────────────────────
    if _FREDAPI_AVAILABLE and _Fred is not None:
        try:
            fred = _Fred(api_key=FRED_API_KEY)
            start_date = (
                datetime.date.today() - datetime.timedelta(days=420)
            ).isoformat()
            cpi_series = fred.get_series("CPIAUCSL", observation_start=start_date)
            values = [float(v) for v in cpi_series.dropna().tolist()]
        except Exception as e:
            logger.warning("swarm.fred_fredapi_failed", error=str(e))

    # ── 2. Raw requests fallback ──────────────────────────────────────────────
    if not values:
        try:
            r = requests.get(
                "https://api.stlouisfed.org/fred/series/observations",
                params={
                    "series_id": "CPIAUCSL",
                    "api_key": FRED_API_KEY,
                    "sort_order": "asc",
                    "limit": "14",
                    "file_type": "json",
                },
                timeout=8.0,
            )
            obs = r.json().get("observations", [])
            values = [
                float(o["value"]) for o in obs if o.get("value") not in (".", None)
            ]
        except Exception as e:
            logger.warning("swarm.fred_raw_failed", error=str(e))
            return _EMPTY

    if len(values) < 13:
        return _EMPTY

    yoy_pct = round((values[-1] / values[-13] - 1.0) * 100, 2)
    # 3-month annualised: (last / 3-months-ago)^4 - 1
    trend_3m_ann = (
        round(((values[-1] / values[-4]) ** 4 - 1.0) * 100, 2)
        if len(values) >= 4
        else yoy_pct
    )

    # Regime classification — trend > 3% YoY triggers "Inflationary"
    if yoy_pct > 5.0:
        regime = "High Inflation"
        description = (
            f"CPI YoY {yoy_pct:.1f}% far exceeds the 2% target — "
            "real assets and commodities are defensive tilts."
        )
    elif yoy_pct > 3.0:
        regime = "Inflationary"
        description = (
            f"CPI YoY {yoy_pct:.1f}% is above the 3% threshold — "
            "rate-sensitive sectors face pressure; energy and materials offer a hedge."
        )
    elif yoy_pct > 2.0:
        regime = "Elevated Inflation"
        description = (
            f"CPI YoY {yoy_pct:.1f}% is above the Fed's 2% target — "
            "monitor duration risk in bond-proxy equities."
        )
    elif yoy_pct > 0:
        regime = "Target Inflation"
        description = f"CPI YoY {yoy_pct:.1f}% is near the Fed target — growth equities are favoured."
    else:
        regime = "Disinflationary"
        description = (
            f"CPI YoY {yoy_pct:.1f}% — below target, watch for growth slowdown signals."
        )

    return {
        "yoy_pct": yoy_pct,
        "trend_3m_ann": trend_3m_ann,
        "regime": regime,
        "regime_description": description,
    }


def _compute_portfolio_sharpe(
    symbols: list[str],
    weights: dict[str, float],
    days: int = 60,
) -> float:
    """
    Annualised Sharpe ratio using the last *days* adjusted closes.
    Risk-free rate: _RISK_FREE_ANNUAL / 252 per day.
    Returns 0.0 when there is insufficient data.
    """
    price_series: dict[str, pd.Series] = {}
    for sym in symbols:
        s = _fetch_daily_closes_av(sym, days=days)
        if len(s) >= 10:
            price_series[sym] = s

    if not price_series:
        return 0.0

    price_df = pd.DataFrame(price_series).dropna()
    if len(price_df) < 5:
        return 0.0

    returns = price_df.pct_change().dropna()
    w = np.array([weights.get(s, 0.0) for s in returns.columns], dtype=float)
    w_sum = w.sum()
    if w_sum <= 0:
        return 0.0
    w /= w_sum

    portfolio_returns = returns.values @ w
    rf_daily = _RISK_FREE_ANNUAL / 252
    excess = portfolio_returns - rf_daily
    std = excess.std()
    if std == 0:
        return 0.0
    return round(float(excess.mean() / std * np.sqrt(252)), 3)


def _compute_portfolio_sharpe_from_series(
    price_series: dict[str, pd.Series],
    weights: dict[str, float],
    min_rows: int = 10,
) -> float:
    """
    Compute annualised Sharpe ratio from **pre-fetched** price series.
    Avoids redundant HTTP calls when data is already available via fetch_all_closes.
    """
    valid = {s: v for s, v in price_series.items() if len(v) >= min_rows}
    if not valid:
        return 0.0
    price_df = pd.DataFrame(valid).dropna()
    if len(price_df) < 5:
        return 0.0
    returns = price_df.pct_change().dropna()
    w = np.array([weights.get(s, 0.0) for s in returns.columns], dtype=float)
    w_sum = w.sum()
    if w_sum <= 0:
        return 0.0
    w /= w_sum
    portfolio_returns = returns.values @ w
    rf_daily = _RISK_FREE_ANNUAL / 252
    excess = portfolio_returns - rf_daily
    std = excess.std()
    if std == 0:
        return 0.0
    return round(float(excess.mean() / std * np.sqrt(252)), 3)


def _top_n_by_weight(ticker_data: list[dict], n: int = 3) -> list[str]:
    """Return the top-N symbols by portfolio weight."""
    sorted_tickers = sorted(ticker_data, key=lambda x: x.get("weight", 0), reverse=True)
    return [t["symbol"] for t in sorted_tickers[:n]]


# ══════════════════════════════════════════════════════════════════════════════
# Agent Nodes
# ══════════════════════════════════════════════════════════════════════════════


async def strategist_node(state: SwarmState) -> dict:
    """
    Strategist Agent — Market regime (FRED CPI) + Finnhub company news for top-3.

    CPI regime logic:
      YoY > 5%  → High Inflation
      YoY > 3%  → Inflationary          (primary trigger per spec)
      YoY > 2%  → Elevated Inflation
      YoY > 0%  → Target Inflation
      otherwise → Disinflationary

    The detected regime is embedded in macro_context so the Synthesizer can
    tailor advice (e.g. "In this Inflationary regime, your XOM tilt provides a
    natural hedge").
    """
    trace: list[str] = []
    trace.append("[Strategist] Identifying top holdings and fetching macro data...")

    top3 = _top_n_by_weight(state["ticker_data"], n=3)

    # ── Parallel: news + CPI ──────────────────────────────────────────────────
    news_tasks = [asyncio.to_thread(_fetch_finnhub_news, sym) for sym in top3]
    cpi_task = asyncio.to_thread(_get_fred_cpi_analysis)
    news_lists, cpi_data = await asyncio.gather(
        asyncio.gather(*news_tasks),
        cpi_task,
    )
    news_map = dict(zip(top3, news_lists, strict=False))

    regime = cpi_data["regime"]
    yoy_str = (
        f"{cpi_data['yoy_pct']:.1f}%" if cpi_data["yoy_pct"] is not None else "N/A"
    )
    trend_str = (
        f"{cpi_data['trend_3m_ann']:.1f}%"
        if cpi_data["trend_3m_ann"] is not None
        else "N/A"
    )
    trace.append(
        f"[Strategist] FRED CPI YoY={yoy_str}, 3m-ann={trend_str} → Regime: {regime}"
    )

    for sym, items in news_map.items():
        trace.append(f"[Strategist] {sym}: {len(items)} news item(s) retrieved")

    # ── AI synthesis ──────────────────────────────────────────────────────────
    news_text = "\n".join(
        (
            f"  {sym}: " + "; ".join(n["headline"] for n in items[:3])
            if items
            else f"  {sym}: no recent news"
        )
        for sym, items in news_map.items()
    )
    top_tickers = [t["symbol"] for t in state["ticker_data"][:5]]

    # ── Research layer context (enriches swarm with structured intelligence) ──
    _research_context_text = ""
    try:
        from database import supabase as _db
        from services.research.regime_detector import get_current_regime_summary

        _db_regime = get_current_regime_summary()
        _db_regime_name = _db_regime.get("regime", "neutral")
        _db_confidence = _db_regime.get("confidence", 0.5)

        # Fetch the latest research note summary
        _note_res = (
            _db.table("research_notes")
            .select("title,executive_summary,affected_sectors,regime")
            .order("generated_at", desc=True)
            .limit(2)
            .execute()
        )
        if _note_res.data:
            _note_summaries = "\n".join(
                f"  [{n['note_type'] if 'note_type' in n else 'note'}] {n['title']}: {n['executive_summary']}"
                for n in _note_res.data
            )
            _research_context_text = (
                f"\nNeuFin Intelligence Layer:\n"
                f"  Confirmed Regime: {_db_regime_name} (confidence: {_db_confidence:.0%})\n"
                f"  Latest Research:\n{_note_summaries}"
            )
            trace.append(
                f"[Strategist] Research layer: regime={_db_regime_name}, {len(_note_res.data)} research note(s) loaded."
            )
    except Exception as _rc_exc:
        trace.append(f"[Strategist] Research layer unavailable ({_rc_exc})")

    prompt = f"""You are a macro strategist at a top-tier hedge fund.

Current macro regime: {regime}
CPI YoY: {yoy_str}  |  3-month annualised trend: {trend_str}
Regime description: {cpi_data["regime_description"]}
{_research_context_text}
Recent news for top 3 portfolio holdings:
{news_text}

Full portfolio (top 5): {", ".join(top_tickers)}

In this {regime} environment, analyse this portfolio's macro positioning.
Return ONLY valid JSON — no markdown:
{{
  "regime": "{regime}",
  "cpi_yoy": "{yoy_str}",
  "regime_implication": "one sentence on what {regime} means for this specific portfolio",
  "hedge_positions": ["any existing holdings that serve as hedges in this regime"],
  "news_risks": ["up to 2 specific risks from news"],
  "positioning_advice": "one concrete adjustment for this exact regime"
}}"""

    try:
        result = await get_ai_analysis(prompt)
        # Ensure regime fields are preserved (AI may override)
        result.setdefault("regime", regime)
        result.setdefault("cpi_yoy", yoy_str)
        macro_context = json.dumps(result, indent=2)
        trace.append(
            f"[Strategist] Regime synthesis complete — {regime} implications generated."
        )
    except Exception as e:
        macro_context = json.dumps(
            {
                "regime": regime,
                "cpi_yoy": yoy_str,
                "regime_implication": cpi_data["regime_description"],
                "hedge_positions": [],
                "news_risks": [],
                "positioning_advice": "N/A",
            }
        )
        trace.append(f"[Strategist] AI synthesis failed ({e}) — raw regime data used.")

    # ── Macro-shift push notification ─────────────────────────────────────────
    if regime in _ALERT_REGIMES:
        notify_fn = _get_notify_fn()
        if notify_fn:
            affected = [t["symbol"] for t in state["ticker_data"]]
            body = (
                f"FRED CPI YoY={yoy_str} — Regime classified as '{regime}'. "
                f"Portfolio exposure: {', '.join(affected[:5])}. "
                "Run Swarm for full IC Briefing."
            )
            notify_task = asyncio.create_task(
                notify_fn(
                    regime=regime,
                    cpi_yoy=yoy_str,
                    body_text=body,
                    affected_symbols=affected,
                )
            )
            trace.append(
                f"[Strategist] ▲ Push alert queued for {len(affected)} symbol(s) — Regime: {regime} (task={id(notify_task)})"
            )

    return {"macro_context": macro_context, "agent_trace": trace}


async def quant_node(state: SwarmState) -> dict:
    """
    Quant Agent — HHI concentration, weighted beta, Sharpe ratio, correlation clusters.
    """
    trace: list[str] = []
    trace.append("[Quant] Building quantitative risk model...")

    ticker_data = state["ticker_data"]
    revision = state.get("revision_count", 0)
    corr_threshold = 0.65 if revision > 0 else 0.75  # stricter on revision

    symbols = [t["symbol"] for t in ticker_data]
    weights = {t["symbol"]: t.get("weight", 0.0) for t in ticker_data}
    # ── HHI concentration ─────────────────────────────────────────────────────
    weight_series = pd.Series([t.get("weight", 0.0) for t in ticker_data])
    hhi_pts = _hhi_score(weight_series)
    trace.append(f"[Quant] HHI concentration score: {hhi_pts}/25")

    # ── Weighted beta ─────────────────────────────────────────────────────────
    trace.append(f"[Quant] Fetching beta for {len(symbols)} symbols...")
    betas = await asyncio.gather(*[asyncio.to_thread(fetch_beta, s) for s in symbols])
    beta_map = dict(
        zip(symbols, [b if isinstance(b, float) else 1.0 for b in betas], strict=False)
    )
    weighted_beta = sum(weights.get(s, 0.0) * beta_map.get(s, 1.0) for s in symbols)
    beta_pts = _beta_score(weighted_beta)
    trace.append(
        f"[Quant] Weighted beta: {weighted_beta:.3f} → beta_score: {beta_pts}/25"
    )

    # ── Parallel price fetch (single batch for sharpe + correlation) ─────────────
    # fetch_all_closes uses asyncio.gather internally — all tickers fetched at once.
    # The provider blacklist in risk_engine ensures that once AV/Finnhub is
    # rate-limited, remaining symbols skip that provider immediately.
    trace.append(
        f"[Quant] Fetching 60-day price history for {len(symbols)} symbols in parallel..."
    )
    price_series = await fetch_all_closes(symbols, days=60)
    fetched_count = sum(1 for s in price_series.values() if len(s) >= 10)
    trace.append(
        f"[Quant] Price data ready — {fetched_count}/{len(symbols)} symbols with sufficient history."
    )

    # ── Sharpe ratio (from pre-fetched data — no extra HTTP calls) ───────────────
    sharpe = _compute_portfolio_sharpe_from_series(price_series, weights)
    sharpe_rating = (
        "Strong"
        if sharpe > 1.0
        else "Acceptable" if sharpe > 0.5 else "Weak" if sharpe > 0 else "Negative"
    )
    trace.append(f"[Quant] Annualised Sharpe ratio: {sharpe} ({sharpe_rating})")

    # ── Correlation clusters (from pre-fetched data — no extra HTTP calls) ───────
    trace.append(
        f"[Quant] Building 60-day Pearson correlation matrix (threshold rho>{corr_threshold})..."
    )
    corr_matrix = build_correlation_matrix_from_series(price_series)
    clusters = find_correlation_clusters(corr_matrix, weights, threshold=corr_threshold)
    corr_pts, avg_corr = correlation_penalty_score(clusters, corr_matrix)
    cluster_summary = format_clusters_for_ai(clusters)

    # Serialise top-5 correlation sub-matrix for frontend heatmap
    top5_by_wt = sorted(symbols, key=lambda s: weights.get(s, 0), reverse=True)[:5]
    top5_in_mx = [
        s for s in top5_by_wt if not corr_matrix.empty and s in corr_matrix.index
    ]
    if top5_in_mx:
        try:
            _sub = corr_matrix.loc[top5_in_mx, top5_in_mx]
            corr_matrix_data: dict = {
                "symbols": top5_in_mx,
                "values": [
                    [round(float(v), 3) for v in row] for row in _sub.values.tolist()
                ],
            }
        except Exception:
            corr_matrix_data = {"symbols": [], "values": []}
    else:
        corr_matrix_data = {"symbols": [], "values": []}

    if clusters:
        trace.append(
            f"[Quant] ⚠ {len(clusters)} correlation cluster(s) found. avg_corr={avg_corr:.3f} → corr_score: {corr_pts}/30"
        )
    else:
        trace.append(
            f"[Quant] No significant clusters. avg_corr={avg_corr:.3f} → corr_score: {corr_pts}/30"
        )

    # ── Stress tests + factor metrics (run in parallel) ───────────────────────
    trace.append(
        "[Quant] Running historical regime stress tests (2022 Rate Shock, 2020 Crash, 2024 AI Correction)..."
    )
    portfolio_df = pd.DataFrame(
        [{"ticker": s, "weight": weights.get(s, 1.0 / len(symbols))} for s in symbols]
    )
    stress_dict, factor_metrics = await asyncio.gather(
        StressTester().run_stress_test(portfolio_df),
        asyncio.to_thread(compute_factor_metrics, symbols, weights),
    )
    stress_results = StressTester.to_list(stress_dict)
    for sr in stress_results:
        fragility = (
            " ⚠ STRUCTURAL FRAGILITY" if sr["portfolio_return_pct"] <= -20 else ""
        )
        trace.append(
            f"[Quant] {sr['label']}: portfolio={sr['portfolio_return_pct']:+.1f}% "
            f"vs SPY={sr['spy_return_pct']:+.1f}% "
            f"(alpha={sr['outperformance_vs_spy_pct']:+.1f}%){fragility}"
        )
    high_risk = [f["symbol"] for f in factor_metrics if f.get("risk_tier") == "HIGH"]
    if high_risk:
        trace.append(
            f"[Quant] ⚠ High-risk factor cluster: {', '.join(high_risk)} (beta>1.5 + SPY rho>0.80)"
        )

    # ── Assemble risk_metrics ─────────────────────────────────────────────────
    risk_metrics = {
        "hhi_pts": hhi_pts,
        "beta_pts": beta_pts,
        "weighted_beta": round(weighted_beta, 3),
        "beta_map": {s: round(b, 3) for s, b in beta_map.items()},
        "sharpe_ratio": sharpe,
        "sharpe_rating": sharpe_rating,
        "corr_pts": corr_pts,
        "avg_corr": avg_corr,
        "clusters": clusters,
        "cluster_summary": cluster_summary,
        "corr_threshold": corr_threshold,
        "total_score": round(hhi_pts + beta_pts + corr_pts, 2),
        "stress_results": stress_results,
        "risk_factors": factor_metrics,
        "corr_matrix_data": corr_matrix_data,
    }
    trace.append(
        f"[Quant] Risk model complete. Sub-total (excl. tax): {risk_metrics['total_score']}/80"
    )

    return {"risk_metrics": risk_metrics, "agent_trace": trace}


async def tax_arch_node(state: SwarmState) -> dict:
    """
    Tax Architect Agent — Per-position tax liability, harvesting opportunities,
    and effective rate summary.
    """
    trace: list[str] = []
    trace.append("[Tax] Analysing cost basis ledger...")

    df = pd.DataFrame(state["ticker_data"])

    # calculator.py handles missing cost_basis gracefully
    tax_analysis = get_tax_impact_analysis(df)

    if not tax_analysis.get("available"):
        trace.append("[Tax] Cost basis not provided — tax analysis unavailable.")
        return {"tax_estimates": tax_analysis, "agent_trace": trace}

    positions = tax_analysis["positions"]
    liability = tax_analysis["total_liability"]
    harvest = tax_analysis["total_harvest_opp"]

    # Top 3 harvesting pairs (largest losses)
    harvestable = sorted(
        [p for p in positions if p["harvest_credit"] > 0],
        key=lambda x: x["harvest_credit"],
        reverse=True,
    )[:3]

    # Top 3 tax liabilities
    at_risk = sorted(
        [p for p in positions if p["tax_liability"] > 0],
        key=lambda x: x["tax_liability"],
        reverse=True,
    )[:3]

    trace.append(f"[Tax] Total deferred liability: ${liability:,.0f}")
    trace.append(f"[Tax] Harvesting opportunity: ${harvest:,.0f}")
    if harvestable:
        trace.append(
            f"[Tax] Top harvest: {', '.join(p['symbol'] for p in harvestable)}"
        )
    if at_risk:
        trace.append(
            f"[Tax] Highest liability: {', '.join(p['symbol'] for p in at_risk)}"
        )

    # Effective tax alpha score
    tax_pts = _tax_alpha_score(df)
    trace.append(f"[Tax] Tax alpha score: {tax_pts}/20")

    # Tax-neutral pair matchmaking — top-2 gainers offset by specific loser shares
    tax_neutral_pairs = get_tax_neutral_pairs(df)
    if tax_neutral_pairs:
        for pair in tax_neutral_pairs:
            trace.append(f"[Tax] ✦ Tax-Neutral Pair: {pair['recommendation_text']}")
    else:
        trace.append(
            "[Tax] No tax-neutral pairs available (cost basis missing or no offsettable positions)."
        )

    tax_estimates = {
        **tax_analysis,
        "tax_pts": tax_pts,
        "harvestable_top3": harvestable,
        "liability_top3": at_risk,
        "tax_neutral_pairs": tax_neutral_pairs,
    }

    return {"tax_estimates": tax_estimates, "agent_trace": trace}


async def critic_node(state: SwarmState) -> dict:
    """
    Portfolio Critic — Challenges the Quant and Tax outputs.
    If avg_corr > _CORR_REVISION_THRESHOLD and it's the first pass,
    sets needs_revision=True and triggers a stricter quant re-run.
    """
    trace: list[str] = []
    trace.append("[Critic] Reviewing quant and tax findings for hidden risks...")

    risk = state.get("risk_metrics", {})
    tax = state.get("tax_estimates", {})
    rev = state.get("revision_count", 0)

    issues: list[str] = []

    # 1. High correlation flag
    avg_corr = risk.get("avg_corr", 0.0)
    if avg_corr > _CORR_REVISION_THRESHOLD and rev == 0:
        issues.append(
            f"Average portfolio correlation {avg_corr:.3f} exceeds {_CORR_REVISION_THRESHOLD} "
            "— hidden concentration risk detected."
        )
        trace.append(
            f"[Critic] ⚠ HIGH CORRELATION: avg_corr={avg_corr:.3f} — flagging quant for revision with stricter threshold."
        )
        needs_revision = True
        revision_count = 1
    else:
        needs_revision = False
        revision_count = rev
        if avg_corr > 0.6:
            trace.append(
                f"[Critic] Moderate correlation detected (avg_corr={avg_corr:.3f}) — noting risk."
            )
            issues.append(
                f"Moderate pairwise correlation ({avg_corr:.3f}) warrants diversification review."
            )
        else:
            trace.append(
                f"[Critic] Correlation levels acceptable (avg_corr={avg_corr:.3f})."
            )

    # 2. Beta risk
    wb = risk.get("weighted_beta", 1.0)
    if wb > 1.8:
        issues.append(
            f"Portfolio weighted beta {wb:.2f} indicates aggressive market exposure — reduce high-beta names."
        )
        trace.append(f"[Critic] ⚠ AGGRESSIVE BETA: {wb:.2f} — above 1.8 threshold.")

    # 3. Tax liability vs harvest opportunity
    if tax.get("available"):
        liability = tax.get("total_liability", 0)
        harvest = tax.get("total_harvest_opp", 0)
        if liability > 50_000 and harvest < liability * 0.1:
            issues.append(
                f"Deferred tax liability ${liability:,.0f} with minimal harvesting offset — consider rebalancing."
            )
            trace.append(
                f"[Critic] ⚠ TAX RISK: high liability ${liability:,.0f} with low harvest offset ${harvest:,.0f}."
            )

    # 4. Sharpe
    sharpe = risk.get("sharpe_ratio", 0.0)
    if sharpe < 0:
        issues.append(
            f"Negative Sharpe ratio ({sharpe}) — risk-adjusted returns are below the risk-free rate."
        )
        trace.append(f"[Critic] ⚠ NEGATIVE SHARPE: {sharpe}")

    critique = (
        "Critic identified the following risks:\n• " + "\n• ".join(issues)
        if issues
        else "No critical structural risks flagged by the Critic."
    )
    trace.append(f"[Critic] Review complete. {len(issues)} issue(s) identified.")

    return {
        "critique": critique,
        "needs_revision": needs_revision,
        "revision_count": revision_count,
        "agent_trace": trace,
    }


async def market_regime_node(state: SwarmState) -> dict:
    """
    Market Regime Agent — Classifies the current macro environment into one of
    five regimes using FRED CPI data, then AI-enriches with confidence + drivers.

    Regime taxonomy:
      growth       CPI <= 2%, or near-target + positive trend
      inflation    CPI > 3% and accelerating or stable
      stagflation  CPI > 3% but decelerating (growth fading while inflation persists)
      recession    CPI < 0% or sharply decelerating with deflation risk
      risk-off     FRED data unavailable; defaulting to defensive posture

    Runs BEFORE strategist so downstream agents can access the canonical regime label.
    """
    trace: list[str] = []
    trace.append(
        "[Market Regime] Fetching FRED CPI data for macro regime classification..."
    )

    cpi_data = await asyncio.to_thread(_get_fred_cpi_analysis)

    yoy = cpi_data.get("yoy_pct")
    trend = cpi_data.get("trend_3m_ann")

    # ── Rule-based regime + confidence ────────────────────────────────────────
    if yoy is None:
        regime = "risk-off"
        confidence = 0.40
        drivers = ["FRED data unavailable — defaulting to defensive risk-off posture"]
    elif yoy < 0:
        regime = "recession"
        confidence = min(0.92, 0.70 + abs(yoy) * 0.05)
        drivers = [
            f"CPI YoY {yoy:.1f}% — deflationary pressure",
            "Real growth likely contracting",
            "Flight to quality assets expected",
        ]
    elif yoy < 1.5:
        regime = "recession"
        confidence = 0.65
        drivers = [
            f"CPI YoY {yoy:.1f}% — well below Fed target signals demand weakness",
            "Growth slowdown signals present",
            "Bond proxies and defensives outperform",
        ]
    elif yoy <= 2.0:
        regime = "growth"
        confidence = 0.82
        drivers = [
            f"CPI YoY {yoy:.1f}% at/near Fed 2% target",
            "Accommodative rate environment supports risk assets",
            "Equity multiples and growth stocks favoured",
        ]
    elif yoy <= 3.0:
        regime = "growth"
        confidence = 0.72
        drivers = [
            f"CPI YoY {yoy:.1f}% slightly above target but controlled",
            "Controlled inflation historically coincides with expansion",
            "Monitor for rate-hike signals from Fed",
        ]
    elif yoy > 3.0:
        # Differentiate inflation vs. stagflation by 3m trend direction
        if trend is not None and yoy > 0 and trend < yoy - 1.5:
            regime = "stagflation"
            confidence = 0.68
            drivers = [
                f"CPI YoY {yoy:.1f}% elevated but 3m-ann {trend:.1f}% decelerating",
                "Growth momentum fading while inflation persists",
                "Stagflationary compression on corporate margins",
            ]
        else:
            regime = "inflation"
            confidence = min(0.95, 0.72 + (yoy - 3.0) * 0.05)
            drivers = [
                f"CPI YoY {yoy:.1f}% above 3% threshold",
                (
                    f"3m annualised trend {trend:.1f}%"
                    if trend is not None
                    else "Trend data unavailable"
                ),
                "Rate-sensitive sectors under pressure; real assets defensive",
            ]
    else:
        regime = "inflation"
        confidence = 0.75
        drivers = [f"CPI YoY {yoy:.1f}%", "Above-target inflation regime"]

    yoy_str = f"{yoy:.1f}%" if yoy is not None else "N/A"
    trace.append(
        f"[Market Regime] Rule-based: {regime} (conf={confidence:.0%}) | CPI YoY={yoy_str}"
    )

    # ── AI enrichment (optional — falls back to rule-based on failure) ─────────
    symbols = [t["symbol"] for t in state["ticker_data"][:5]]
    prompt = f"""You are a macro economist. Classify the investment regime given:

CPI YoY: {yoy_str}  |  3m-ann trend: {f"{trend:.1f}" if trend is not None else "N/A"}%
Preliminary regime: {regime}  |  Portfolio: {", ".join(symbols)}

Return ONLY valid JSON — no markdown:
{{
  "regime": "{regime}",
  "confidence": {round(confidence, 2)},
  "drivers": ["specific driver 1", "specific driver 2", "specific driver 3"],
  "portfolio_implication": "one sentence on how {regime} regime specifically affects {", ".join(symbols[:3])}"
}}
regime MUST be one of: growth, inflation, recession, stagflation, risk-off"""

    try:
        result = await get_ai_analysis(prompt)
        valid_regimes = {"growth", "inflation", "recession", "stagflation", "risk-off"}
        if result.get("regime") not in valid_regimes:
            result["regime"] = regime
        try:
            result["confidence"] = round(float(result.get("confidence", confidence)), 2)
        except (TypeError, ValueError):
            result["confidence"] = round(confidence, 2)
        market_regime_out = result
        trace.append(
            f"[Market Regime] Final: {result['regime']} (conf={result['confidence']:.0%}) | "
            f"drivers: {'; '.join(str(d) for d in result.get('drivers', [])[:2])}"
        )
    except Exception as e:
        market_regime_out = {
            "regime": regime,
            "confidence": round(confidence, 2),
            "drivers": drivers,
            "portfolio_implication": cpi_data.get("regime_description", ""),
        }
        trace.append(
            f"[Market Regime] AI enrichment failed ({e}) — rule-based classification used."
        )

    # Inject raw CPI scalars so the frontend can render sparklines / badges
    market_regime_out["cpi_yoy"] = yoy  # float | None
    market_regime_out["cpi_trend_3m"] = trend  # float | None

    return {"market_regime": market_regime_out, "agent_trace": trace}


async def risk_sentinel_node(state: SwarmState) -> dict:
    """
    Risk Sentinel Agent — Independent watchdog that re-examines the Quant's metrics
    and issues a definitive risk verdict.

    Reads from risk_metrics (already computed by quant_node) — no new data fetches.
    Returns a structured assessment: risk_level, primary_risks, mitigations.

    Inserted AFTER tax_arch and BEFORE critic so the Critic has sentinel findings
    available when composing its challenge.
    """
    trace: list[str] = []
    trace.append("[Risk Sentinel] Independent portfolio risk audit initiated...")

    risk = state.get("risk_metrics", {})

    hhi_pts = risk.get("hhi_pts", 0.0)
    weighted_beta = risk.get("weighted_beta", 1.0)
    sharpe = risk.get("sharpe_ratio", 0.0)
    avg_corr = risk.get("avg_corr", 0.0)
    clusters = risk.get("clusters", [])

    primary_risks: list[str] = []
    mitigations: list[str] = []
    risk_score = 0.0  # 0-10 scale; >=6 → high, >=3 → medium, <3 → low

    # ── HHI concentration (max 3 pts) ─────────────────────────────────────────
    if hhi_pts < 8:
        risk_score += 3.0
        primary_risks.append(
            f"Extreme concentration — HHI score {hhi_pts:.0f}/25 signals portfolio dominated by few names"
        )
        mitigations.append("Add 3-5 uncorrelated positions; target HHI score > 15/25")
    elif hhi_pts < 15:
        risk_score += 1.5
        primary_risks.append(f"Moderate concentration — HHI score {hhi_pts:.0f}/25")
        mitigations.append(
            "Introduce 2-3 positions in sectors absent from current portfolio"
        )

    # ── Beta exposure (max 3 pts) ──────────────────────────────────────────────
    if weighted_beta > 1.8:
        risk_score += 3.0
        primary_risks.append(
            f"Aggressive beta exposure (beta={weighted_beta:.2f}) — portfolio amplifies market moves by {weighted_beta:.1f}x"
        )
        mitigations.append(
            "Trim highest-beta names to bring portfolio beta below 1.4; consider defensive allocation"
        )
    elif weighted_beta > 1.4:
        risk_score += 1.5
        primary_risks.append(
            f"Elevated beta (beta={weighted_beta:.2f}) — above-market volatility profile"
        )
        mitigations.append(
            "Rotate 10-15% into utilities, consumer staples, or low-vol ETFs to dampen beta"
        )

    # ── Correlation clusters (max 3 pts) ──────────────────────────────────────
    if avg_corr > 0.80:
        risk_score += 3.0
        primary_risks.append(
            f"Critical correlation (avg rho={avg_corr:.3f}) — true diversification absent; {len(clusters)} cluster(s) detected"
        )
        mitigations.append(
            "Exit or reduce at least 2 positions in the highest-rho cluster; diversification is illusory above rho=0.80"
        )
    elif avg_corr > 0.65:
        risk_score += 1.5
        primary_risks.append(f"Elevated pairwise correlation (avg rho={avg_corr:.3f})")
        mitigations.append(
            "Introduce negatively-correlated assets (bonds, gold, commodities, inverse-sector ETFs)"
        )

    # ── Sharpe ratio (max 2 pts) ───────────────────────────────────────────────
    if sharpe < 0:
        risk_score += 2.0
        primary_risks.append(
            f"Negative Sharpe ({sharpe:.3f}) — risk-adjusted returns below risk-free rate; capital being eroded"
        )
        mitigations.append(
            "Rebalance toward higher-quality names or de-risk 15-20% into short-duration Treasuries"
        )
    elif sharpe < 0.5:
        risk_score += 1.0
        primary_risks.append(
            f"Weak Sharpe ({sharpe:.3f}) — insufficient return per unit of risk taken"
        )
        mitigations.append(
            "Review position sizing; overweight highest-conviction names and reduce speculative tail positions"
        )

    # ── Verdict ────────────────────────────────────────────────────────────────
    if risk_score >= 6:
        risk_level = "high"
    elif risk_score >= 3:
        risk_level = "medium"
    else:
        risk_level = "low"

    if not primary_risks:
        primary_risks = [
            "No critical structural risks detected across HHI, beta, correlation, and Sharpe metrics"
        ]
        mitigations = [
            "Maintain current allocation; monitor for regime changes and rebalance quarterly"
        ]

    trace.append(
        f"[Risk Sentinel] Verdict: {risk_level.upper()} (score {risk_score:.1f}/10)"
    )
    for r in primary_risks[:3]:
        prefix = "⚠" if risk_level == "high" else "⚑"
        trace.append(f"[Risk Sentinel] {prefix} {r}")

    risk_sentinel_out = {
        "risk_level": risk_level,
        "risk_score": round(risk_score, 1),
        "primary_risks": primary_risks,
        "mitigations": mitigations,
    }
    return {"risk_sentinel_output": risk_sentinel_out, "agent_trace": trace}


async def alpha_scout_node(state: SwarmState) -> dict:
    """
    Alpha Scout Agent — AI-driven opportunity discovery outside the current portfolio.

    Uses market regime + macro context + current exposure to identify 3-5 symbols
    that complement or hedge the portfolio given the prevailing regime.
    Calls get_ai_analysis() for reasoning.

    Runs AFTER risk_sentinel (has access to risk verdict) and BEFORE critic.
    """
    trace: list[str] = []
    trace.append(
        "[Alpha Scout] Scanning for alpha opportunities not in current portfolio..."
    )

    market_regime = state.get("market_regime", {})
    macro_context = state.get("macro_context", "")
    risk_sentinel = state.get("risk_sentinel_output", {})
    ticker_data = state["ticker_data"]

    regime = market_regime.get("regime", "growth")
    risk_level = risk_sentinel.get("risk_level", "medium")
    existing_symbols = {t["symbol"] for t in ticker_data}
    exposure_summary = [
        {"symbol": t["symbol"], "weight_pct": round(t.get("weight", 0) * 100, 1)}
        for t in sorted(ticker_data, key=lambda x: x.get("weight", 0), reverse=True)[:5]
    ]

    macro_snippet = ""
    if macro_context and macro_context not in ("", "N/A"):
        try:
            macro_obj = json.loads(macro_context)
            macro_snippet = macro_obj.get(
                "regime_implication", macro_obj.get("positioning_advice", "")
            )[:300]
        except Exception:
            macro_snippet = macro_context[:300]

    prompt = f"""You are a portfolio alpha-generation specialist identifying investment opportunities.

Current macro regime: {regime}  |  Portfolio risk level: {risk_level}
Portfolio top holdings (DO NOT recommend these): {json.dumps(exposure_summary)}
All existing symbols (never include in output): {", ".join(sorted(existing_symbols))}
Macro context: {macro_snippet or "N/A"}
Risk sentinel mitigations: {risk_sentinel.get("mitigations", [])[:2]}

Identify exactly 3-5 specific investment opportunities that:
1. Are NOT in the existing portfolio (check the exclusion list above)
2. Either complement or defensively hedge the {regime} regime
3. Improve diversification relative to existing top holdings

Return ONLY valid JSON — no markdown:
{{
  "opportunities": [
    {{
      "symbol": "TICKER",
      "reason": "one sentence: why this fits {regime} regime and adds value to this specific portfolio",
      "confidence": 0.75
    }}
  ]
}}
confidence must be between 0.0 and 1.0. Return 3-5 opportunities."""

    try:
        result = await get_ai_analysis(prompt)
        opps = result.get("opportunities", [])
        # Enforce: remove any symbol already in portfolio
        opps = [
            o
            for o in opps
            if isinstance(o, dict) and o.get("symbol") not in existing_symbols
        ]
        for o in opps:
            try:
                o["confidence"] = round(
                    max(0.0, min(1.0, float(o.get("confidence", 0.65)))), 2
                )
            except (TypeError, ValueError):
                o["confidence"] = 0.65
        alpha_out = {"opportunities": opps[:5]}
        trace.append(
            f"[Alpha Scout] {len(opps)} opportunity(ies) identified for {regime} regime:"
        )
        for o in opps[:3]:
            sym = o.get("symbol", "?")
            why = o.get("reason", "")[:80]
            conf = o.get("confidence", 0.0)
            trace.append(f"[Alpha Scout] ✦ {sym}: {why}... (conf={conf:.0%})")
    except Exception as e:
        alpha_out = {"opportunities": []}
        trace.append(
            f"[Alpha Scout] AI opportunity scan failed ({e}) — no opportunities returned."
        )

    return {"alpha_opportunities": alpha_out, "agent_trace": trace}


# ══════════════════════════════════════════════════════════════════════════════
# IC Briefing System Prompt — PE Managing Director persona
# ══════════════════════════════════════════════════════════════════════════════
_IC_SYSTEM_PROMPT = """
You are a Managing Director at a top-tier Private Equity firm (e.g., Blackstone, KKR).
Your goal is to synthesize reports from your Analyst Swarm into a high-conviction
Investment Committee (IC) Briefing.

### TONE AND VOICE:
- **Direct & Decisive:** Avoid "I think" or "it seems." Use "The data confirms" or "We are overweight in..."
- **Fact-Based & Quantifiable:** Never mention a trend without a metric (e.g., "Industrial cluster correlation is 0.82, exceeding our 0.70 mandate").
- **Unsourced Flattery is Prohibited:** Do not praise the user for "letting winners run." If a winner is now 30% of the portfolio, it is a "Concentration Liability," not a success.
- **Urgency & Action:** Every briefing must conclude with a "Directive" for the next 90 days.

### BRIEFING STRUCTURE (use exact markdown headers):
## 1. Executive Summary
One paragraph. What is the portfolio's core identity and its single biggest threat today?

## 2. Quantitative Risk Attribution
Summarize the Quant Agent's findings. Specifically address the Effective Number of Bets
vs. the raw ticker count. Cite exact figures (HHI score, weighted beta, Sharpe ratio,
correlation clusters with rho values).

## 3. Macro Regime Alignment
Use the Strategist Agent's FRED/CPI data. State the regime explicitly (e.g., "Inflationary
at 3.4% YoY"). Assess whether this portfolio is positioned for or against the current regime.
Name specific holdings as hedges or liabilities.

## 4. Tax Alpha & Value Leaks
Identify where the client is "trapped" by capital gains (cite $ amount) and where they
are missing harvesting opportunities (cite $ amount and specific tickers).

## 6. Historical Stress Resilience
Use `quant_agent.stress_results` to grade the portfolio against three historical regimes.
For **every** scenario, state the projected loss figure explicitly. Do not soften the language.

**STRUCTURAL FRAGILITY RULE:**
If any scenario shows a portfolio loss > 20%, you MUST label that section with the
phrase **"Structural Fragility"** in bold, and include a specific directive:
"Your exposure to [weak_link ticker] makes you a passenger in a [scenario]-style crash.
Reduce position size by 20% to build a cash buffer."

For each scenario use the `md_narrative` field verbatim as the opening sentence, then
add one forward-looking sentence:

- **2022 Rate Shock — Inflationary Trap** (S&P -25.4%, Jan-Oct 2022):
  Quote `md_narrative` from `2022_RATE_SHOCK`. Identify the Weakest Link and its
  weighted contribution. Flag if loss > 20% as **Structural Fragility**.

- **2020 COVID Crash — Pandemic Liquidity Trap** (S&P -20%, Feb-Apr 2020):
  Quote `md_narrative` from `2020_LIQUIDITY`. Name the sector that would have saved or
  sunk this portfolio. All correlations go to 1.0 in liquidity crises — state this.
  Flag if loss > 20% as **Structural Fragility**.

- **2024 AI Correction — Growth Rotation** (S&P -8.5%, Jul-Aug 2024):
  Quote `md_narrative` from `2024_AI_CORRECTION`. Assess whether current AI/tech
  concentration amplifies or hedges this specific scenario.
  Flag if loss > 20% as **Structural Fragility**.

State a final verdict: **"Stress-Resilient"** (no scenario > -15%), **"Market-Correlated"**
(worst scenario within 5% of SPY), or **"Fragile"** (any scenario > -20% loss).
Always cite the single worst scenario return explicitly.

## 5. The 90-Day Directive
3-4 bulleted, non-negotiable actions. Include tax-adjusted sizing where applicable
(e.g., "Trim [Ticker] by 15% — the $X capital gain is offset by [Ticker] losses of $Y").

**CRITICAL — TAX-NEUTRAL PAIRS RULE:**
If `tax_agent.tax_neutral_pairs` is a non-empty array in the input data, the first
bullet of this section MUST be a "Tax-Neutral Exit Strategy" action. Frame it as
**Optimizing Net Proceeds**, not merely "saving taxes." The client is not avoiding tax —
they are structuring a simultaneous entry/exit to maximize dollars in-hand after execution.
Use this framing: "Execute a tax-neutral rebalance: exit [N] shares of [WINNER] (realising
a $[X] gain) paired with harvesting [Z] shares of [LOSER] ($[Y] loss) — net tax drag: $0,
net proceeds optimised by $[TAX_SAVED] vs. an unhedged exit."
Use the exact figures from each pair's `recommendation_text`. If there are two pairs, issue
two sub-bullets under the same directive.

### FORBIDDEN PHRASES:
- "In my opinion..."
- "A good rule of thumb is..."
- "This is a great start!"
- "Keep up the good work."
- "It seems like..." / "It appears that..."

### ADDITIONAL AGENT DATA (incorporate where relevant):
- `market_regime_agent`: 5-category regime classification with confidence and drivers —
  use in section 3 (Macro Regime Alignment) as the definitive regime label.
- `risk_sentinel_agent`: independent watchdog verdict (risk_level, primary_risks,
  mitigations) — incorporate sentinel findings into section 2 (Quantitative Risk Attribution).
- `alpha_scout_agent`: opportunities not currently in the portfolio — mention the top 2
  in section 5 (90-Day Directive) as diversification candidates where the risk budget allows.

### INPUT DATA TO ANALYZE:
{swarm_state_json}
""".strip()


async def synthesizer_node(state: SwarmState) -> dict:
    """
    Synthesizer Agent — PE Managing Director producing both:

      1. A long-form markdown IC Briefing (existing format — backward-compatible)
         via get_ai_briefing() with the full 5-section structure.

      2. A structured Investment Thesis JSON combining all 7 agent outputs:
         market_regime, strategist, quant, tax_architect, risk_sentinel, alpha_scout, critic.
         Fields: headline, regime, portfolio_health, macro_outlook, risks,
                 opportunities, tax_strategy, action_plan.

    Both AI calls run in parallel via asyncio.gather.
    All existing thesis fields are preserved for endpoint backward-compatibility.
    """
    trace: list[str] = []
    trace.append(
        "[Synthesizer] Compiling 7-agent swarm outputs for IC Briefing + Structured Thesis..."
    )

    risk = state.get("risk_metrics", {})
    tax = state.get("tax_estimates", {})
    macro = state.get("macro_context", "N/A")
    crit = state.get("critique", "")
    mkt_regime = state.get("market_regime", {})
    sentinel = state.get("risk_sentinel_output", {})
    alpha = state.get("alpha_opportunities", {})
    external_quant = state.get("external_quant_intelligence", {})

    tax_pts = tax.get("tax_pts", 10.0)
    hhi_pts = risk.get("hhi_pts", 0.0)
    beta_pts = risk.get("beta_pts", 0.0)
    corr_pts = risk.get("corr_pts", 0.0)
    dna_score = max(5, min(100, int(hhi_pts + beta_pts + tax_pts + corr_pts)))

    score_breakdown = {
        "hhi_concentration": hhi_pts,
        "beta_risk": beta_pts,
        "tax_alpha": tax_pts,
        "correlation": corr_pts,
    }

    # ── Build structured input payload for the MD (all 7 agents) ──────────────
    portfolio_positions = [
        {
            "symbol": t["symbol"],
            "weight_pct": round(t.get("weight", 0) * 100, 1),
            "value_usd": round(t.get("value", 0), 2),
            "beta": round(risk.get("beta_map", {}).get(t["symbol"], 1.0), 2),
        }
        for t in state["ticker_data"]
    ]

    strategist_parsed = (
        json.loads(macro)
        if macro and macro not in ("N/A", "")
        else {"regime": "Unknown"}
    )

    swarm_state_payload = {
        "portfolio": {
            "total_value_usd": round(state["total_value"], 2),
            "positions": portfolio_positions,
            "dna_score": dna_score,
            "score_breakdown": score_breakdown,
        },
        "external_quant_intelligence": external_quant,
        "market_regime_agent": mkt_regime,
        "quant_agent": {
            "hhi_concentration_score": hhi_pts,
            "weighted_beta": risk.get("weighted_beta"),
            "beta_score": beta_pts,
            "sharpe_ratio": risk.get("sharpe_ratio"),
            "sharpe_rating": risk.get("sharpe_rating"),
            "avg_pairwise_correlation": risk.get("avg_corr"),
            "correlation_score": corr_pts,
            "correlation_clusters": risk.get("cluster_summary"),
            "cluster_details": risk.get("clusters", []),
            "stress_results": risk.get("stress_results", []),
            "risk_factors": risk.get("risk_factors", []),
        },
        "strategist_agent": strategist_parsed,
        "tax_agent": {
            "cost_basis_available": tax.get("available", False),
            "total_deferred_liability_usd": tax.get("total_liability"),
            "total_harvest_opportunity_usd": tax.get("total_harvest_opp"),
            "tax_alpha_score": tax_pts,
            "narrative": tax.get("narrative"),
            "top_harvest_positions": tax.get("harvestable_top3", []),
            "top_liability_positions": tax.get("liability_top3", []),
            "tax_neutral_pairs": tax.get("tax_neutral_pairs", []),
        },
        "risk_sentinel_agent": sentinel,
        "alpha_scout_agent": alpha,
        "critic_findings": crit,
    }

    swarm_state_json = json.dumps(swarm_state_payload, indent=2, default=str)
    system_prompt = _IC_SYSTEM_PROMPT.format(swarm_state_json=swarm_state_json)

    # ── Derive canonical regime label (market_regime_agent is authoritative) ───
    regime_label = mkt_regime.get("regime") or strategist_parsed.get(
        "regime", "Unknown"
    )

    # ── IC Briefing user turn ──────────────────────────────────────────────────
    user_content = (
        f"Generate the full Investment Committee Briefing for this portfolio. "
        f"Total AUM: ${state['total_value']:,.0f}. DNA Score: {dna_score}/100. "
        "Use the exact 5-section markdown structure specified in your instructions. "
        "Incorporate Risk Sentinel findings in section 2 and Alpha Scout opportunities in section 5. "
        "Every claim must cite a number from the input data."
    )

    # ── Structured Investment Thesis prompt ────────────────────────────────────
    sentinel_risks = sentinel.get("primary_risks", [])
    alpha_syms = [
        o.get("symbol", "")
        for o in alpha.get("opportunities", [])[:3]
        if o.get("symbol")
    ]
    tax_narrative = (tax.get("narrative") or "")[:200]

    struct_prompt = f"""You are a portfolio synthesizer. Generate a structured Investment Thesis JSON.

Input:
- DNA Score: {dna_score}/100
- Macro Regime: {regime_label}  |  Regime confidence: {mkt_regime.get("confidence", "N/A")}
- Risk Level: {sentinel.get("risk_level", "medium")}
- Primary Risks: {sentinel_risks[:3]}
- Alpha Opportunities: {alpha_syms}
- Tax Narrative: {tax_narrative or "N/A"}
- Critic: {crit[:200] if crit else "No critical issues"}
- Regime Drivers: {mkt_regime.get("drivers", [])}

Return ONLY valid JSON matching this exact schema:
{{
  "headline": "single sentence: portfolio identity + single biggest risk today",
  "regime": "{regime_label}",
  "portfolio_health": {dna_score},
  "macro_outlook": "one sentence on portfolio alignment with current {regime_label} regime",
  "risks": ["most critical risk", "second risk", "third risk"],
  "opportunities": ["opportunity 1 with ticker", "opportunity 2 with ticker"],
  "tax_strategy": ["specific tax action 1", "specific tax action 2"],
  "action_plan": ["90-day action 1", "90-day action 2", "90-day action 3"]
}}"""

    trace.append(
        f"[Synthesizer] Engaging PE MD persona (DNA={dna_score}/100, regime={regime_label})..."
    )

    # ── Run IC Briefing + Structured Thesis in parallel ────────────────────────
    briefing_result, struct_result = await asyncio.gather(
        get_ai_briefing(system_prompt, user_content),
        get_ai_analysis(struct_prompt),
        return_exceptions=True,
    )

    # IC Briefing
    if isinstance(briefing_result, Exception):
        briefing_md = (
            f"## 1. Executive Summary\n"
            f"Analysis engine encountered an error: {briefing_result}. "
            f"Raw DNA score: {dna_score}/100.\n\n"
            f"## 5. The 90-Day Directive\n"
            f"- Review the swarm metrics manually and re-run the analysis.\n"
        )
        trace.append(
            f"[Synthesizer] IC Briefing failed ({briefing_result}) — fallback returned."
        )
    else:
        briefing_md = briefing_result
        trace.append(
            "[Synthesizer] IC Briefing generated — 5-section markdown complete."
        )

    # Structured Thesis
    if isinstance(struct_result, Exception) or not isinstance(struct_result, dict):
        struct_result = {}
        trace.append(
            "[Synthesizer] Structured thesis generation failed — defaults applied."
        )
    else:
        trace.append("[Synthesizer] Structured Investment Thesis JSON generated.")

    thesis = {
        # ── Existing fields — backward-compatible with /api/swarm/analyze ───────
        "briefing": briefing_md,
        "dna_score": dna_score,
        "score_breakdown": score_breakdown,
        "weighted_beta": risk.get("weighted_beta"),
        "sharpe_ratio": risk.get("sharpe_ratio"),
        "avg_correlation": risk.get("avg_corr"),
        "regime": regime_label,
        "stress_results": risk.get("stress_results", []),
        "risk_factors": risk.get("risk_factors", []),
        # ── New structured Investment Thesis fields ───────────────────────────
        "headline": struct_result.get(
            "headline",
            f"DNA Score {dna_score}/100 — {sentinel.get('risk_level', 'medium').upper()} risk in {regime_label} regime",
        ),
        "portfolio_health": int(struct_result.get("portfolio_health", dna_score)),
        "macro_outlook": struct_result.get(
            "macro_outlook", mkt_regime.get("portfolio_implication", "")
        ),
        "risks": struct_result.get("risks", sentinel_risks[:3]),
        "opportunities": struct_result.get("opportunities", alpha_syms),
        "tax_strategy": struct_result.get("tax_strategy", []),
        "action_plan": struct_result.get("action_plan", []),
        # ── New agent output objects (accessible to frontend) ─────────────────
        "market_regime": mkt_regime,
        "risk_sentinel": sentinel,
        "alpha_scout": alpha,
    }

    # ── Structured intel for 6-card Research Intelligence Grid ─────────────────
    try:
        _strat = json.loads(macro) if macro and macro not in ("N/A", "") else {}
    except Exception:
        _strat = {}

    _sentiment_text = (
        _strat.get("regime_implication", "")
        + " "
        + _strat.get("positioning_advice", "")
    ).lower()
    thesis["strategist_intel"] = {
        "narrative": _strat.get(
            "regime_implication", mkt_regime.get("portfolio_implication", "")
        ),
        "key_drivers": mkt_regime.get("drivers", [])[:3],
        "news_risks": _strat.get("news_risks", []),
        "hedge_positions": _strat.get("hedge_positions", []),
        "positioning_advice": _strat.get("positioning_advice", ""),
        "sentiment": (
            "cautious"
            if any(
                w in _sentiment_text
                for w in ("risk", "pressure", "volatile", "concern", "headwind", "weak")
            )
            else "constructive"
        ),
    }

    thesis["quant_analysis"] = {
        "hhi_pts": hhi_pts,
        "hhi_interpretation": (
            "Extreme Concentration"
            if hhi_pts < 8
            else (
                "High Concentration"
                if hhi_pts < 15
                else "Moderate" if hhi_pts < 20 else "Diversified"
            )
        ),
        "weighted_beta": risk.get("weighted_beta"),
        "beta_map": risk.get("beta_map", {}),
        "sharpe_ratio": risk.get("sharpe_ratio"),
        "sharpe_rating": risk.get("sharpe_rating"),
        "avg_corr": risk.get("avg_corr"),
        "clusters": risk.get("clusters", []),
        "corr_matrix_data": risk.get("corr_matrix_data", {"symbols": [], "values": []}),
        "top_symbols": [
            t["symbol"]
            for t in sorted(
                state["ticker_data"], key=lambda x: x.get("weight", 0), reverse=True
            )[:5]
        ],
    }
    if isinstance(external_quant, dict) and external_quant:
        thesis["quant_analysis"]["pre_swarm_quant_model"] = external_quant
        thesis["quant_analysis"]["model_contribution_summary"] = (
            external_quant.get("model_contribution")
            or external_quant.get("model_contribution_breakdown")
            or {}
        )

    _liability = tax.get("total_liability") or 0
    thesis["tax_report"] = {
        "available": tax.get("available", False),
        "total_liability": _liability,
        "harvest_opportunities": tax.get("harvestable_top3", []),
        "liability_top3": tax.get("liability_top3", []),
        "tax_drag_pct": (
            round(_liability / max(state["total_value"], 1) * 100, 2)
            if tax.get("available")
            else None
        ),
        "tax_pts": tax.get("tax_pts", 10),
        "narrative": tax.get("narrative", ""),
        "tax_neutral_pairs": tax.get("tax_neutral_pairs", []),
    }

    return {"investment_thesis": thesis, "agent_trace": trace}


# ══════════════════════════════════════════════════════════════════════════════
# Graph wiring
# ══════════════════════════════════════════════════════════════════════════════
def _build_swarm():
    """
    Build and compile the LangGraph state machine.

    Topology:
      START → market_regime → strategist → quant → tax_arch
                                                       → risk_sentinel → alpha_scout → critic → synthesizer → END
                                                                                 └──(revision)──→ quant

    market_regime runs first (before strategist) to establish the authoritative
    5-category regime label used by alpha_scout and the synthesizer.

    risk_sentinel and alpha_scout run after tax_arch so they have access to the
    full quant + tax outputs before the critic reviews everything.

    The critic revision loop (critic → quant) also traverses risk_sentinel →
    alpha_scout on the second pass, ensuring all watchdog agents see updated metrics.
    """
    builder = StateGraph(SwarmState)

    builder.add_node("market_regime", market_regime_node)
    builder.add_node("strategist", strategist_node)
    builder.add_node("quant", quant_node)
    builder.add_node("tax_arch", tax_arch_node)
    builder.add_node("risk_sentinel", risk_sentinel_node)
    builder.add_node("alpha_scout", alpha_scout_node)
    builder.add_node("critic", critic_node)
    builder.add_node("synthesizer", synthesizer_node)

    builder.add_edge(START, "market_regime")
    builder.add_edge("market_regime", "strategist")
    builder.add_edge("strategist", "quant")
    builder.add_edge("quant", "tax_arch")
    builder.add_edge("tax_arch", "risk_sentinel")
    builder.add_edge("risk_sentinel", "alpha_scout")
    builder.add_edge("alpha_scout", "critic")

    # Critic can route back to quant (once) or forward to synthesizer.
    # On revision: quant → tax_arch → risk_sentinel → alpha_scout → critic (second pass).
    def _route_critic(state: SwarmState) -> str:
        if state.get("needs_revision") and state.get("revision_count", 0) <= 1:
            return "quant"
        return "synthesizer"

    builder.add_conditional_edges(
        "critic",
        _route_critic,
        {"quant": "quant", "synthesizer": "synthesizer"},
    )
    builder.add_edge("synthesizer", END)

    return builder.compile()


# ── Sequential fallback (when langgraph not installed) ─────────────────────────
async def _run_sequential(initial_state: dict) -> SwarmState:
    """Run all 7 agents in order without LangGraph."""
    state: dict = dict(initial_state)
    for node_fn in [
        market_regime_node,
        strategist_node,
        quant_node,
        tax_arch_node,
        risk_sentinel_node,
        alpha_scout_node,
        critic_node,
        synthesizer_node,
    ]:
        update = await node_fn(state)  # type: ignore[arg-type]
        for k, v in update.items():
            if k == "agent_trace":
                state["agent_trace"] = state.get("agent_trace", []) + v
            else:
                state[k] = v
    return state  # type: ignore[return-value]


# ── Module-level compiled graph ─────────────────────────────────────────────────
if _LANGGRAPH:
    swarm = _build_swarm()
else:
    swarm = None


def _build_swarm_sources(state: dict[str, Any]) -> dict[str, Any]:
    """
    Explainability payload: data sources and methodology (not legal advice).
    """
    symbols: list[str] = []
    for t in state.get("ticker_data") or []:
        if isinstance(t, dict) and t.get("symbol"):
            symbols.append(str(t["symbol"]).upper())
    symbols = list(dict.fromkeys(symbols))[:50]
    return {
        "items": [
            {
                "id": "fred",
                "label": "FRED (St. Louis Fed)",
                "description": "CPI and macro series for regime classification.",
            },
            {
                "id": "finnhub",
                "label": "Finnhub",
                "description": "Company news flow for strategist context.",
            },
            {
                "id": "market_data",
                "label": "Multi-provider price history",
                "description": (
                    "Alpha Vantage, Finnhub, Polygon, or cached series (Redis/Supabase) "
                    "for returns, beta, correlation, Sharpe."
                ),
            },
            {
                "id": "neufin_risk",
                "label": "NeuFin risk engine",
                "description": "Concentration (HHI), stress tests, DNA score components.",
            },
            {
                "id": "llm",
                "label": "Multi-model AI synthesis",
                "description": (
                    "Claude → OpenAI → Gemini → Groq fallback for IC briefing "
                    "and structured thesis."
                ),
            },
        ],
        "tickers": symbols,
        "disclaimer": (
            "Outputs are model-assisted and for informational purposes only; "
            "not investment advice. Verify material facts independently."
        ),
    }


async def run_swarm(
    ticker_data: list[dict] | dict,
    total_value: float,
    job_id: str | None = None,
    external_quant_intelligence: dict | None = None,
) -> dict:
    """
    Primary entry point: run the full 7-agent swarm and return the final state.

    Works whether or not langgraph is installed.
    """
    normalized_ticker_data = (
        list(ticker_data.values()) if isinstance(ticker_data, dict) else ticker_data
    )

    step_log: list[dict[str, Any]] = []

    async def _trace(
        agent: str,
        status: str,
        summary: str = "",
        *,
        duration_ms: float | None = None,
        step_meta: dict[str, Any] | None = None,
    ) -> None:
        entry: dict[str, Any] = {
            "agent": agent,
            "status": status,
            "summary": summary,
            "ts": datetime.datetime.now(datetime.UTC).isoformat(),
        }
        if duration_ms is not None:
            entry["duration_ms"] = round(duration_ms, 2)
        if step_meta:
            entry["meta"] = step_meta
        step_log.append(entry)

        log_kw: dict[str, Any] = {
            "job_id": job_id,
            "agent": agent,
            "status": status,
            "duration_ms": duration_ms,
        }
        if summary:
            log_kw["summary_preview"] = summary[:200]
        if step_meta:
            log_kw["step_meta"] = step_meta
        logger.info("swarm.step", **log_kw)

        if not job_id:
            return
        job = await get_swarm_job(job_id)
        trace = job.get("agent_trace", []) if job else []
        trace.append(entry)
        await update_swarm_job(job_id, agent_trace=trace)

    def _attach_observability(out: dict[str, Any]) -> None:
        out["sources"] = _build_swarm_sources(out)
        out["observability"] = {
            "steps": step_log,
            "pipeline": "7-agent",
            "runtime": "langgraph" if swarm is not None else "sequential",
        }

    initial: dict = {
        "ticker_data": normalized_ticker_data,
        "total_value": total_value,
        "external_quant_intelligence": external_quant_intelligence or {},
        "macro_context": "",
        "market_regime": {},
        "risk_metrics": {},
        "tax_estimates": {},
        "risk_sentinel_output": {},
        "alpha_opportunities": {},
        "critique": "",
        "revision_count": 0,
        "needs_revision": False,
        "investment_thesis": {},
        "agent_trace": [],
    }

    if swarm is not None:
        # Manual orchestration with trace hooks to emit per-agent progress.
        state: dict = dict(initial)
        nodes: list[tuple[str, callable]] = [
            ("market_regime", market_regime_node),
            ("strategist", strategist_node),
            ("quant", quant_node),
            ("tax_architect", tax_arch_node),
            ("risk_sentinel", risk_sentinel_node),
            ("alpha_scout", alpha_scout_node),
            ("critic", critic_node),
        ]
        for agent, node_fn in nodes:
            t0 = time.perf_counter()
            await _trace(agent, "running")
            update = await node_fn(state)  # type: ignore[arg-type]
            for k, v in update.items():
                if k == "agent_trace":
                    state["agent_trace"] = state.get("agent_trace", []) + v
                else:
                    state[k] = v
            await _trace(
                agent,
                "complete",
                "",
                duration_ms=(time.perf_counter() - t0) * 1000,
                step_meta={"phase": "primary"},
            )
            if (
                agent == "critic"
                and state.get("needs_revision")
                and state.get("revision_count", 0) <= 1
            ):
                # Keep existing behavior: quant->tax->risk->alpha->critic second pass.
                for revision_agent, revision_fn in [
                    ("quant", quant_node),
                    ("tax_architect", tax_arch_node),
                    ("risk_sentinel", risk_sentinel_node),
                    ("alpha_scout", alpha_scout_node),
                    ("critic", critic_node),
                ]:
                    rt0 = time.perf_counter()
                    await _trace(
                        revision_agent,
                        "running",
                        "revision pass triggered by critic",
                    )
                    revision_update = await revision_fn(state)  # type: ignore[arg-type]
                    for k, v in revision_update.items():
                        if k == "agent_trace":
                            state["agent_trace"] = state.get("agent_trace", []) + v
                        else:
                            state[k] = v
                    await _trace(
                        revision_agent,
                        "complete",
                        "revision pass complete",
                        duration_ms=(time.perf_counter() - rt0) * 1000,
                        step_meta={"phase": "revision"},
                    )

        st0 = time.perf_counter()
        await _trace("synthesizer", "running")
        synth_update = await synthesizer_node(state)  # type: ignore[arg-type]
        for k, v in synth_update.items():
            if k == "agent_trace":
                state["agent_trace"] = state.get("agent_trace", []) + v
            else:
                state[k] = v
        await _trace(
            "synthesizer",
            "complete",
            "",
            duration_ms=(time.perf_counter() - st0) * 1000,
        )
        final_output = state
        _attach_observability(final_output)
        if job_id:
            await update_swarm_job(job_id, status="complete", result=final_output)
        return final_output

    # Sequential fallback runtime (langgraph unavailable).
    state = dict(initial)
    for agent, node_fn in [
        ("market_regime", market_regime_node),
        ("strategist", strategist_node),
        ("quant", quant_node),
        ("tax_architect", tax_arch_node),
        ("risk_sentinel", risk_sentinel_node),
        ("alpha_scout", alpha_scout_node),
        ("critic", critic_node),
        ("synthesizer", synthesizer_node),
    ]:
        t0 = time.perf_counter()
        await _trace(agent, "running")
        update = await node_fn(state)  # type: ignore[arg-type]
        for k, v in update.items():
            if k == "agent_trace":
                state["agent_trace"] = state.get("agent_trace", []) + v
            else:
                state[k] = v
        await _trace(
            agent,
            "complete",
            "",
            duration_ms=(time.perf_counter() - t0) * 1000,
            step_meta={"phase": "sequential"},
        )
    _attach_observability(state)
    if job_id:
        await update_swarm_job(job_id, status="complete", result=state)
    return state


# ══════════════════════════════════════════════════════════════════════════════
# Chat routing helper (Bloomberg-style agentic chat)
# ══════════════════════════════════════════════════════════════════════════════
_CHAT_ROUTES = {
    "tax": ["tax", "harvest", "cost basis", "capital gains", "liability", "cgt"],
    "quant": [
        "risk",
        "correlation",
        "beta",
        "sharpe",
        "volatility",
        "hhi",
        "concentration",
    ],
    "macro": ["news", "macro", "inflation", "cpi", "market", "economy", "fed", "rate"],
}


def _classify_question(message: str) -> str:
    msg_lower = message.lower()
    for agent, keywords in _CHAT_ROUTES.items():
        if any(kw in msg_lower for kw in keywords):
            return agent
    return "synthesizer"


async def chat_with_swarm(
    message: str,
    ticker_data: list[dict],
    total_value: float,
) -> dict:
    """
    Route a natural-language question to the most relevant agent.
    Returns {"response": dict, "agent": str, "thinking_steps": list[str]}.
    """
    agent = _classify_question(message)
    thinking: list[str] = [
        f"[Router] Question classified → routing to {agent.upper()} agent"
    ]

    # Build minimal state (chat only runs the relevant single node)
    initial: dict = {
        "ticker_data": ticker_data,
        "total_value": total_value,
        "macro_context": "",
        "market_regime": {},
        "risk_metrics": {},
        "tax_estimates": {},
        "risk_sentinel_output": {},
        "alpha_opportunities": {},
        "critique": "",
        "revision_count": 0,
        "needs_revision": False,
        "investment_thesis": {},
        "agent_trace": [],
    }

    # Run only the relevant node + synthesizer for a focused response
    if agent == "tax":
        thinking.append("[Tax Architect] Analysing cost basis and tax position...")
        tax_update = await tax_arch_node(initial)  # type: ignore[arg-type]
        initial.update(tax_update)
        thinking += tax_update.get("agent_trace", [])
    elif agent == "quant":
        thinking.append("[Quant] Running quantitative risk model...")
        quant_update = await quant_node(initial)  # type: ignore[arg-type]
        initial.update(quant_update)
        thinking += quant_update.get("agent_trace", [])
    elif agent == "macro":
        thinking.append("[Strategist] Fetching market news and macro data...")
        strat_update = await strategist_node(initial)  # type: ignore[arg-type]
        initial.update(strat_update)
        thinking += strat_update.get("agent_trace", [])

    # Synthesize a focused answer
    context = {
        "tax": initial.get("tax_estimates"),
        "quant": initial.get("risk_metrics"),
        "macro": initial.get("macro_context"),
    }
    thinking.append("[Synthesizer] Generating targeted response...")
    answer_prompt = f"""You are a portfolio advisor answering this specific question:

"{message}"

Available context:
{json.dumps(context, indent=2, default=str)}

Portfolio total value: ${total_value:,.2f}

Return ONLY valid JSON:
{{
  "answer": "direct 2-3 sentence answer to the question",
  "key_numbers": {{"metric_name": "value"}},
  "recommended_action": "one specific actionable step"
}}"""
    try:
        response = await get_ai_analysis(answer_prompt)
    except Exception as e:
        response = {
            "answer": f"Analysis available in full swarm report. Error: {e}",
            "key_numbers": {},
            "recommended_action": "Run /api/swarm/analyze for full report.",
        }

    return {"response": response, "agent": agent, "thinking_steps": thinking}
