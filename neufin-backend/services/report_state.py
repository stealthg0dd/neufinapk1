"""
Report lifecycle states and section confidence for advisor / IC PDF exports.

States
------
  draft   — Missing critical inputs or invalid headline metrics; not IC-certified.
  review  — Usable internally; caveats (e.g. no Swarm, partial tax data).
  final   — Presentation-grade inputs for an IC-style memo (best-effort gate).

Migration: PDF generation always succeeds by default; optional ``ic_grade_only``
raises when state would be ``draft`` (see ``generate_advisor_report``).
"""

from __future__ import annotations

from typing import Any

REPORT_DRAFT = "draft"
REPORT_REVIEW = "review"
REPORT_FINAL = "final"

CONF_HIGH = "high"
CONF_MEDIUM = "medium"
CONF_LOW = "low"


def assess_report_state(ctx: dict[str, Any]) -> str:
    """Return draft | review | final from unified report context."""
    positions = ctx.get("positions") or []
    tv = float(ctx.get("total_value") or 0)
    if not positions or tv <= 0:
        return REPORT_DRAFT

    dna = int(ctx.get("dna_score") or 0)
    if dna <= 0:
        return REPORT_DRAFT

    beta = float(ctx.get("weighted_beta") or 0)
    if beta <= 0:
        return REPORT_DRAFT

    wsum = 0.0
    for p in positions:
        raw = p.get("weight") or p.get("weight_pct") or 0
        try:
            v = float(raw)
        except (TypeError, ValueError):
            continue
        wsum += v / 100.0 if v > 1.5 else v
    if wsum < 0.85 or wsum > 1.15:
        return REPORT_DRAFT

    if not ctx.get("swarm_available"):
        return REPORT_REVIEW

    tax_positions = ctx.get("tax_positions") or []
    if not tax_positions:
        return REPORT_REVIEW

    return REPORT_FINAL


def build_section_confidence(ctx: dict[str, Any]) -> dict[str, str]:
    """Per logical section — high | medium | low (displayed in executive summary)."""
    st = assess_report_state(ctx)
    swarm = bool(ctx.get("swarm_available"))
    tax = bool(ctx.get("tax_positions"))

    base_exec = (
        CONF_HIGH
        if st == REPORT_FINAL
        else CONF_MEDIUM if st == REPORT_REVIEW else CONF_LOW
    )
    risk = CONF_HIGH if swarm else CONF_MEDIUM if st != REPORT_DRAFT else CONF_LOW
    scenario = CONF_HIGH if swarm else CONF_LOW
    tax_c = CONF_HIGH if tax else CONF_MEDIUM

    return {
        "executive_summary": base_exec,
        "portfolio_snapshot": base_exec,
        "risk_analysis": risk,
        "behavioral_insights": base_exec,
        "scenario_analysis": scenario,
        "tax_implementation": tax_c,
        "recommendations": base_exec,
        "appendix": CONF_MEDIUM,
    }
