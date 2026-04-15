"""
services/sales_digest.py — Weekly sales pipeline digest for Slack.

Posts a Monday 08:00 SGT summary of the NeuFin B2B sales pipeline
to #ctech-command.

Schedule: Monday 08:00 SGT (set in main.py APScheduler).
Can also be triggered on-demand for testing.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import structlog

from database import supabase
from services.slack import notify_ctech

logger = structlog.get_logger("neufin.sales_digest")

# Estimated MRR per plan (used for pipeline value calculation)
_PLAN_MRR: dict[str, int] = {
    "advisor": 299,
    "enterprise": 999,
    "retail": 29,
}


def _build_digest() -> str:
    """
    Query the leads table and build the weekly digest Slack message.
    Returns the formatted message string.
    """
    now = datetime.now(UTC)
    week_ago = (now - timedelta(days=7)).isoformat()
    two_weeks_ago = (now - timedelta(days=14)).isoformat()

    try:
        result = (
            supabase.table("leads")
            .select("id,name,company,status,source,interested_plan,created_at,won_at")
            .execute()
        )
        leads = result.data or []
    except Exception as exc:
        logger.error("sales_digest.fetch_failed", error=str(exc))
        return ":warning: Sales digest failed — could not fetch leads data."

    total = len(leads)

    # This-week vs last-week new leads
    new_this_week = [row for row in leads if row.get("created_at", "") >= week_ago]
    new_last_week = [row for row in leads if two_weeks_ago <= row.get("created_at", "") < week_ago]

    # Status counts across all time
    by_status: dict[str, int] = {}
    for lead in leads:
        s = lead.get("status", "new")
        by_status[s] = by_status.get(s, 0) + 1

    demos_scheduled = by_status.get("demo_scheduled", 0)
    proposals_sent = by_status.get("proposal_sent", 0)
    won_total = by_status.get("won", 0)

    # Conversions this week
    won_this_week = [
        row for row in leads if row.get("status") == "won" and row.get("won_at", "") >= week_ago
    ]

    # Pipeline MRR potential (active non-lost, non-won leads)
    active_statuses = {
        "new",
        "contacted",
        "demo_scheduled",
        "demo_done",
        "proposal_sent",
    }
    pipeline_mrr = sum(
        _PLAN_MRR.get(row.get("interested_plan") or "advisor", 299)
        for row in leads
        if row.get("status") in active_statuses
    )

    # Top lead this week (most recently created)
    top_lead = max(new_this_week, key=lambda row: row.get("created_at", ""), default=None)
    top_lead_str = (
        f"{top_lead['name']} from {top_lead.get('company', '—')}"
        if top_lead
        else "No new leads this week"
    )

    wow_arrow = "↑" if len(new_this_week) >= len(new_last_week) else "↓"
    wow_diff = abs(len(new_this_week) - len(new_last_week))
    conversion_rate = round(won_total / total * 100, 1) if total > 0 else 0.0

    message = (
        f":bar_chart: *NeuFin Sales — Week in Review* "
        f"({now.strftime('%d %b %Y')})\n\n"
        f">*New leads this week:* {len(new_this_week)} "
        f"({wow_arrow} {wow_diff} vs last week)\n"
        f">*Demos scheduled (all time):* {demos_scheduled}\n"
        f">*Proposals sent (all time):* {proposals_sent}\n"
        f">*Conversions this week:* {len(won_this_week)} "
        f"| *All-time conversion rate:* {conversion_rate}%\n"
        f">*Pipeline MRR potential:* ${pipeline_mrr:,}\n"
        f">*Total leads in pipeline:* {total}\n\n"
        f":trophy: *Top lead this week:* {top_lead_str}\n\n"
        f"_Full pipeline: /dashboard/admin/leads_"
    )
    return message


async def run_weekly_sales_digest() -> None:
    """APScheduler entry point — runs every Monday 08:00 SGT."""
    logger.info("sales_digest.run_start")
    try:
        message = _build_digest()
        await notify_ctech(message)
        logger.info("sales_digest.sent")
    except Exception as exc:
        logger.error("sales_digest.failed", error=str(exc))
