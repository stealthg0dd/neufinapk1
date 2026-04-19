"""
routers/leads.py — Lead capture and CRM management endpoints.

Public:
  POST /api/leads           — contact-sales / demo request form submission

Admin (requires is_admin=True):
  GET  /api/admin/leads     — paginated list with filters
  PATCH /api/admin/leads/{id} — update status, notes, contacted_at
  GET  /api/admin/leads/stats — pipeline stats and conversion metrics
"""

from __future__ import annotations

import asyncio
import re
from datetime import datetime, timedelta, timezone

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from database import supabase
from services.auth_dependency import get_admin_user
from services.slack import notify_ctech

UTC = timezone.utc  # noqa: UP017  # Py3.9 compat (datetime.UTC is 3.11+)

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["leads"])

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# ── Pydantic models ───────────────────────────────────────────────────────────


class LeadCreate(BaseModel):
    name: str
    email: str
    company: str | None = None
    role: str | None = None
    aum_range: str | None = None
    message: str | None = None
    source: str = "contact_form"
    interested_plan: str | None = None


class LeadUpdate(BaseModel):
    status: str | None = None
    notes: str | None = None
    contacted_at: str | None = None
    interested_plan: str | None = None


# ── Public: lead capture ──────────────────────────────────────────────────────


@router.post("/api/leads", status_code=201)
async def create_lead(body: LeadCreate) -> dict:
    """
    Capture a lead from contact-sales or demo-request form.
    Validates email, saves to DB, notifies Slack, sends confirmation email.
    """
    if not body.name.strip():
        raise HTTPException(status_code=422, detail="Name is required.")
    if not body.email.strip() or not _EMAIL_RE.match(body.email.strip().lower()):
        raise HTTPException(status_code=422, detail="Valid email address required.")

    email = body.email.strip().lower()

    # Upsert: if email already exists, update the record rather than error
    try:
        existing = (
            supabase.table("leads")
            .select("id, status")
            .eq("email", email)
            .limit(1)
            .execute()
        )
        if existing.data:
            lead_id = existing.data[0]["id"]
            update_payload: dict = {}
            if body.message:
                update_payload["notes"] = body.message
            if body.source:
                update_payload["source"] = body.source
            if body.interested_plan:
                update_payload["interested_plan"] = body.interested_plan
            if update_payload:
                supabase.table("leads").update(update_payload).eq(
                    "id", lead_id
                ).execute()
        else:
            result = (
                supabase.table("leads")
                .insert(
                    {
                        "name": body.name.strip(),
                        "email": email,
                        "company": body.company,
                        "role": body.role,
                        "aum_range": body.aum_range,
                        "source": body.source,
                        "status": "new",
                        "notes": body.message,
                        "interested_plan": body.interested_plan,
                        "message": body.message,
                    }
                )
                .execute()
            )
            lead_id = result.data[0]["id"] if result.data else None
    except Exception as exc:
        logger.error("leads.insert_failed", error=str(exc))
        raise HTTPException(status_code=500, detail="Failed to save lead.") from exc

    # Determine plan interest for Slack message
    plan_label = body.interested_plan or (
        "Enterprise" if body.aum_range and "200M" in body.aum_range else "Advisor"
    )

    slack_text = (
        f":dart: *New Lead: {body.name.strip()}* from {body.company or '(unknown company)'} "
        f"({body.role or 'unknown role'})\n"
        f">*AUM:* {body.aum_range or 'not specified'} | "
        f"*Plan interest:* {plan_label} | *Source:* {body.source}\n"
        f">*Email:* {email}\n"
        f">*Message:* {(body.message or '')[:200] or '—'}\n"
        f">→ Review at /dashboard/admin/leads"
    )

    # Fire Slack + email concurrently (both fire-and-forget — never block response)
    async def _notify() -> None:
        try:
            await notify_ctech(slack_text)
        except Exception as _e:
            logger.warning("leads.slack_failed", error=str(_e))

    async def _confirm_email() -> None:
        try:
            from services.email_service import (
                send_demo_confirmation,
                send_lead_confirmation,
            )

            if body.source == "demo_request":
                await send_demo_confirmation(email, body.name.strip())
            else:
                await send_lead_confirmation(email, body.name.strip())
        except Exception as _e:
            logger.warning("leads.email_failed", error=str(_e))

    _notify_task = asyncio.create_task(_notify())
    _email_task = asyncio.create_task(_confirm_email())
    logger.debug("leads.tasks_created", notify=id(_notify_task), email=id(_email_task))

    return {
        "success": True,
        "message": "We'll be in touch within 24 hours.",
        "lead_id": lead_id,
    }


# ── Admin: list leads ─────────────────────────────────────────────────────────


@router.get("/api/admin/leads")
async def list_leads(
    _admin=Depends(get_admin_user),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status: str | None = None,
    source: str | None = None,
    since: str | None = None,
    until: str | None = None,
) -> dict:
    """List all leads with pagination and optional filters. Requires admin."""
    offset = (page - 1) * per_page

    query = (
        supabase.table("leads")
        .select("*")
        .order("created_at", desc=True)
        .range(offset, offset + per_page - 1)
    )
    if status:
        query = query.eq("status", status)
    if source:
        query = query.eq("source", source)
    if since:
        query = query.gte("created_at", since)
    if until:
        query = query.lte("created_at", until)

    try:
        result = query.execute()
        return {"leads": result.data or [], "page": page, "per_page": per_page}
    except Exception as exc:
        logger.error("leads.list_failed", error=str(exc))
        raise HTTPException(status_code=500, detail="Failed to list leads.") from exc


