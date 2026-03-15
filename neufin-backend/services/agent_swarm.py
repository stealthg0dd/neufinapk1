"""
agent_swarm.py — Neufin Agentic Swarm (LangGraph orchestration)

Four specialised agents run in a directed graph, sharing a typed state object.
Each node appends to agent_trace for the Bloomberg-style "Thinking Trace" UI.

Graph topology:
  START → strategist → quant → tax_arch → critic → synthesizer → END
                                               └──(revision)──→ quant

Agents
------
  Strategist   Finnhub company news + FRED CPI → market-regime narrative
  Quant        HHI, weighted beta, Sharpe, Pearson correlation clusters
  Tax Architect  Per-position liability / harvest analysis at 20% LT-CGT
  Critic         Challenges the quant model; triggers one revision pass
  Synthesizer    Combines all outputs into a structured Investment Thesis

Fallback: if langgraph is not installed the same nodes run sequentially.
"""

from __future__ import annotations

import os
import sys
import json
import time
import asyncio
import operator
import datetime
import requests
import numpy as np
import pandas as pd
from typing import TypedDict, Annotated, Any
from dotenv import load_dotenv

# ── LangGraph (optional — graceful fallback) ───────────────────────────────────
try:
    from langgraph.graph import StateGraph, START, END
    _LANGGRAPH = True
except ImportError:
    _LANGGRAPH = False
    print("[Swarm] langgraph not installed — running in sequential fallback mode", file=sys.stderr)

# ── Service imports ────────────────────────────────────────────────────────────
from services.risk_engine import (
    _fetch_daily_closes_av,
    build_correlation_matrix,
    find_correlation_clusters,
    correlation_penalty_score,
    format_clusters_for_ai,
)
from services.calculator import (
    fetch_beta,
    _hhi_score, _beta_score, _tax_alpha_score,
    get_tax_impact_analysis,
    get_tax_neutral_pairs,
)
from services.ai_router import get_ai_analysis, get_ai_briefing
from services.stress_tester import run_stress_tests, compute_factor_metrics, StressTester

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
FINNHUB_API_KEY = os.environ.get("FINNHUB_API_KEY")
FRED_API_KEY    = os.environ.get("FRED_API_KEY")
if not FINNHUB_API_KEY or not FRED_API_KEY:
    load_dotenv()
    FINNHUB_API_KEY = FINNHUB_API_KEY or os.getenv("FINNHUB_API_KEY")
    FRED_API_KEY    = FRED_API_KEY    or os.getenv("FRED_API_KEY")

# fredapi is optional — graceful fallback if not installed
try:
    from fredapi import Fred as _Fred
    _FREDAPI_AVAILABLE = True
except ImportError:
    _Fred = None  # type: ignore[assignment,misc]
    _FREDAPI_AVAILABLE = False
    print("[Swarm] fredapi not installed — falling back to raw FRED requests", file=sys.stderr)

_RISK_FREE_ANNUAL = 0.053     # ~Fed funds rate — override via env var
_CORR_REVISION_THRESHOLD = 0.80   # critic triggers quant revision above this


# ══════════════════════════════════════════════════════════════════════════════
# Shared State
# ══════════════════════════════════════════════════════════════════════════════
class SwarmState(TypedDict):
    # ── Input (caller must provide) ────────────────────────────────────────────
    ticker_data:  list[dict]    # [{symbol, shares, price, value, weight, cost_basis?}]
    total_value:  float

    # ── Agent outputs ──────────────────────────────────────────────────────────
    macro_context:  str         # Strategist: regime + news summary
    risk_metrics:   dict        # Quant: HHI, beta, Sharpe, correlation
    tax_estimates:  dict        # Tax Architect: liability + harvesting
    critique:       str         # Critic: issues to address

    # ── Control ────────────────────────────────────────────────────────────────
    revision_count: int         # Critic uses this to cap revision loops at 1
    needs_revision: bool        # Critic sets True to trigger quant re-run

    # ── Final output ───────────────────────────────────────────────────────────
    investment_thesis: dict     # Synthesizer JSON

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
        date_to   = datetime.date.today().isoformat()
        date_from = (datetime.date.today() - datetime.timedelta(days=days)).isoformat()
        r = requests.get(
            "https://finnhub.io/api/v1/company-news",
            params={"symbol": symbol, "from": date_from, "to": date_to, "token": FINNHUB_API_KEY},
            timeout=6.0,
        )
        items = r.json() if isinstance(r.json(), list) else []
        # Return top-3 headlines to keep prompts concise
        return [{"headline": i.get("headline", ""), "summary": i.get("summary", "")[:200]}
                for i in items[:3]]
    except Exception as e:
        print(f"[Swarm/Strategist] News fetch failed for {symbol}: {e}", file=sys.stderr)
        return []


