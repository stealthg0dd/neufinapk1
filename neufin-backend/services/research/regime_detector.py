"""
services/research/regime_detector.py — Market Regime Detection Agent
=====================================================================
Synthesises macro signals and market events to determine the current
market regime using a multi-factor scoring model + Claude validation.

Regime classifications:
  risk_on         VIX < 20, positive momentum, supportive macro
  risk_off        VIX > 25, negative momentum, widening spreads
  stagflation     High inflation + low/negative growth signals
  recovery        Improving employment + rising earnings revisions
  recession_risk  Inverted yield curve + deteriorating PMI
  neutral         Insufficient data or mixed signals

On regime CHANGE: immediately generates a critical research note.

Schedule: every 6 hours via APScheduler.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

import structlog

from database import supabase
from services.ai_router import get_ai_analysis
from services.research.slug_utils import slugify

logger = structlog.get_logger("neufin.regime_detector")


def _get_current_regime() -> dict | None:
    """Fetch the most recent active regime from the DB."""
    try:
        result = (
            supabase.table("market_regimes")
            .select("*")
            .is_("ended_at", "null")
            .order("started_at", desc=True)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None
    except Exception as exc:
        logger.warning("regime_detector.get_current_failed", error=str(exc))
        return None


def _close_regime(regime_id: str) -> None:
    """Mark an existing regime as ended."""
    try:
        supabase.table("market_regimes").update({"ended_at": datetime.now(UTC).isoformat()}).eq(
            "id", regime_id
        ).execute()
    except Exception as exc:
        logger.warning("regime_detector.close_failed", error=str(exc))


def _open_regime(regime: str, confidence: float, signals: list[dict]) -> str | None:
    """Insert a new active regime row. Returns new regime id."""
    try:
        result = (
            supabase.table("market_regimes")
            .insert(
                {
                    "regime": regime,
                    "started_at": datetime.now(UTC).isoformat(),
                    "ended_at": None,
                    "confidence": confidence,
                    "supporting_signals": signals,
                }
            )
            .execute()
        )
        return result.data[0]["id"] if result.data else None
    except Exception as exc:
        logger.error("regime_detector.open_failed", error=str(exc))
        return None


def _fetch_recent_signals(days: int = 30) -> list[dict]:
    """Fetch significant macro signals from the past N days."""
    cutoff = (datetime.now(UTC) - timedelta(days=days)).isoformat()
    try:
        result = (
            supabase.table("macro_signals")
            .select(
                "signal_type,region,title,value,previous_value,change_pct,signal_date,significance"
            )
            .gte("signal_date", cutoff)
            .in_("significance", ["high", "critical", "medium"])
            .order("signal_date", desc=True)
            .limit(30)
            .execute()
        )
        return result.data or []
    except Exception as exc:
        logger.warning("regime_detector.fetch_signals_failed", error=str(exc))
        return []


def _fetch_recent_events(days: int = 7) -> list[dict]:
    """Fetch recent high-impact market events."""
    cutoff = (datetime.now(UTC) - timedelta(days=days)).isoformat()
    try:
        result = (
            supabase.table("market_events")
            .select("event_type,title,impact_sentiment,impact_score,event_date,sector")
            .gte("event_date", cutoff)
            .in_(
                "impact_sentiment",
                ["very_negative", "negative", "very_positive", "positive"],
            )
            .order("event_date", desc=True)
            .limit(20)
            .execute()
        )
        return result.data or []
    except Exception as exc:
        logger.warning("regime_detector.fetch_events_failed", error=str(exc))
        return []


def _rule_based_regime(signals: list[dict]) -> tuple[str, float, list[dict]]:
    """
    Fast rule-based regime classification using key signal values.
    Returns (regime, confidence, supporting_signals).
    """
    signal_map: dict[str, float] = {}
    for s in signals:
        key = f"{s['signal_type']}_{s['region']}"
        if key not in signal_map and s.get("value") is not None:
            signal_map[key] = float(s["value"])

    vix = signal_map.get("volatility_GLOBAL")
    cpi_yoy = signal_map.get("inflation_US")
    unemployment = signal_map.get("employment_US")
    yield_spread = signal_map.get("yield_curve_US")

    supporting: list[dict] = []
    scores: dict[str, float] = {
        "risk_on": 0.0,
        "risk_off": 0.0,
        "stagflation": 0.0,
        "recovery": 0.0,
        "recession_risk": 0.0,
        "neutral": 0.3,
    }

    if vix is not None:
        if vix < 15:
            scores["risk_on"] += 0.3
            supporting.append({"signal": "VIX", "value": vix, "weight": 0.3})
        elif vix < 20:
            scores["risk_on"] += 0.15
        elif vix > 30:
            scores["risk_off"] += 0.4
            supporting.append({"signal": "VIX", "value": vix, "weight": 0.4})
        elif vix > 25:
            scores["risk_off"] += 0.25

    if cpi_yoy is not None:
        if cpi_yoy > 5.0:
            scores["stagflation"] += 0.35
            scores["risk_off"] += 0.15
            supporting.append({"signal": "CPI_YoY", "value": cpi_yoy, "weight": 0.35})
        elif cpi_yoy > 3.0:
            scores["stagflation"] += 0.15
        elif cpi_yoy < 2.0:
            scores["risk_on"] += 0.1

    if yield_spread is not None:
        if yield_spread < -0.5:
            scores["recession_risk"] += 0.4
            supporting.append({"signal": "10Y2Y_spread", "value": yield_spread, "weight": 0.4})
        elif yield_spread < 0:
            scores["recession_risk"] += 0.2
        elif yield_spread > 1.0:
            scores["risk_on"] += 0.15

    if unemployment is not None:
        if unemployment < 4.0:
            scores["risk_on"] += 0.1
            scores["recovery"] += 0.15
        elif unemployment > 6.0:
            scores["recession_risk"] += 0.2
            scores["risk_off"] += 0.1

    if cpi_yoy is not None and unemployment is not None:
        if cpi_yoy > 4.0 and unemployment > 5.0:
            scores["stagflation"] += 0.25

    best_regime = max(scores, key=lambda k: scores[k])
    best_score = scores[best_regime]
    # Confidence: normalized between 0.4 and 0.9
    confidence = round(min(0.9, max(0.4, best_score)), 2)

    return best_regime, confidence, supporting


async def detect_and_update_regime() -> dict:
    """
    Main regime detection function.
    1. Fetch recent macro signals and events
    2. Run rule-based classifier
    3. Validate with Claude
    4. Update DB if regime changed
    5. Generate research note on regime change

    Returns: {regime, confidence, changed, previous_regime}
    """
    signals = _fetch_recent_signals(days=30)
    events = _fetch_recent_events(days=7)
    current_regime_row = _get_current_regime()
    current_regime = current_regime_row.get("regime") if current_regime_row else None

    # Rule-based first pass
    rule_regime, rule_confidence, rule_signals = _rule_based_regime(signals)

    # Claude validation (more nuanced)
    signals_summary = [
        f"  - {s['title']} ({s['region']}): {s['value']} [{s['significance']}]"
        for s in signals[:15]
    ]
    events_summary = [
        f"  - {e['event_type']}: {e['title'][:80]} ({e.get('impact_sentiment', 'neutral')})"
        for e in events[:10]
    ]

    prompt = f"""You are a senior macro strategist at a major asset manager.

