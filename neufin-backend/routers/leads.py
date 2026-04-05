"""
routers/leads.py — Contact sales lead capture.

POST /api/leads  — saves lead to Supabase and notifies #ctech-command
"""

from __future__ import annotations

import structlog
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr

from database import supabase
from services.slack import notify_ctech

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["leads"])


class LeadCreate(BaseModel):
    name: str
    email: EmailStr
    company: str
    role: str
    aum_range: str
    message: str | None = None


@router.post("/api/leads", status_code=201)
async def create_lead(body: LeadCreate) -> dict:
    """Capture a contact-sales enquiry and notify the #ctech-command Slack channel."""
    try:
        result = (
            supabase.table("leads")
            .insert(
                {
                    "name": body.name,
                    "email": body.email,
                    "company": body.company,
                    "role": body.role,
                    "aum_range": body.aum_range,
                    "message": body.message or "",
                    "source": "contact_sales",
                }
            )
            .execute()
        )
        lead_id = result.data[0]["id"] if result.data else None
    except Exception as exc:
        logger.error("leads.insert_failed", error=str(exc))
        raise HTTPException(status_code=500, detail="Failed to save lead") from exc

    # Fire-and-forget Slack notification — failure never blocks the response
    slack_text = (
        f":handshake: *New Sales Lead* — {body.name} @ {body.company}\n"
        f">*Role:* {body.role}\n"
        f">*AUM:* {body.aum_range}\n"
        f">*Email:* {body.email}\n"
        f">*Message:* {body.message or '—'}"
    )
    try:
        await notify_ctech(slack_text)
    except Exception as exc:
        logger.warning("leads.slack_notify_failed", error=str(exc))

    return {"created": True, "lead_id": lead_id}
