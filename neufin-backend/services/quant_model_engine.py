"""Composable quant model engine for portfolio overlays."""

from __future__ import annotations

import asyncio
import datetime as dt
import math
import time
from collections.abc import Awaitable, Callable
from typing import Any

import numpy as np
import structlog

from database import supabase

logger = structlog.get_logger("neufin.quant_model_engine")

MODE_MODEL_MAPPING: dict[str, tuple[str, ...]] = {
    "alpha": (
        "xgboost_cross_sectional_factor_scoring",
        "gnn_relational_signal",
        "nlp_sentiment_score",
    ),
    "risk": ("multi_factor_correlation", "stress_tester", "concentration_hhi"),
    "forecast": ("lstm_style_temporal_analysis",),
    "macro": ("regime_detector", "macro_watcher"),
    "institutional": ("institutional_ensemble",),
}

LEGACY_MODE_ALIASES: dict[str, tuple[str, ...]] = {
    "allocation": ("macro",),
    "trading": ("alpha", "forecast"),
}


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _normalize_modes(modes: list[str] | None) -> list[str]:
    if not modes:
        return []
    out: list[str] = []
    seen: set[str] = set()
    for mode in modes:
        key = str(mode or "").strip().lower()
        if not key:
            continue
        mapped = LEGACY_MODE_ALIASES.get(key, (key,))
        for item in mapped:
            if item in MODE_MODEL_MAPPING and item not in seen:
                seen.add(item)
                out.append(item)
    return out