Based on the following data, classify the current global market regime.

MACRO SIGNALS (recent):
{chr(10).join(signals_summary) if signals_summary else "  No recent signals available."}

MARKET EVENTS (last 7 days):
{chr(10).join(events_summary) if events_summary else "  No recent events."}

RULE-BASED PRE-CLASSIFICATION: {rule_regime} (confidence: {rule_confidence})

Regimes:
- risk_on: Low volatility, positive momentum, supportive macro
- risk_off: High volatility, negative momentum, flight to safety
- stagflation: High inflation + weak growth
- recovery: Improving employment, rising earnings, positive momentum
- recession_risk: Inverted yield curve, deteriorating PMI, credit stress
- neutral: Mixed signals, uncertain direction

Return ONLY valid JSON:
{{
  "regime": "<risk_on|risk_off|stagflation|recovery|recession_risk|neutral>",
  "confidence": <0.0-1.0>,
  "rationale": "<1-2 sentence justification>",
  "key_driver": "<single most important signal driving this call>",
  "supporting_signals": [
    {{"signal": "<name>", "value": "<value>", "interpretation": "<brief>"}}
  ]
}}"""

    try:
        ai_result = await get_ai_analysis(prompt)
        final_regime = ai_result.get("regime", rule_regime)
        final_confidence = float(ai_result.get("confidence", rule_confidence))
        ai_signals = ai_result.get("supporting_signals", rule_signals)
        rationale = ai_result.get("rationale", "")
    except Exception as exc:
        logger.warning("regime_detector.ai_failed", error=str(exc))
        final_regime = rule_regime
        final_confidence = rule_confidence
        ai_signals = rule_signals
        rationale = "Rule-based classification (AI unavailable)"

    changed = final_regime != current_regime

    # Update DB
    if changed:
        logger.info(
            "regime_detector.regime_changed",
            old=current_regime,
            new=final_regime,
            confidence=final_confidence,
        )
        if current_regime_row:
            _close_regime(current_regime_row["id"])
        _open_regime(final_regime, final_confidence, ai_signals)

        # Trigger an immediate research note on regime change
        _regime_task = asyncio.create_task(
            _trigger_regime_change_note(final_regime, current_regime, rationale, signals[:10])
        )
        logger.debug("regime_detector.task_created", task_id=id(_regime_task))
    else:
        # Update confidence on existing regime
        if current_regime_row:
            try:
                supabase.table("market_regimes").update(
                    {"confidence": final_confidence, "supporting_signals": ai_signals}
                ).eq("id", current_regime_row["id"]).execute()
            except Exception as _upd_exc:
                logger.debug("regime_detector.update_confidence_failed", error=str(_upd_exc))

    return {
        "regime": final_regime,
        "confidence": final_confidence,
        "changed": changed,
        "previous_regime": current_regime,
        "rationale": rationale,
        "supporting_signals": ai_signals,
    }


async def _trigger_regime_change_note(
    new_regime: str,
    old_regime: str | None,
    rationale: str,
    signals: list[dict],
) -> None:
    """Generate a critical research note immediately on regime change."""
    try:
        from services.research.synthesiser import (
            generate_research_note,
        )

        await generate_research_note(
            note_type="regime_change",
            context_days=14,
            override_context={
                "regime_change": {
                    "from": old_regime,
                    "to": new_regime,
                    "rationale": rationale,
                },
                "signals": signals,
                "slug_hint": slugify(f"Regime change {old_regime or 'unknown'} to {new_regime}"),
            },
        )
        logger.info("regime_detector.regime_note_generated", regime=new_regime)
    except Exception as exc:
        logger.warning("regime_detector.note_generation_failed", error=str(exc))


async def run_regime_detector() -> dict:
    """APScheduler entry point — runs every 6 hours."""
    logger.info("regime_detector.run_start")
    result = await detect_and_update_regime()
    logger.info(
        "regime_detector.run_complete",
        **{k: v for k, v in result.items() if k != "supporting_signals"},
    )
    return result


def get_current_regime_summary() -> dict:
    """Synchronous helper for other services to get the current regime."""
    row = _get_current_regime()
    if not row:
        return {
            "regime": "neutral",
            "confidence": 0.5,
            "started_at": None,
            "supporting_signals": [],
        }
    return {
        "regime": row["regime"],
        "confidence": float(row.get("confidence") or 0.5),
        "started_at": row.get("started_at"),
        "supporting_signals": row.get("supporting_signals") or [],
    }
