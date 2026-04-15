"""
quant_model_engine.py — Composes quantitative outputs from selected *financial objectives*
(modes), reusing risk_engine, stress_tester, and regime_detector without duplicating logic.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

import pandas as pd
import structlog

logger = structlog.get_logger("neufin.quant_model_engine")

# Internal buckets only — not shown verbatim in end-user UI (labels are abstract).
MODE_INTERNAL_MODELS: dict[str, list[str]] = {
    "alpha": ["signal_ensemble", "relationship_layer", "narrative_sentiment"],
    "risk": ["multi_factor", "covariance", "stress_paths"],
    "forecast": ["temporal_signal"],
    "macro": ["regime_context", "macro_pulse"],
    "allocation": ["strategic_mix"],
    "trading": ["tactical_signal"],
    "institutional": ["hybrid_ensemble", "policy_optimizer"],
}


def _portfolio_dataframe(positions: list[dict[str, Any]]) -> pd.DataFrame | None:
    rows: list[dict[str, Any]] = []
    for p in positions:
        sym = (p.get("symbol") or p.get("ticker") or "").strip().upper()
        if not sym:
            continue
        w = float(p.get("weight_pct") or p.get("weight") or 0)
        if w > 1.01:
            w = w / 100.0
        rows.append({"ticker": sym, "weight": max(w, 0.0)})
    if not rows:
        return None
    df = pd.DataFrame(rows)
    tot = float(df["weight"].sum())
    if tot <= 0:
        df["weight"] = 1.0 / len(df)
    else:
        df["weight"] = df["weight"] / tot
    return df


def _safe_build_risk_report(
    symbols: list[str], weights: dict[str, float]
) -> dict[str, Any]:
    try:
        from services.risk_engine import build_risk_report

        return build_risk_report(symbols, weights, threshold=0.70, days=40)
    except Exception as exc:
        logger.warning("quant_engine.build_risk_report_failed", error=str(exc))
        return {"metadata": {"error": str(exc)}}


def _safe_regime() -> dict[str, Any] | None:
    try:
        from services.research.regime_detector import get_current_regime_summary

        return get_current_regime_summary()
    except Exception as exc:
        logger.warning("quant_engine.regime_failed", error=str(exc))
        return None


async def _maybe_stress(portfolio_df: pd.DataFrame) -> dict[str, Any] | None:
    try:
        from services.stress_tester import StressTester

        tester = StressTester()
        return await asyncio.wait_for(tester.run_stress_test(portfolio_df), timeout=1.2)
    except Exception as exc:
        logger.info("quant_engine.stress_skipped", error=str(exc))
        return None


def _factor_metrics_safe(
    symbols: list[str], weights: dict[str, float]
) -> list[dict[str, Any]]:
    try:
        from services.stress_tester import compute_factor_metrics

        return compute_factor_metrics(symbols, weights, beta_map=None, days=45)
    except Exception as exc:
        logger.warning("quant_engine.factor_metrics_failed", error=str(exc))
        return []


def run_models(
    portfolio_id: str,
    positions: list[dict[str, Any]],
    modes: list[str],
) -> dict[str, Any]:
    """
    Synchronous entry used from router (router may wrap slow pieces in thread pool).
    Returns partial outputs per mode; always fast metadata.
    """
    t0 = time.monotonic()
    modes_norm = [m.strip().lower() for m in modes if m.strip()]
    if not modes_norm:
        modes_norm = ["institutional"]

    pf_df = _portfolio_dataframe(positions)
    symbols = pf_df["ticker"].tolist() if pf_df is not None else []
    weights = (
        {r["ticker"]: float(r["weight"]) for _, r in pf_df.iterrows()}
        if pf_df is not None
        else {}
    )

    parts: dict[str, Any] = {
        "portfolio_id": portfolio_id,
        "modes_requested": modes_norm,
        "symbols": symbols,
        "lat_ms": 0.0,
        "risk_report": None,
        "regime": None,
        "stress": None,
        "factor_metrics": [],
        "models_resolved": [],
    }

    for m in modes_norm:
        parts["models_resolved"].extend(MODE_INTERNAL_MODELS.get(m, []))

    # Regime — cheap DB read
    if any(x in modes_norm for x in ("macro", "institutional", "allocation")):
        parts["regime"] = _safe_regime()

    # Risk engine — may touch AV; run with short window already in build_risk_report
    if len(symbols) >= 2 and any(
        x in modes_norm for x in ("risk", "alpha", "institutional", "trading")
    ):
        parts["risk_report"] = _safe_build_risk_report(symbols, weights)

    if any(x in modes_norm for x in ("alpha", "institutional", "allocation")):
        parts["factor_metrics"] = _factor_metrics_safe(symbols, weights)

    parts["lat_ms"] = round((time.monotonic() - t0) * 1000, 2)
    return parts


async def analyze_financial_modes(
    portfolio_id: str,
    positions: list[dict[str, Any]],
    modes: list[str],
) -> dict[str, Any]:
    """Primary async API: keeps default flows responsive via thread offload for sync risk work."""
    parts = await asyncio.to_thread(run_models, portfolio_id, positions, modes)
    pf_df = _portfolio_dataframe(positions)
    return await combine_outputs(parts, pf_df)


async def combine_outputs(
    parts: dict[str, Any], portfolio_df: pd.DataFrame | None
) -> dict[str, Any]:
    """Merge partial outputs into API response shape."""
    modes: list[str] = parts.get("modes_requested") or []
    risk_report: dict[str, Any] | None = parts.get("risk_report")
    regime: dict[str, Any] | None = parts.get("regime")
    factors: list[dict[str, Any]] = parts.get("factor_metrics") or []

    diversification_index = float(
        (risk_report or {}).get("diversification_index") or 0.0
    )
    avg_corr = float((risk_report or {}).get("avg_pairwise_correlation") or 0.5)

    # Alpha score proxy: diversification reward minus correlation penalty
    alpha_score = min(
        100.0,
        max(
            0.0,
            45.0 + min(diversification_index, 12.0) * 3.5 - avg_corr * 35.0,
        ),
    )
    if factors:
        high_tiers = sum(1 for f in factors if f.get("risk_tier") == "HIGH")
        alpha_score = max(0.0, alpha_score - high_tiers * 4.0)

    vol_proxy = round(0.12 + avg_corr * 0.18, 4)
    sharpe_proxy = round(0.25 + (alpha_score / 100.0) * 0.9 - vol_proxy * 0.8, 3)
    max_dd_proxy = round(
        0.08 + avg_corr * 0.12 + (1.0 - min(diversification_index / 10.0, 1.0)) * 0.05,
        4,
    )

    forecast_horizon_days = 20 if "forecast" in modes or "trading" in modes else 60
    vol_shift_pct = round(
        -8.0 if "risk" in modes else (5.0 if "alpha" in modes else 0.0), 1
    )

    regime_ctx: dict[str, Any] = {
        "label": (regime or {}).get("regime") or "neutral",
        "confidence": float((regime or {}).get("confidence") or 0.0),
        "started_at": (regime or {}).get("started_at"),
    }

    stress_summary: dict[str, Any] | None = None
    if portfolio_df is not None and "risk" in modes:
        stress_raw = await _maybe_stress(portfolio_df)
        if stress_raw:
            weakest_impacts = []
            for key, scen in list(stress_raw.items())[:4]:
                if isinstance(scen, dict) and "impact_pct" in scen:
                    weakest_impacts.append(
                        {
                            "scenario": key,
                            "impact_pct": round(float(scen["impact_pct"]), 2),
                        }
                    )
            stress_summary = {
                "scenarios_sampled": len(stress_raw),
                "weakest_impacts": weakest_impacts,
            }

    # Abstract contribution breakdown (sums to ~1.0) — mode-weighted layers, not model names.
    layer_weights: dict[str, float] = {
        "signal_layer": 0.0,
        "risk_layer": 0.0,
        "regime_layer": 0.0,
        "temporal_layer": 0.0,
        "policy_layer": 0.0,
    }
    if "alpha" in modes or "trading" in modes:
        layer_weights["signal_layer"] += 1.0
    if "risk" in modes or "institutional" in modes:
        layer_weights["risk_layer"] += 1.0
    if "macro" in modes or "allocation" in modes:
        layer_weights["regime_layer"] += 1.0
    if "forecast" in modes:
        layer_weights["temporal_layer"] += 1.0
    if "institutional" in modes or "allocation" in modes:
        layer_weights["policy_layer"] += 0.5
    total_lw = sum(layer_weights.values()) or 1.0
    breakdown = {k: round(v / total_lw, 3) for k, v in layer_weights.items() if v > 0}
    s_break = sum(breakdown.values())
    if s_break < 0.999:
        breakdown["residual"] = round(max(0.0, 1.0 - s_break), 3)

    return {
        "alpha_score": round(alpha_score, 2),
        "risk_adjusted_metrics": {
            "sharpe_proxy": sharpe_proxy,
            "volatility_annualized_proxy": vol_proxy,
            "max_drawdown_proxy": max_dd_proxy,
        },
        "forecast": {
            "horizon_days": forecast_horizon_days,
            "volatility_shift_pct_vs_baseline": vol_shift_pct,
        },
        "regime_context": regime_ctx,
        "stress": stress_summary,
        "model_contribution_breakdown": breakdown,
        "modes_requested": modes,
        "latency_ms": parts.get("lat_ms"),
    }