# ── Admin: update lead ────────────────────────────────────────────────────────


@router.patch("/api/admin/leads/{lead_id}")
async def update_lead(
    lead_id: str, body: LeadUpdate, _admin=Depends(get_admin_user)
) -> dict:
    """Update lead status, notes, or contacted_at. Requires admin."""
    valid_statuses = {
        "new",
        "contacted",
        "demo_scheduled",
        "demo_done",
        "proposal_sent",
        "won",
        "lost",
        "nurture",
    }
    if body.status and body.status not in valid_statuses:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid status. Must be one of: {', '.join(sorted(valid_statuses))}",
        )

    # Fetch current lead first
    try:
        current = (
            supabase.table("leads").select("*").eq("id", lead_id).limit(1).execute()
        )
        if not current.data:
            raise HTTPException(status_code=404, detail="Lead not found.")
        lead = current.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to fetch lead.") from exc

    payload: dict = {}
    if body.status:
        payload["status"] = body.status
    if body.notes is not None:
        payload["notes"] = body.notes
    if body.contacted_at:
        payload["contacted_at"] = body.contacted_at
    if body.interested_plan:
        payload["interested_plan"] = body.interested_plan

    # Auto-set timestamps on status transitions
    if body.status == "contacted" and not lead.get("contacted_at"):
        payload["contacted_at"] = datetime.now(UTC).isoformat()
    if body.status == "won" and not lead.get("won_at"):
        payload["won_at"] = datetime.now(UTC).isoformat()

    if not payload:
        return {"updated": False, "lead": lead}

    try:
        result = supabase.table("leads").update(payload).eq("id", lead_id).execute()
        updated_lead = result.data[0] if result.data else {**lead, **payload}
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to update lead.") from exc

    # Celebrate won deals in Slack
    if body.status == "won":
        _won_task = asyncio.create_task(_post_won_celebration(lead))
        logger.debug("leads.won_task_created", task=id(_won_task))

    return {"updated": True, "lead": updated_lead}


async def _post_won_celebration(lead: dict) -> None:
    try:
        name = lead.get("name", "Unknown")
        company = lead.get("company", "")
        plan = lead.get("interested_plan", "").title() or "Unknown plan"
        aum = lead.get("aum_range", "")
        await notify_ctech(
            f":trophy: *Deal Won!* {name} from {company} just signed up!\n"
            f">*Plan:* {plan} | *AUM:* {aum}\n"
            f">Great work team! :neufin:"
        )
    except Exception as exc:
        logger.warning("leads.won_slack_failed", error=str(exc))


# ── Admin: pipeline stats ─────────────────────────────────────────────────────


@router.get("/api/admin/leads/stats")
async def lead_stats(_admin=Depends(get_admin_user)) -> dict:
    """Pipeline stats: total leads, by-status counts, conversion rate, weekly comparison."""
    try:
        all_leads = (
            supabase.table("leads")
            .select("id,status,source,created_at,won_at,contacted_at")
            .execute()
        )
        leads = all_leads.data or []
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to fetch stats.") from exc

    now = datetime.now(UTC)
    week_ago = (now - timedelta(days=7)).isoformat()
    two_weeks_ago = (now - timedelta(days=14)).isoformat()

    total = len(leads)
    by_status: dict[str, int] = {}
    for lead in leads:
        s = lead.get("status", "new")
        by_status[s] = by_status.get(s, 0) + 1

    won = by_status.get("won", 0)
    conversion_rate = round(won / total * 100, 1) if total > 0 else 0.0

    leads_this_week = sum(1 for lead in leads if lead.get("created_at", "") >= week_ago)
    leads_last_week = sum(
        1 for lead in leads if two_weeks_ago <= lead.get("created_at", "") < week_ago
    )

    # Average days to close (won leads only)
    close_times: list[float] = []
    for lead in leads:
        if (
            lead.get("status") == "won"
            and lead.get("won_at")
            and lead.get("created_at")
        ):
            try:
                created = datetime.fromisoformat(
                    lead["created_at"].replace("Z", "+00:00")
                )
                closed = datetime.fromisoformat(lead["won_at"].replace("Z", "+00:00"))
                close_times.append((closed - created).days)
            except Exception as _dt_exc:
                logger.debug("leads.close_time_parse_failed", error=str(_dt_exc))
    avg_days_to_close = (
        round(sum(close_times) / len(close_times), 1) if close_times else None
    )

    # Most recent lead
    sorted_leads = sorted(
        leads, key=lambda row: row.get("created_at", ""), reverse=True
    )
    top_lead = (
        {"name": sorted_leads[0].get("name"), "company": sorted_leads[0].get("company")}
        if sorted_leads
        else None
    )

    return {
        "total_leads": total,
        "by_status": by_status,
        "conversion_rate_pct": conversion_rate,
        "avg_days_to_close": avg_days_to_close,
        "leads_this_week": leads_this_week,
        "leads_last_week": leads_last_week,
        "week_over_week_change": leads_this_week - leads_last_week,
        "top_recent_lead": top_lead,
    }
