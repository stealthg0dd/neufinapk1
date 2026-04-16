"""
behavioral_drift_detector.py — NeuFin's first 'financial zero-day' detection capability.

PURPOSE: Detect when a client's ACTUAL behavioral risk tolerance (revealed by portfolio
actions over time) has diverged from their DOCUMENTED risk profile (captured at onboarding).
This is the 'Suitability Time-Bomb' pattern.

Public API
----------
detect_behavioral_drift(user_id, portfolio_history, documented_risk_profile) -> dict
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta
from typing import Any

import structlog

from database import supabase

logger = structlog.get_logger("neufin.behavioral_drift")

# ── Constants ────────────────────────────────────────────────────────────────
DRIFT_THRESHOLD = 2.0  # points divergence to trigger alert
MAX_BEHAVIORAL_SCORE = 10.0
MIN_BEHAVIORAL_SCORE = 0.0


def _safe_float(val: Any, default: float = 0.0) -> float:
    """Safely convert value to float."""
    if val is None:
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def _parse_date(val: Any) -> datetime | None:
    """Parse ISO date string to datetime."""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val
    try:
        return datetime.fromisoformat(str(val).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


# ── Behavioral Signal Extraction ─────────────────────────────────────────────


def _compute_fear_response_score(portfolio_history: list[dict]) -> float:
    """
    Extract fear response from sell events during drawdown periods.
    Higher score = more fearful (sells during dips) = lower actual risk tolerance.
    Returns 0-10 scale (10 = extremely fearful, sells at every dip).
    """
    if not portfolio_history or len(portfolio_history) < 2:
        return 5.0  # neutral default

    fear_events = 0
    total_drawdown_periods = 0

    for i, state in enumerate(portfolio_history[1:], start=1):
        prev_state = portfolio_history[i - 1]

        # Detect drawdown: portfolio value dropped > 3%
        prev_value = _safe_float(prev_state.get("total_value"), 0)
        curr_value = _safe_float(state.get("total_value"), 0)

        if prev_value > 0 and curr_value < prev_value * 0.97:
            total_drawdown_periods += 1

            # Check for sells during drawdown
            prev_positions = prev_state.get("positions", [])
            curr_positions = state.get("positions", [])

            prev_symbols = {p.get("symbol") for p in prev_positions if p.get("symbol")}
            curr_symbols = {p.get("symbol") for p in curr_positions if p.get("symbol")}

            # Sold positions during drawdown
            sold_during_dip = prev_symbols - curr_symbols
            if sold_during_dip:
                fear_events += len(sold_during_dip)

    if total_drawdown_periods == 0:
        return 5.0  # neutral - no drawdowns observed

    # Ratio of fear events to drawdown periods, scaled to 0-10
    fear_ratio = min(fear_events / max(total_drawdown_periods, 1), 2.0)
    return min(fear_ratio * 5.0, 10.0)


def _compute_defensiveness_score(portfolio_history: list[dict]) -> float:
    """
    Cash holding % during volatile periods indicates defensiveness.
    Higher score = more defensive = lower actual risk tolerance.
    Returns 0-10 scale (10 = holds excessive cash during volatility).
    """
    if not portfolio_history:
        return 5.0

    high_cash_periods = 0
    volatile_periods = 0

    for i, state in enumerate(portfolio_history):
        positions = state.get("positions", [])
        total_value = _safe_float(state.get("total_value"), 0)

        # Calculate cash allocation
        cash_value = sum(
            _safe_float(p.get("value"), 0)
            for p in positions
            if str(p.get("symbol", "")).upper() in ("CASH", "USD", "MONEY MARKET", "MM")
        )
        cash_pct = (cash_value / total_value * 100) if total_value > 0 else 0

        # Check if this was a volatile period (proxy: use state metadata or market data)
        volatility = _safe_float(state.get("market_volatility"), 0)
        is_volatile = volatility > 20 or state.get("is_volatile_period", False)

        if is_volatile or (i > 0 and i % 3 == 0):  # sample volatile periods
            volatile_periods += 1
            if cash_pct > 15:  # >15% cash is defensive
                high_cash_periods += 1

    if volatile_periods == 0:
        return 5.0

    defensiveness_ratio = high_cash_periods / volatile_periods
    return min(defensiveness_ratio * 10.0, 10.0)


def _compute_rebalancing_adherence_score(portfolio_history: list[dict]) -> float:
    """
    Check if user follows recommendations vs. ignores them.
    Lower adherence = higher actual risk tolerance (ignoring advice).
    Returns 0-10 scale (10 = ignores all recommendations = high risk tolerance).
    """
    if not portfolio_history:
        return 5.0

    recommendations_given = 0
    recommendations_followed = 0

    for state in portfolio_history:
        recommendations = state.get("recommendations", [])
        actions_taken = state.get("actions_taken", [])

        for rec in recommendations:
            rec_type = str(rec.get("type", "")).lower()
            rec_symbol = str(rec.get("symbol", "")).upper()
            recommendations_given += 1

            # Check if action was taken
            for action in actions_taken:
                action_type = str(action.get("type", "")).lower()
                action_symbol = str(action.get("symbol", "")).upper()

                if rec_symbol == action_symbol and rec_type == action_type:
                    recommendations_followed += 1
                    break

    if recommendations_given == 0:
        return 5.0  # neutral - no recommendations to follow

    adherence_ratio = recommendations_followed / recommendations_given
    # Invert: low adherence = high risk tolerance (ignoring advice)
    return (1 - adherence_ratio) * 10.0


def _compute_holding_period_score(
    portfolio_history: list[dict], stated_time_horizon: int
) -> float:
    """
    Compare actual holding periods vs. stated time horizon.
    Short holding periods vs. long stated horizon = higher actual risk tolerance.
    Returns 0-10 scale (10 = trades frequently despite long-term stated horizon).
    """
    if not portfolio_history or len(portfolio_history) < 2:
        return 5.0

    # Track position entry/exit
    position_durations: list[int] = []
    position_entries: dict[str, datetime] = {}

    for state in portfolio_history:
        state_date = _parse_date(state.get("date") or state.get("snapshot_date"))
        if not state_date:
            continue

        current_symbols = {
            p.get("symbol") for p in state.get("positions", []) if p.get("symbol")
        }

        # New positions
        for symbol in current_symbols - set(position_entries.keys()):
            position_entries[symbol] = state_date

        # Exited positions
        for symbol in set(position_entries.keys()) - current_symbols:
            entry_date = position_entries.pop(symbol, None)
            if entry_date:
                duration_days = (state_date - entry_date).days
                position_durations.append(duration_days)

    if not position_durations:
        return 5.0

    avg_holding_days = sum(position_durations) / len(position_durations)

    # Compare to stated horizon (in years → days)
    stated_horizon_days = stated_time_horizon * 365

    if stated_horizon_days <= 0:
        return 5.0

    # Ratio of actual to stated horizon
    horizon_ratio = avg_holding_days / stated_horizon_days

    # Short holding vs long stated = high risk tolerance
    if horizon_ratio < 0.1:
        return 9.0  # very short-term despite long horizon
    elif horizon_ratio < 0.25:
        return 7.0
    elif horizon_ratio < 0.5:
        return 6.0
    elif horizon_ratio < 1.0:
        return 5.0
    else:
        return 3.0  # actually holds longer than stated


# ── Main Drift Detection ─────────────────────────────────────────────────────


def compute_behavioral_risk_score(
    portfolio_history: list[dict],
    documented_risk_profile: dict,
) -> dict[str, float]:
    """
    Compute behavioral risk score from portfolio history signals.
    Returns component scores and final behavioral score (0-10).
    """
    stated_time_horizon = int(documented_risk_profile.get("time_horizon", 5))

    fear_score = _compute_fear_response_score(portfolio_history)
    defensiveness_score = _compute_defensiveness_score(portfolio_history)
    adherence_score = _compute_rebalancing_adherence_score(portfolio_history)
    holding_score = _compute_holding_period_score(
        portfolio_history, stated_time_horizon
    )

    # Weighted average (fear and defensiveness indicate lower risk tolerance)
    # Adherence and holding indicate higher risk tolerance when high
    # Invert fear/defensiveness since high fear = low risk tolerance
    actual_risk_tolerance = (
        (10 - fear_score) * 0.30  # less fear = higher risk tolerance
        + (10 - defensiveness_score) * 0.25  # less defensive = higher risk tolerance
        + adherence_score * 0.20  # ignoring advice = higher risk tolerance
        + holding_score * 0.25  # short-term trading = higher risk tolerance
    )

    behavioral_risk_score = max(
        MIN_BEHAVIORAL_SCORE, min(MAX_BEHAVIORAL_SCORE, actual_risk_tolerance)
    )

    return {
        "behavioral_risk_score": round(behavioral_risk_score, 2),
        "fear_response_score": round(fear_score, 2),
        "defensiveness_score": round(defensiveness_score, 2),
        "rebalancing_adherence_score": round(adherence_score, 2),
        "holding_period_score": round(holding_score, 2),
    }


def _generate_drift_narrative(
    behavioral_score: float,
    documented_score: float,
    divergence: float,
    component_scores: dict,
) -> str:
    """Generate plain English explanation for advisor."""
    direction = "higher" if behavioral_score > documented_score else "lower"

    narrative_parts = [
        f"Client's revealed risk tolerance ({behavioral_score:.1f}/10) is {direction} "
        f"than their documented profile ({documented_score:.1f}/10), "
        f"showing a {abs(divergence):.1f}-point divergence."
    ]

    # Add specific insights based on component scores
    fear = component_scores.get("fear_response_score", 5)
    defensiveness = component_scores.get("defensiveness_score", 5)
    adherence = component_scores.get("rebalancing_adherence_score", 5)
    holding = component_scores.get("holding_period_score", 5)

    if fear > 7:
        narrative_parts.append(
            "Pattern detected: client frequently sells during market downturns, "
            "suggesting anxiety-driven trading behavior."
        )
    elif fear < 3:
        narrative_parts.append(
            "Pattern detected: client holds through volatility without panic selling."
        )

    if defensiveness > 7:
        narrative_parts.append(
            "Pattern detected: elevated cash holdings during volatile periods "
            "indicate risk aversion beyond stated tolerance."
        )

    if adherence > 7:
        narrative_parts.append(
            "Pattern detected: client frequently ignores rebalancing recommendations, "
            "suggesting confidence in own judgment or higher risk appetite."
        )

    if holding > 7:
        narrative_parts.append(
            "Pattern detected: actual holding periods are significantly shorter "
            "than stated investment horizon, indicating trading behavior."
        )

    return " ".join(narrative_parts)


def _generate_recommendation(divergence: float, direction: str) -> str:
    """Generate suggested action based on drift severity."""
    abs_divergence = abs(divergence)

    if abs_divergence >= 4:
        return (
            "URGENT: Schedule immediate suitability review. "
            "Client behavior significantly diverges from documented profile. "
            "Consider updating risk questionnaire and portfolio allocation."
        )
    elif abs_divergence >= 3:
        return (
            "Schedule suitability review within 30 days. "
            "Reassess client's true risk tolerance through behavioral discussion."
        )
    else:
        return (
            "Monitor closely. Consider informal check-in to discuss "
            "client's comfort with current portfolio strategy."
        )


def _generate_regulatory_flag(divergence: float) -> str:
    """Generate regulatory flag if applicable."""
    if abs(divergence) >= 3:
        return (
            "MiFID II suitability review recommended. "
            "Material divergence between documented and revealed preferences "
            "may require updated suitability assessment."
        )
    elif abs(divergence) >= 2:
        return (
            "Best practice: document behavioral observations in client file. "
            "Consider proactive suitability discussion."
        )
    return ""


def detect_behavioral_drift(
    user_id: str,
    portfolio_history: list[dict] | None = None,
    documented_risk_profile: dict | None = None,
) -> dict[str, Any]:
    """
    Main entry point: detect behavioral drift for a user.

    Args:
        user_id: User identifier
        portfolio_history: Time-series of portfolio states (optional, will fetch if None)
        documented_risk_profile: Onboarding risk profile (optional, will fetch if None)

    Returns:
        Drift analysis result including scores, alert status, and narrative
    """
    logger.info("behavioral_drift.analyze", user_id=user_id)

    # Fetch portfolio history if not provided
    if portfolio_history is None:
        portfolio_history = _fetch_portfolio_history(user_id)

    # Fetch documented risk profile if not provided
    if documented_risk_profile is None:
        documented_risk_profile = _fetch_risk_profile(user_id)

    # Handle missing data gracefully
    if not portfolio_history:
        logger.warning("behavioral_drift.no_history", user_id=user_id)
        return {
            "behavioral_risk_score": None,
            "documented_risk_score": None,
            "divergence": None,
            "drift_alert": False,
            "drift_narrative": "Insufficient portfolio history for behavioral analysis.",
            "recommendation": "Collect at least 3 months of portfolio snapshots.",
            "regulatory_flag": "",
            "component_scores": {},
            "data_quality": "insufficient",
        }

    documented_score = _safe_float(documented_risk_profile.get("risk_score"), 5.0)

    # Compute behavioral score from history
    scores = compute_behavioral_risk_score(portfolio_history, documented_risk_profile)
    behavioral_score = scores["behavioral_risk_score"]

    # Calculate divergence
    divergence = behavioral_score - documented_score
    drift_alert = abs(divergence) >= DRIFT_THRESHOLD

    direction = "higher" if divergence > 0 else "lower"

    # Generate outputs
    narrative = _generate_drift_narrative(
        behavioral_score, documented_score, divergence, scores
    )
    recommendation = _generate_recommendation(divergence, direction)
    regulatory_flag = _generate_regulatory_flag(divergence)

    result = {
        "behavioral_risk_score": behavioral_score,
        "documented_risk_score": documented_score,
        "divergence": round(divergence, 2),
        "drift_alert": drift_alert,
        "drift_narrative": narrative,
        "recommendation": recommendation,
        "regulatory_flag": regulatory_flag,
        "component_scores": {
            "fear_response": scores["fear_response_score"],
            "defensiveness": scores["defensiveness_score"],
            "rebalancing_adherence": scores["rebalancing_adherence_score"],
            "holding_period": scores["holding_period_score"],
        },
        "data_quality": "sufficient" if len(portfolio_history) >= 4 else "limited",
        "history_depth_days": _compute_history_depth(portfolio_history),
    }

    logger.info(
        "behavioral_drift.result",
        user_id=user_id,
        drift_alert=drift_alert,
        divergence=divergence,
    )

    return result


def _fetch_portfolio_history(user_id: str) -> list[dict]:
    """Fetch portfolio snapshots from database."""
    try:
        # Try portfolio_snapshots table first
        result = (
            supabase.table("portfolio_snapshots")
            .select("*")
            .eq("user_id", user_id)
            .order("snapshot_date", desc=True)
            .limit(52)  # ~1 year of weekly snapshots
            .execute()
        )
        if result.data:
            return list(reversed(result.data))  # chronological order
    except Exception as e:
        logger.debug("behavioral_drift.snapshots_table_unavailable", error=str(e))

    # Fallback: try to reconstruct from portfolios + positions
    try:
        portfolios_result = (
            supabase.table("portfolios")
            .select("id, created_at, updated_at")
            .eq("user_id", user_id)
            .order("updated_at", desc=True)
            .limit(10)
            .execute()
        )
        if not portfolios_result.data:
            return []

        history = []
        for portfolio in portfolios_result.data:
            pid = portfolio.get("id")
            positions_result = (
                supabase.table("positions")
                .select("symbol, shares, value, weight_pct")
                .eq("portfolio_id", pid)
                .execute()
            )
            total_value = sum(
                _safe_float(p.get("value"), 0) for p in (positions_result.data or [])
            )
            history.append(
                {
                    "date": portfolio.get("updated_at") or portfolio.get("created_at"),
                    "total_value": total_value,
                    "positions": positions_result.data or [],
                }
            )
        return list(reversed(history))
    except Exception as e:
        logger.warning("behavioral_drift.history_fetch_failed", error=str(e))
        return []


def _fetch_risk_profile(user_id: str) -> dict:
    """Fetch documented risk profile from user_profiles or onboarding data."""
    try:
        result = (
            supabase.table("user_profiles")
            .select("risk_score, risk_tolerance, time_horizon, investment_objective")
            .eq("id", user_id)
            .single()
            .execute()
        )
        if result.data:
            profile = result.data
            return {
                "risk_score": _safe_float(
                    profile.get("risk_score") or profile.get("risk_tolerance"), 5.0
                ),
                "time_horizon": int(profile.get("time_horizon") or 5),
                "investment_objective": profile.get("investment_objective", "growth"),
            }
    except Exception as e:
        logger.debug("behavioral_drift.profile_fetch", error=str(e))

    # Default moderate profile
    return {
        "risk_score": 5.0,
        "time_horizon": 5,
        "investment_objective": "growth",
    }


def _compute_history_depth(portfolio_history: list[dict]) -> int:
    """Compute the number of days covered by portfolio history."""
    if not portfolio_history:
        return 0

    dates = []
    for state in portfolio_history:
        d = _parse_date(state.get("date") or state.get("snapshot_date"))
        if d:
            dates.append(d)

    if len(dates) < 2:
        return 0

    return (max(dates) - min(dates)).days