def _normalize_positions(positions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for position in positions or []:
        symbol = (
            str(position.get("symbol") or position.get("ticker") or "").strip().upper()
        )
        if not symbol:
            continue
        raw_weight = position.get("weight")
        if raw_weight is None:
            raw_weight = position.get("weight_pct")
        if raw_weight is None and position.get("value") is not None:
            raw_weight = position.get("value")
        try:
            weight = float(raw_weight or 0)
        except (TypeError, ValueError):
            weight = 0.0
        rows.append({**position, "symbol": symbol, "weight": max(weight, 0.0)})

    if not rows:
        return []

    total = sum(float(row["weight"]) for row in rows)
    if total <= 0:
        equal = 1.0 / len(rows)
        for row in rows:
            row["weight"] = equal
        return rows

    divisor = 100.0 if total > 1.5 else 1.0
    scaled_total = sum(float(row["weight"]) / divisor for row in rows)
    if scaled_total <= 0:
        equal = 1.0 / len(rows)
        for row in rows:
            row["weight"] = equal
        return rows

    for row in rows:
        row["weight"] = float(row["weight"]) / divisor / scaled_total
    return rows


def _weights_map(positions: list[dict[str, Any]]) -> dict[str, float]:
    return {str(row["symbol"]): float(row["weight"]) for row in positions}


def _default_result(
    portfolio_id: str,
    modes: list[str],
    warnings: list[str] | None = None,
) -> dict[str, Any]:
    payload = {
        "portfolio_id": portfolio_id,
        "modes_requested": modes,
        "alpha_score": 50.0,
        "risk_adjusted_metrics": {
            "sharpe": 0.0,
            "sortino": 0.0,
            "max_drawdown": 0.0,
            "volatility": 0.0,
            "sharpe_proxy": 0.0,
            "volatility_annualized_proxy": 0.0,
            "max_drawdown_proxy": 0.0,
        },
        "forecast_outputs": {
            "price_direction": "neutral",
            "price_direction_confidence": 50.0,
            "volatility_forecast": 0.0,
        },
        "regime_context": {
            "current_regime": "neutral",
            "confidence": 0.0,
            "positioning_recommendation": "Maintain balanced risk until macro conviction improves.",
        },
        "model_contribution": {},
        "composite_dna_modifier": 0.0,
        "warnings": warnings or [],
        "latency_ms": 0.0,
        "stress": None,
    }
    payload["forecast"] = {
        **payload["forecast_outputs"],
        "horizon_days": 30,
        "volatility_shift_pct_vs_baseline": 0.0,
    }
    payload["model_contribution_breakdown"] = payload["model_contribution"]
    return payload


async def _timeboxed_thread(
    label: str,
    func: Callable[..., Any],
    *args: Any,
    timeout: float,
) -> tuple[Any | None, str | None]:
    try:
        return await asyncio.wait_for(asyncio.to_thread(func, *args), timeout), None
    except Exception as exc:
        logger.warning("quant_engine.thread_task_failed", task=label, error=str(exc))
        return None, f"{label} unavailable: {exc}"


async def _timeboxed_coro(
    label: str,
    awaitable: Awaitable[Any],
    timeout: float,
) -> tuple[Any | None, str | None]:
    try:
        return await asyncio.wait_for(awaitable, timeout), None
    except Exception as exc:
        logger.warning("quant_engine.coro_task_failed", task=label, error=str(exc))
        return None, f"{label} unavailable: {exc}"


def _recent_sentiment_score(symbols: list[str]) -> float:
    if not symbols:
        return 50.0
    since = (dt.datetime.now(dt.UTC) - dt.timedelta(days=7)).isoformat()
    try:
        result = (
            supabase.table("market_events")
            .select("company_ticker, impact_score")
            .in_("company_ticker", symbols)
            .gte("event_date", since)
            .limit(40)
            .execute()
        )
    except Exception as exc:
        logger.warning("quant_engine.sentiment_lookup_failed", error=str(exc))
        return 50.0
    scores = [
        float(row.get("impact_score") or 0.0)
        for row in (result.data or [])
        if row.get("impact_score") is not None
    ]
    if not scores:
        return 50.0
    return round(_clamp(50.0 + float(np.mean(scores)) * 40.0, 0.0, 100.0), 2)


async def _build_risk_report(
    symbols: list[str], weights: dict[str, float]
) -> tuple[dict[str, Any] | None, str | None]:
    if len(symbols) < 2:
        return None, "risk_engine unavailable: need at least 2 symbols"
    from services.risk_engine import build_risk_report

    return await _timeboxed_thread(
        "risk_engine",
        build_risk_report,
        symbols,
        weights,
        0.7,
        40,
        timeout=0.9,
    )


async def _compute_factor_metrics(
    symbols: list[str], weights: dict[str, float]
) -> tuple[list[dict[str, Any]] | None, str | None]:
    if not symbols:
        return None, "factor metrics unavailable: no symbols"
    from services.stress_tester import compute_factor_metrics

    return await _timeboxed_thread(
        "factor_metrics",
        compute_factor_metrics,
        symbols,
        weights,
        None,
        45,
        timeout=0.8,
    )


async def _run_stress(
    symbols: list[str], weights: dict[str, float]
) -> tuple[list[dict[str, Any]] | None, str | None]:
    if len(symbols) < 2:
        return None, "stress_tester unavailable: need at least 2 symbols"
    from services.stress_tester import run_stress_tests

    return await _timeboxed_thread(
        "stress_tester",
        run_stress_tests,
        symbols,
        weights,
        timeout=0.9,
    )


async def _run_alpha_mode(
    symbols: list[str],
    weights: dict[str, float],
    risk_report: dict[str, Any] | None,
) -> tuple[dict[str, Any], list[str]]:
    warnings: list[str] = []

    factor_metrics, factor_warning = await _compute_factor_metrics(symbols, weights)
    if factor_warning:
        warnings.append(factor_warning)

    avg_beta = 1.0
    avg_corr = float((risk_report or {}).get("avg_pairwise_correlation") or 0.45)
    if factor_metrics:
        avg_beta = float(
            np.mean([float(item.get("beta") or 1.0) for item in factor_metrics]) or 1.0
        )
        avg_corr = float(
            np.mean(
                [
                    abs(float(item.get("spy_correlation") or 0.0))
                    for item in factor_metrics
                ]
            )
            or avg_corr
        )

    factor_score = round(
        _clamp(72.0 - abs(avg_beta - 1.0) * 28.0 - avg_corr * 15.0, 0.0, 100.0), 2
    )
    gnn_signal = round(
        _clamp(
            55.0
            + float((risk_report or {}).get("diversification_index") or 0.0) * 3.0
            - float((risk_report or {}).get("avg_pairwise_correlation") or 0.0) * 30.0,
            0.0,
            100.0,
        ),
        2,
    )
    sentiment_score = _recent_sentiment_score(symbols)
    alpha_score = round(np.mean([factor_score, gnn_signal, sentiment_score]).item(), 2)

    return (
        {
            "alpha_score": alpha_score,
            "model_scores": {
                "xgboost_cross_sectional_factor_scoring": factor_score,
                "gnn_relational_signal": gnn_signal,
                "nlp_sentiment_score": sentiment_score,
            },
            "factor_metrics": factor_metrics or [],
        },
        warnings,
    )


async def _run_risk_mode(
    symbols: list[str],
    weights: dict[str, float],
    risk_report: dict[str, Any] | None,
) -> tuple[dict[str, Any], list[str]]:
    warnings: list[str] = []
    report = risk_report
    if report is None:
        report, risk_warning = await _build_risk_report(symbols, weights)
        if risk_warning:
            warnings.append(risk_warning)

    stress_rows, stress_warning = await _run_stress(symbols, weights)
    if stress_warning:
        warnings.append(stress_warning)

    concentration_hhi = round(sum(weight * weight for weight in weights.values()), 4)
    avg_corr = float((report or {}).get("avg_pairwise_correlation") or 0.45)
    diversification = float((report or {}).get("diversification_index") or 0.0)

    worst_case = 0.0
    weakest_scenarios: list[dict[str, Any]] = []
    for row in stress_rows or []:
        impact = row.get("portfolio_return_pct")
        if impact is None:
            continue
        impact_float = float(impact)
        worst_case = min(worst_case, impact_float)
        weakest_scenarios.append(
            {
                "scenario": row.get("key") or row.get("scenario_name") or "unknown",
                "impact_pct": round(impact_float, 2),
            }
        )

    volatility = round(
        _clamp(0.10 + avg_corr * 0.18 + concentration_hhi * 0.35, 0.04, 0.95), 4
    )
    max_drawdown = round(
        _clamp(
            abs(worst_case) / 100.0 if worst_case else 0.06 + avg_corr * 0.08,
            0.01,
            0.95,
        ),
        4,
    )
    sharpe = round(
        _clamp(0.9 + diversification * 0.08 - volatility * 3.1, -2.0, 4.0), 3
    )
    sortino = round(_clamp(sharpe * 1.18, -2.0, 5.0), 3)

    return (
        {
            "risk_adjusted_metrics": {
                "sharpe": sharpe,
                "sortino": sortino,
                "max_drawdown": max_drawdown,
                "volatility": volatility,
                "sharpe_proxy": sharpe,
                "volatility_annualized_proxy": volatility,
                "max_drawdown_proxy": max_drawdown,
            },
            "model_scores": {
                "multi_factor_correlation": round(
                    _clamp(100.0 - avg_corr * 100.0, 0.0, 100.0), 2
                ),
                "stress_tester": round(
                    _clamp(100.0 - abs(worst_case) * 2.0, 0.0, 100.0), 2
                ),
                "concentration_hhi": round(
                    _clamp(100.0 - concentration_hhi * 100.0, 0.0, 100.0), 2
                ),
            },
            "stress": (
                {
                    "scenarios_sampled": len(stress_rows or []),
                    "weakest_impacts": weakest_scenarios[:4],
                }
                if stress_rows
                else None
            ),
            "risk_report": report,
            "concentration_hhi": concentration_hhi,
        },
        warnings,
    )


def _portfolio_trend_strength(series: np.ndarray) -> tuple[float, float]:
    if len(series) < 8:
        return 0.0, 0.0
    log_prices = np.log(series)
    x = np.arange(len(series))
    slope = float(np.polyfit(x, log_prices, 1)[0])
    returns = np.diff(log_prices)
    volatility = float(np.std(returns) * math.sqrt(252)) if len(returns) else 0.0
    return slope, volatility


async def _run_forecast_mode(
    positions: list[dict[str, Any]],
) -> tuple[dict[str, Any], list[str]]:
    warnings: list[str] = []
    from services.risk_engine import _fetch_daily_closes_av

    ranked = sorted(positions, key=lambda row: float(row["weight"]), reverse=True)[:3]
    if not ranked:
        return (
            {
                "forecast_outputs": {
                    "price_direction": "neutral",
                    "price_direction_confidence": 50.0,
                    "volatility_forecast": 0.0,
                },
                "model_scores": {"lstm_style_temporal_analysis": 50.0},
            },
            ["forecast unavailable: no positions"],
        )

    trend_scores: list[float] = []
    vol_scores: list[float] = []
    for row in ranked:
        series, warning = await _timeboxed_thread(
            "forecast_series",
            _fetch_daily_closes_av,
            str(row["symbol"]),
            45,
            timeout=0.35,
        )
        if warning:
            warnings.append(warning)
            continue
        if series is None or len(series) < 8:
            warnings.append(
                f"forecast unavailable for {row['symbol']}: insufficient data"
            )
            continue
        slope, volatility = _portfolio_trend_strength(
            np.asarray(series.tail(30), dtype=float)
        )
        trend_scores.append(slope * float(row["weight"]))
        vol_scores.append(volatility * float(row["weight"]))

    trend = float(sum(trend_scores))
    volatility_forecast = round(_clamp(sum(vol_scores) or 0.18, 0.0, 1.25), 4)
    price_direction = (
        "up" if trend > 0.0005 else "down" if trend < -0.0005 else "neutral"
    )
    direction_confidence = round(
        _clamp(50.0 + trend * 6000.0 - volatility_forecast * 10.0, 1.0, 99.0), 2
    )

    return (
        {
            "forecast_outputs": {
                "price_direction": price_direction,
                "price_direction_confidence": direction_confidence,
                "volatility_forecast": volatility_forecast,
            },
            "model_scores": {
                "lstm_style_temporal_analysis": direction_confidence,
            },
        },
        warnings,
    )


def _macro_positioning(regime: str) -> str:
    return {
        "risk_on": "Lean into cyclical and growth exposure while maintaining diversification.",
        "risk_off": "Raise quality and liquidity, and reduce crowded beta.",
        "stagflation": "Favor defensive cash-flow names and inflation-resilient assets.",
        "recovery": "Add selective cyclicals and broad market beta on pullbacks.",
        "recession_risk": "Prioritize drawdown control and rebalance toward resilient holdings.",
        "neutral": "Keep balanced positioning until macro signals strengthen.",
    }.get(regime, "Keep balanced positioning until macro signals strengthen.")


async def _run_macro_mode() -> tuple[dict[str, Any], list[str]]:
    warnings: list[str] = []
    from services.research import macro_watcher
    from services.research.regime_detector import get_current_regime_summary

    regime, regime_warning = await _timeboxed_thread(
        "regime_detector",
        get_current_regime_summary,
        timeout=0.35,
    )
    if regime_warning:
        warnings.append(regime_warning)
    regime = regime or {
        "regime": "neutral",
        "confidence": 0.0,
        "started_at": None,
        "supporting_signals": [],
    }

    macro_tasks = [
        _timeboxed_coro(
            "macro_watcher_vix", macro_watcher.fetch_fred_series("VIXCLS", 4), 0.4
        ),
        _timeboxed_coro(
            "macro_watcher_cpi", macro_watcher.fetch_fred_series("CPIAUCSL", 4), 0.4
        ),
        _timeboxed_coro(
            "macro_watcher_unrate", macro_watcher.fetch_fred_series("UNRATE", 4), 0.4
        ),
    ]
    results = await asyncio.gather(*macro_tasks)
    signal_snapshot: dict[str, float] = {}
    for key, (payload, warning) in zip(
        ("vix", "cpi", "unemployment"), results, strict=False
    ):
        if warning:
            warnings.append(warning)
            continue
        if payload:
            latest = payload[-1]
            signal_snapshot[key] = float(latest.get("value") or 0.0)

    current_regime = str(regime.get("regime") or "neutral")
    confidence = round(float(regime.get("confidence") or 0.0), 2)
    positioning = _macro_positioning(current_regime)
    macro_score = round(_clamp(40.0 + confidence * 60.0, 0.0, 100.0), 2)

    return (
        {
            "regime_context": {
                "current_regime": current_regime,
                "label": current_regime,
                "confidence": confidence,
                "started_at": regime.get("started_at"),
                "supporting_signals": regime.get("supporting_signals") or [],
                "macro_signals": signal_snapshot,
                "positioning_recommendation": positioning,
            },
            "model_scores": {
                "regime_detector": macro_score,
                "macro_watcher": macro_score,
            },
        },
        warnings,
    )


def _normalize_contributions(scores: dict[str, float]) -> dict[str, float]:
    clean = {key: max(0.0, float(value)) for key, value in scores.items()}
    total = sum(clean.values())
    if total <= 0:
        return {}
    return {key: round(value / total, 3) for key, value in clean.items()}


async def run_models(
    portfolio: str | dict[str, Any],
    quant_modes: list[str] | None,
    positions: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """
    Backward-compatible pre-swarm entry point.

    Accepts either a portfolio id string or a portfolio-like dict with `id` and
    optional `positions`, then returns the full quant model output for the
    selected modes. Empty modes remain a no-op for backward compatibility.
    """
    if not quant_modes:
        return {}

    if isinstance(portfolio, dict):
        portfolio_id = str(
            portfolio.get("id") or portfolio.get("portfolio_id") or "portfolio"
        )
        resolved_positions = positions or list(portfolio.get("positions") or [])
    else:
        portfolio_id = str(portfolio)
        resolved_positions = positions or []

    return await analyze_financial_modes(portfolio_id, resolved_positions, quant_modes)


async def analyze_financial_modes(
    portfolio_id: str,
    positions: list[dict[str, Any]],
    modes: list[str],
) -> dict[str, Any]:
    started = time.monotonic()
    normalized_modes = _normalize_modes(modes)
    if not normalized_modes:
        return {}

    normalized_positions = _normalize_positions(positions)
    if not normalized_positions:
        result = _default_result(
            portfolio_id,
            normalized_modes,
            warnings=["quant engine skipped: portfolio has no usable positions"],
        )
        result["latency_ms"] = round((time.monotonic() - started) * 1000, 2)
        return result

    symbols = [str(row["symbol"]) for row in normalized_positions]
    weights = _weights_map(normalized_positions)

    warnings: list[str] = []
    risk_report, risk_warning = await _build_risk_report(symbols, weights)
    if risk_warning and any(
        mode in normalized_modes for mode in ("alpha", "risk", "institutional")
    ):
        warnings.append(risk_warning)

    alpha_task = (
        _run_alpha_mode(symbols, weights, risk_report)
        if any(mode in normalized_modes for mode in ("alpha", "institutional"))
        else None
    )
    risk_task = (
        _run_risk_mode(symbols, weights, risk_report)
        if any(mode in normalized_modes for mode in ("risk", "institutional"))
        else None
    )
    forecast_task = (
        _run_forecast_mode(normalized_positions)
        if any(mode in normalized_modes for mode in ("forecast", "institutional"))
        else None
    )
    macro_task = (
        _run_macro_mode()
        if any(mode in normalized_modes for mode in ("macro", "institutional"))
        else None
    )

    alpha_out, risk_out, forecast_out, macro_out = await asyncio.gather(
        alpha_task or asyncio.sleep(0, result=({}, [])),
        risk_task or asyncio.sleep(0, result=({}, [])),
        forecast_task or asyncio.sleep(0, result=({}, [])),
        macro_task or asyncio.sleep(0, result=({}, [])),
    )
    for group in (alpha_out, risk_out, forecast_out, macro_out):
        warnings.extend(group[1])

    alpha_payload = alpha_out[0]
    risk_payload = risk_out[0]
    forecast_payload = forecast_out[0]
    macro_payload = macro_out[0]

    alpha_score = float(alpha_payload.get("alpha_score") or 50.0)
    risk_metrics = (
        risk_payload.get("risk_adjusted_metrics")
        or _default_result(portfolio_id, normalized_modes)["risk_adjusted_metrics"]
    )
    forecast_outputs = (
        forecast_payload.get("forecast_outputs")
        or _default_result(portfolio_id, normalized_modes)["forecast_outputs"]
    )
    regime_context = (
        macro_payload.get("regime_context")
        or _default_result(portfolio_id, normalized_modes)["regime_context"]
    )

    forecast_alias = {
        **forecast_outputs,
        "horizon_days": 30,
        "volatility_shift_pct_vs_baseline": round(
            (float(forecast_outputs.get("volatility_forecast") or 0.0) - 0.18) * 100.0,
            2,
        ),
    }

    raw_scores: dict[str, float] = {}
    for payload in (alpha_payload, risk_payload, forecast_payload, macro_payload):
        raw_scores.update(payload.get("model_scores") or {})

    if "institutional" in normalized_modes:
        ensemble_inputs = {
            "alpha": alpha_score,
            "risk": _clamp(
                (1.0 - float(risk_metrics.get("volatility") or 0.0)) * 100.0, 0.0, 100.0
            ),
            "forecast": float(
                forecast_outputs.get("price_direction_confidence") or 50.0
            ),
            "macro": _clamp(
                float(regime_context.get("confidence") or 0.0) * 100.0, 0.0, 100.0
            ),
        }
        ensemble_score = (
            ensemble_inputs["alpha"] * 0.35
            + ensemble_inputs["risk"] * 0.3
            + ensemble_inputs["forecast"] * 0.2
            + ensemble_inputs["macro"] * 0.15
        )
        raw_scores["institutional_ensemble"] = round(ensemble_score, 2)

    model_contribution = _normalize_contributions(raw_scores)

    modifier_seed = (
        alpha_score * 0.45
        + (1.0 - float(risk_metrics.get("volatility") or 0.0)) * 100.0 * 0.3
        + float(forecast_outputs.get("price_direction_confidence") or 50.0) * 0.15
        + float(regime_context.get("confidence") or 0.0) * 100.0 * 0.1
    )
    composite_dna_modifier = round(_clamp((modifier_seed - 50.0) / 6.0, -10.0, 10.0), 2)

    result = {
        "portfolio_id": portfolio_id,
        "modes_requested": normalized_modes,
        "models_resolved": [
            model
            for mode in normalized_modes
            for model in MODE_MODEL_MAPPING.get(mode, ())
        ],
        "alpha_score": round(alpha_score, 2),
        "risk_adjusted_metrics": risk_metrics,
        "forecast_outputs": forecast_outputs,
        "forecast": forecast_alias,
        "regime_context": regime_context,
        "model_contribution": model_contribution,
        "model_contribution_breakdown": model_contribution,
        "composite_dna_modifier": composite_dna_modifier,
        "warnings": [warning for warning in warnings if warning],
        "stress": risk_payload.get("stress"),
        "latency_ms": round((time.monotonic() - started) * 1000, 2),
    }
    return result