def _get_fred_cpi_analysis() -> dict:
    """
    Fetch the last 13 months of CPIAUCSL from FRED using fredapi.
    Calculates YoY % and 3-month annualised trend to classify macro regime.

    Falls back to the raw FRED REST API if fredapi is not installed.
    Returns a dict with: yoy_pct, trend_3m_ann, regime, regime_description.
    """
    _EMPTY = {"yoy_pct": None, "trend_3m_ann": None, "regime": "Unknown", "regime_description": "FRED data unavailable."}
    if not FRED_API_KEY:
        return _EMPTY

    values: list[float] = []

    # ── 1. fredapi (preferred) ────────────────────────────────────────────────
    if _FREDAPI_AVAILABLE and _Fred is not None:
        try:
            fred = _Fred(api_key=FRED_API_KEY)
            start_date = (datetime.date.today() - datetime.timedelta(days=420)).isoformat()
            cpi_series = fred.get_series("CPIAUCSL", observation_start=start_date)
            values = [float(v) for v in cpi_series.dropna().tolist()]
        except Exception as e:
            print(f"[Swarm/FRED] fredapi fetch failed: {e}", file=sys.stderr)

    # ── 2. Raw requests fallback ──────────────────────────────────────────────
    if not values:
        try:
            r = requests.get(
                "https://api.stlouisfed.org/fred/series/observations",
                params={"series_id": "CPIAUCSL", "api_key": FRED_API_KEY,
                        "sort_order": "asc", "limit": "14", "file_type": "json"},
                timeout=8.0,
            )
            obs = r.json().get("observations", [])
            values = [float(o["value"]) for o in obs if o.get("value") not in (".", None)]
        except Exception as e:
            print(f"[Swarm/FRED] Raw request also failed: {e}", file=sys.stderr)
            return _EMPTY

    if len(values) < 12:
        return _EMPTY

    yoy_pct     = round((values[-1] / values[-13] - 1.0) * 100, 2)
    # 3-month annualised: (last / 3-months-ago)^4 - 1
    trend_3m_ann = round(((values[-1] / values[-4]) ** 4 - 1.0) * 100, 2) if len(values) >= 4 else yoy_pct

    # Regime classification — trend > 3% YoY triggers "Inflationary"
    if yoy_pct > 5.0:
        regime      = "High Inflation"
        description = (f"CPI YoY {yoy_pct:.1f}% far exceeds the 2% target — "
                       "real assets and commodities are defensive tilts.")
    elif yoy_pct > 3.0:
        regime      = "Inflationary"
        description = (f"CPI YoY {yoy_pct:.1f}% is above the 3% threshold — "
                       "rate-sensitive sectors face pressure; energy and materials offer a hedge.")
    elif yoy_pct > 2.0:
        regime      = "Elevated Inflation"
        description = (f"CPI YoY {yoy_pct:.1f}% is above the Fed's 2% target — "
                       "monitor duration risk in bond-proxy equities.")
    elif yoy_pct > 0:
        regime      = "Target Inflation"
        description = f"CPI YoY {yoy_pct:.1f}% is near the Fed target — growth equities are favoured."
    else:
        regime      = "Disinflationary"
        description = f"CPI YoY {yoy_pct:.1f}% — below target, watch for growth slowdown signals."

    return {
        "yoy_pct":          yoy_pct,
        "trend_3m_ann":     trend_3m_ann,
        "regime":           regime,
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
    news_tasks  = [asyncio.to_thread(_fetch_finnhub_news, sym) for sym in top3]
    cpi_task    = asyncio.to_thread(_get_fred_cpi_analysis)
    news_lists, cpi_data = await asyncio.gather(
        asyncio.gather(*news_tasks),
        cpi_task,
    )
    news_map = dict(zip(top3, news_lists))

    regime   = cpi_data["regime"]
    yoy_str  = f"{cpi_data['yoy_pct']:.1f}%" if cpi_data["yoy_pct"] is not None else "N/A"
    trend_str = f"{cpi_data['trend_3m_ann']:.1f}%" if cpi_data["trend_3m_ann"] is not None else "N/A"
    trace.append(f"[Strategist] FRED CPI YoY={yoy_str}, 3m-ann={trend_str} → Regime: {regime}")

    for sym, items in news_map.items():
        trace.append(f"[Strategist] {sym}: {len(items)} news item(s) retrieved")

    # ── AI synthesis ──────────────────────────────────────────────────────────
    news_text = "\n".join(
        f"  {sym}: " + "; ".join(n["headline"] for n in items[:3])
        if items else f"  {sym}: no recent news"
        for sym, items in news_map.items()
    )
    top_tickers = [t["symbol"] for t in state["ticker_data"][:5]]

    prompt = f"""You are a macro strategist at a top-tier hedge fund.

Current macro regime: {regime}
CPI YoY: {yoy_str}  |  3-month annualised trend: {trend_str}
Regime description: {cpi_data["regime_description"]}

Recent news for top 3 portfolio holdings:
{news_text}

Full portfolio (top 5): {', '.join(top_tickers)}

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
        trace.append(f"[Strategist] Regime synthesis complete — {regime} implications generated.")
    except Exception as e:
        macro_context = json.dumps({
            "regime": regime, "cpi_yoy": yoy_str,
            "regime_implication": cpi_data["regime_description"],
            "hedge_positions": [], "news_risks": [], "positioning_advice": "N/A",
        })
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
            asyncio.create_task(notify_fn(
                regime=regime,
                cpi_yoy=yoy_str,
                body_text=body,
                affected_symbols=affected,
            ))
            trace.append(f"[Strategist] ▲ Push alert queued for {len(affected)} symbol(s) — Regime: {regime}")

    return {"macro_context": macro_context, "agent_trace": trace}


async def quant_node(state: SwarmState) -> dict:
    """
    Quant Agent — HHI concentration, weighted beta, Sharpe ratio, correlation clusters.
    """
    trace: list[str] = []
    trace.append("[Quant] Building quantitative risk model...")

    ticker_data  = state["ticker_data"]
    total_value  = state["total_value"]
    revision     = state.get("revision_count", 0)
    corr_threshold = 0.65 if revision > 0 else 0.75   # stricter on revision

    symbols  = [t["symbol"] for t in ticker_data]
    weights  = {t["symbol"]: t.get("weight", 0.0) for t in ticker_data}
    df = pd.DataFrame(ticker_data)

    # ── HHI concentration ─────────────────────────────────────────────────────
    weight_series = pd.Series([t.get("weight", 0.0) for t in ticker_data])
    hhi_pts = _hhi_score(weight_series)
    trace.append(f"[Quant] HHI concentration score: {hhi_pts}/25")

    # ── Weighted beta ─────────────────────────────────────────────────────────
    trace.append(f"[Quant] Fetching beta for {len(symbols)} symbols...")
    betas = await asyncio.gather(*[asyncio.to_thread(fetch_beta, s) for s in symbols])
    beta_map = dict(zip(symbols, [b if isinstance(b, float) else 1.0 for b in betas]))
    weighted_beta = sum(weights.get(s, 0.0) * beta_map.get(s, 1.0) for s in symbols)
    beta_pts = _beta_score(weighted_beta)
    trace.append(f"[Quant] Weighted beta: {weighted_beta:.3f} → beta_score: {beta_pts}/25")

    # ── Sharpe ratio ──────────────────────────────────────────────────────────
    sharpe = await asyncio.to_thread(_compute_portfolio_sharpe, symbols, weights)
    sharpe_rating = "Strong" if sharpe > 1.0 else "Acceptable" if sharpe > 0.5 else "Weak" if sharpe > 0 else "Negative"
    trace.append(f"[Quant] Annualised Sharpe ratio: {sharpe} ({sharpe_rating})")

    # ── Correlation clusters ───────────────────────────────────────────────────
    trace.append(f"[Quant] Building 60-day Pearson correlation matrix (threshold ρ>{corr_threshold})...")
    corr_matrix = await asyncio.to_thread(build_correlation_matrix, symbols)
    clusters    = find_correlation_clusters(corr_matrix, weights, threshold=corr_threshold)
    corr_pts, avg_corr = correlation_penalty_score(clusters, corr_matrix)
    cluster_summary = format_clusters_for_ai(clusters)

    if clusters:
        trace.append(f"[Quant] ⚠ {len(clusters)} correlation cluster(s) found. avg_corr={avg_corr:.3f} → corr_score: {corr_pts}/30")
    else:
        trace.append(f"[Quant] No significant clusters. avg_corr={avg_corr:.3f} → corr_score: {corr_pts}/30")

    # ── Stress tests + factor metrics (run in parallel) ───────────────────────
    trace.append("[Quant] Running historical regime stress tests (2022 Rate Shock, 2020 Crash, 2024 AI Correction)...")
    portfolio_df = pd.DataFrame([
        {"ticker": s, "weight": weights.get(s, 1.0 / len(symbols))}
        for s in symbols
    ])
    stress_dict, factor_metrics = await asyncio.gather(
        StressTester().run_stress_test(portfolio_df),
        asyncio.to_thread(compute_factor_metrics, symbols, weights),
    )
    stress_results = StressTester.to_list(stress_dict)
    for sr in stress_results:
        fragility = " ⚠ STRUCTURAL FRAGILITY" if sr["portfolio_return_pct"] <= -20 else ""
        trace.append(
            f"[Quant] {sr['label']}: portfolio={sr['portfolio_return_pct']:+.1f}% "
            f"vs SPY={sr['spy_return_pct']:+.1f}% "
            f"(α={sr['outperformance_vs_spy_pct']:+.1f}%){fragility}"
        )
    high_risk = [f["symbol"] for f in factor_metrics if f.get("risk_tier") == "HIGH"]
    if high_risk:
        trace.append(f"[Quant] ⚠ High-risk factor cluster: {', '.join(high_risk)} (β>1.5 + SPY ρ>0.80)")

    # ── Assemble risk_metrics ─────────────────────────────────────────────────
    risk_metrics = {
        "hhi_pts":          hhi_pts,
        "beta_pts":         beta_pts,
        "weighted_beta":    round(weighted_beta, 3),
        "beta_map":         {s: round(b, 3) for s, b in beta_map.items()},
        "sharpe_ratio":     sharpe,
        "sharpe_rating":    sharpe_rating,
        "corr_pts":         corr_pts,
        "avg_corr":         avg_corr,
        "clusters":         clusters,
        "cluster_summary":  cluster_summary,
        "corr_threshold":   corr_threshold,
        "total_score":      round(hhi_pts + beta_pts + corr_pts, 2),
        "stress_results":   stress_results,
        "risk_factors":     factor_metrics,
    }
    trace.append(f"[Quant] Risk model complete. Sub-total (excl. tax): {risk_metrics['total_score']}/80")

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
    liability  = tax_analysis["total_liability"]
    harvest    = tax_analysis["total_harvest_opp"]

    # Top 3 harvesting pairs (largest losses)
    harvestable = sorted(
        [p for p in positions if p["harvest_credit"] > 0],
        key=lambda x: x["harvest_credit"], reverse=True
    )[:3]

    # Top 3 tax liabilities
    at_risk = sorted(
        [p for p in positions if p["tax_liability"] > 0],
        key=lambda x: x["tax_liability"], reverse=True
    )[:3]

    trace.append(f"[Tax] Total deferred liability: ${liability:,.0f}")
    trace.append(f"[Tax] Harvesting opportunity: ${harvest:,.0f}")
    if harvestable:
        trace.append(f"[Tax] Top harvest: {', '.join(p['symbol'] for p in harvestable)}")
    if at_risk:
        trace.append(f"[Tax] Highest liability: {', '.join(p['symbol'] for p in at_risk)}")

    # Effective tax alpha score
    tax_pts = _tax_alpha_score(df)
    trace.append(f"[Tax] Tax alpha score: {tax_pts}/20")

    # Tax-neutral pair matchmaking — top-2 gainers offset by specific loser shares
    tax_neutral_pairs = get_tax_neutral_pairs(df)
    if tax_neutral_pairs:
        for pair in tax_neutral_pairs:
            trace.append(f"[Tax] ✦ Tax-Neutral Pair: {pair['recommendation_text']}")
    else:
        trace.append("[Tax] No tax-neutral pairs available (cost basis missing or no offsettable positions).")

    tax_estimates = {
        **tax_analysis,
        "tax_pts":            tax_pts,
        "harvestable_top3":   harvestable,
        "liability_top3":     at_risk,
        "tax_neutral_pairs":  tax_neutral_pairs,
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

    risk    = state.get("risk_metrics", {})
    tax     = state.get("tax_estimates", {})
    macro   = state.get("macro_context", "")
    rev     = state.get("revision_count", 0)

    issues: list[str] = []

    # 1. High correlation flag
    avg_corr = risk.get("avg_corr", 0.0)
    clusters = risk.get("clusters", [])
    if avg_corr > _CORR_REVISION_THRESHOLD and rev == 0:
        issues.append(
            f"Average portfolio correlation {avg_corr:.3f} exceeds {_CORR_REVISION_THRESHOLD} "
            "— hidden concentration risk detected."
        )
        trace.append(f"[Critic] ⚠ HIGH CORRELATION: avg_corr={avg_corr:.3f} — flagging quant for revision with stricter threshold.")
        needs_revision = True
        revision_count = 1
    else:
        needs_revision = False
        revision_count = rev
        if avg_corr > 0.6:
            trace.append(f"[Critic] Moderate correlation detected (avg_corr={avg_corr:.3f}) — noting risk.")
            issues.append(f"Moderate pairwise correlation ({avg_corr:.3f}) warrants diversification review.")
        else:
            trace.append(f"[Critic] Correlation levels acceptable (avg_corr={avg_corr:.3f}).")

    # 2. Beta risk
    wb = risk.get("weighted_beta", 1.0)
    if wb > 1.8:
        issues.append(f"Portfolio weighted beta {wb:.2f} indicates aggressive market exposure — reduce high-beta names.")
        trace.append(f"[Critic] ⚠ AGGRESSIVE BETA: {wb:.2f} — above 1.8 threshold.")

    # 3. Tax liability vs harvest opportunity
    if tax.get("available"):
        liability = tax.get("total_liability", 0)
        harvest   = tax.get("total_harvest_opp", 0)
        if liability > 50_000 and harvest < liability * 0.1:
            issues.append(f"Deferred tax liability ${liability:,.0f} with minimal harvesting offset — consider rebalancing.")
            trace.append(f"[Critic] ⚠ TAX RISK: high liability ${liability:,.0f} with low harvest offset ${harvest:,.0f}.")

    # 4. Sharpe
    sharpe = risk.get("sharpe_ratio", 0.0)
    if sharpe < 0:
        issues.append(f"Negative Sharpe ratio ({sharpe}) — risk-adjusted returns are below the risk-free rate.")
        trace.append(f"[Critic] ⚠ NEGATIVE SHARPE: {sharpe}")

    critique = (
        "Critic identified the following risks:\n• " + "\n• ".join(issues)
        if issues else
        "No critical structural risks flagged by the Critic."
    )
    trace.append(f"[Critic] Review complete. {len(issues)} issue(s) identified.")

    return {
        "critique":       critique,
        "needs_revision": needs_revision,
        "revision_count": revision_count,
        "agent_trace":    trace,
    }


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
correlation clusters with ρ values).

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

- **2022 Rate Shock — Inflationary Trap** (S&P −25.4%, Jan–Oct 2022):
  Quote `md_narrative` from `2022_RATE_SHOCK`. Identify the Weakest Link and its
  weighted contribution. Flag if loss > 20% as **Structural Fragility**.

- **2020 COVID Crash — Pandemic Liquidity Trap** (S&P −20%, Feb–Apr 2020):
  Quote `md_narrative` from `2020_LIQUIDITY`. Name the sector that would have saved or
  sunk this portfolio. All correlations go to 1.0 in liquidity crises — state this.
  Flag if loss > 20% as **Structural Fragility**.

- **2024 AI Correction — Growth Rotation** (S&P −8.5%, Jul–Aug 2024):
  Quote `md_narrative` from `2024_AI_CORRECTION`. Assess whether current AI/tech
  concentration amplifies or hedges this specific scenario.
  Flag if loss > 20% as **Structural Fragility**.

State a final verdict: **"Stress-Resilient"** (no scenario > −15%), **"Market-Correlated"**
(worst scenario within 5% of SPY), or **"Fragile"** (any scenario > −20% loss).
Always cite the single worst scenario return explicitly.

## 5. The 90-Day Directive
3–4 bulleted, non-negotiable actions. Include tax-adjusted sizing where applicable
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

### INPUT DATA TO ANALYZE:
{swarm_state_json}
""".strip()


async def synthesizer_node(state: SwarmState) -> dict:
    """
    Synthesizer Agent — PE Managing Director producing a markdown IC Briefing.

    Calls get_ai_briefing() (not get_ai_analysis) so the output is long-form
    markdown prose, not a JSON blob.  The briefing is stored in
    investment_thesis["briefing"] alongside numeric metadata.
    """
    trace: list[str] = []
    trace.append("[Synthesizer] Compiling swarm outputs for IC Briefing...")

    risk  = state.get("risk_metrics", {})
    tax   = state.get("tax_estimates", {})
    macro = state.get("macro_context", "N/A")
    crit  = state.get("critique", "")

    tax_pts  = tax.get("tax_pts", 10.0)
    hhi_pts  = risk.get("hhi_pts", 0.0)
    beta_pts = risk.get("beta_pts", 0.0)
    corr_pts = risk.get("corr_pts", 0.0)
    dna_score = max(5, min(100, int(hhi_pts + beta_pts + tax_pts + corr_pts)))

    score_breakdown = {
        "hhi_concentration": hhi_pts,
        "beta_risk":         beta_pts,
        "tax_alpha":         tax_pts,
        "correlation":       corr_pts,
    }

    # ── Build structured input for the MD ─────────────────────────────────────
    portfolio_positions = [
        {
            "symbol":     t["symbol"],
            "weight_pct": round(t.get("weight", 0) * 100, 1),
            "value_usd":  round(t.get("value", 0), 2),
            "beta":       round(risk.get("beta_map", {}).get(t["symbol"], 1.0), 2),
        }
        for t in state["ticker_data"]
    ]

    swarm_state_payload = {
        "portfolio": {
            "total_value_usd": round(state["total_value"], 2),
            "positions":       portfolio_positions,
            "dna_score":       dna_score,
            "score_breakdown": score_breakdown,
        },
        "quant_agent": {
            "hhi_concentration_score":  hhi_pts,
            "weighted_beta":            risk.get("weighted_beta"),
            "beta_score":               beta_pts,
            "sharpe_ratio":             risk.get("sharpe_ratio"),
            "sharpe_rating":            risk.get("sharpe_rating"),
            "avg_pairwise_correlation": risk.get("avg_corr"),
            "correlation_score":        corr_pts,
            "correlation_clusters":     risk.get("cluster_summary"),
            "cluster_details":          risk.get("clusters", []),
            "stress_results":           risk.get("stress_results", []),
            "risk_factors":             risk.get("risk_factors", []),
        },
        "strategist_agent": json.loads(macro) if macro and macro not in ("N/A", "") else {"regime": "Unknown"},
        "tax_agent": {
            "cost_basis_available":         tax.get("available", False),
            "total_deferred_liability_usd": tax.get("total_liability"),
            "total_harvest_opportunity_usd": tax.get("total_harvest_opp"),
            "tax_alpha_score":              tax_pts,
            "narrative":                    tax.get("narrative"),
            "top_harvest_positions":        tax.get("harvestable_top3", []),
            "top_liability_positions":      tax.get("liability_top3", []),
            "tax_neutral_pairs":            tax.get("tax_neutral_pairs", []),
        },
        "critic_findings": crit,
    }

    swarm_state_json = json.dumps(swarm_state_payload, indent=2, default=str)
    system_prompt    = _IC_SYSTEM_PROMPT.format(swarm_state_json=swarm_state_json)

    # ── User turn: the explicit briefing request ───────────────────────────────
    user_content = (
        f"Generate the full Investment Committee Briefing for this portfolio. "
        f"Total AUM: ${state['total_value']:,.0f}. DNA Score: {dna_score}/100. "
        "Use the exact 5-section markdown structure specified in your instructions. "
        "Every claim must cite a number from the input data."
    )

    trace.append(f"[Synthesizer] Engaging PE Managing Director persona (DNA={dna_score}/100)...")

    try:
        briefing_md = await get_ai_briefing(system_prompt, user_content)
        trace.append("[Synthesizer] IC Briefing generated — 5-section markdown complete.")
    except Exception as e:
        # Fallback: minimal structured text so the UI always has something to render
        briefing_md = (
            f"## 1. Executive Summary\n"
            f"Analysis engine encountered an error: {e}. "
            f"Raw DNA score: {dna_score}/100.\n\n"
            f"## 5. The 90-Day Directive\n"
            f"- Review the swarm metrics manually and re-run the analysis.\n"
        )
        trace.append(f"[Synthesizer] AI provider failed ({e}) — fallback briefing returned.")

    thesis = {
        "briefing":        briefing_md,
        "dna_score":       dna_score,
        "score_breakdown": score_breakdown,
        "weighted_beta":   risk.get("weighted_beta"),
        "sharpe_ratio":    risk.get("sharpe_ratio"),
        "avg_correlation": risk.get("avg_corr"),
        "regime":          swarm_state_payload["strategist_agent"].get("regime", "Unknown"),
        "stress_results":  risk.get("stress_results", []),
        "risk_factors":    risk.get("risk_factors", []),
    }

    return {"investment_thesis": thesis, "agent_trace": trace}


# ══════════════════════════════════════════════════════════════════════════════
# Graph wiring
# ══════════════════════════════════════════════════════════════════════════════
def _build_swarm():
    """
    Build and compile the LangGraph state machine.

    Topology:
      START → strategist → quant → tax_arch → critic → synthesizer → END

    The critic sets needs_revision=True on the first pass when avg_corr is very
    high. The quant node checks revision_count and tightens its threshold
    accordingly — no explicit back-edge is needed since each node reads shared
    state.  Both passes flow forward through critic → synthesizer.
    """
    builder = StateGraph(SwarmState)

    builder.add_node("strategist",  strategist_node)
    builder.add_node("quant",       quant_node)
    builder.add_node("tax_arch",    tax_arch_node)
    builder.add_node("critic",      critic_node)
    builder.add_node("synthesizer", synthesizer_node)

    builder.add_edge(START,        "strategist")
    builder.add_edge("strategist", "quant")
    builder.add_edge("quant",      "tax_arch")
    builder.add_edge("tax_arch",   "critic")

    # Critic can route back to quant (once) or forward to synthesizer
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
    """Run all agents in order without LangGraph."""
    state: dict = dict(initial_state)
    for node_fn in [strategist_node, quant_node, tax_arch_node, critic_node, synthesizer_node]:
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


async def run_swarm(ticker_data: list[dict], total_value: float) -> dict:
    """
    Primary entry point: run the full agent swarm and return the final state.

    Works whether or not langgraph is installed.
    """
    initial: dict = {
        "ticker_data":        ticker_data,
        "total_value":        total_value,
        "macro_context":      "",
        "risk_metrics":       {},
        "tax_estimates":      {},
        "critique":           "",
        "revision_count":     0,
        "needs_revision":     False,
        "investment_thesis":  {},
        "agent_trace":        [],
    }

    if swarm is not None:
        return await swarm.ainvoke(initial)  # type: ignore[union-attr]
    else:
        return await _run_sequential(initial)


# ══════════════════════════════════════════════════════════════════════════════
# Chat routing helper (Bloomberg-style agentic chat)
# ══════════════════════════════════════════════════════════════════════════════
_CHAT_ROUTES = {
    "tax":        ["tax", "harvest", "cost basis", "capital gains", "liability", "cgt"],
    "quant":      ["risk", "correlation", "beta", "sharpe", "volatility", "hhi", "concentration"],
    "macro":      ["news", "macro", "inflation", "cpi", "market", "economy", "fed", "rate"],
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
    thinking: list[str] = [f"[Router] Question classified → routing to {agent.upper()} agent"]

    # Build minimal state
    initial: dict = {
        "ticker_data":        ticker_data,
        "total_value":        total_value,
        "macro_context":      "",
        "risk_metrics":       {},
        "tax_estimates":      {},
        "critique":           "",
        "revision_count":     0,
        "needs_revision":     False,
        "investment_thesis":  {},
        "agent_trace":        [],
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
        "tax":         initial.get("tax_estimates"),
        "quant":       initial.get("risk_metrics"),
        "macro":       initial.get("macro_context"),
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
        response = {"answer": f"Analysis available in full swarm report. Error: {e}", "key_numbers": {}, "recommended_action": "Run /api/swarm/analyze for full report."}

    return {"response": response, "agent": agent, "thinking_steps": thinking}
