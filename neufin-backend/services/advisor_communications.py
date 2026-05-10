"""
Client communication studio — AI drafts only; advisor approves and sends externally.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

import structlog

from database import supabase
from services.ai_router import get_ai_analysis
from services.client_comm_pdf import build_client_summary_pdf_bytes
from services.meeting_prep import build_metrics_bundle

logger = structlog.get_logger(__name__)

_DEFAULT_DISCLAIMER = (
    "This material is for informational purposes only and does not constitute "
    "personalized investment advice, an offer, or a solicitation. Past performance "
    "is not indicative of future results. Please consult a licensed professional in "
    "your jurisdiction regarding your specific circumstances."
)


def _assert_client(advisor_id: str, client_id: str) -> dict[str, Any]:
    res = (
        supabase.table("advisor_clients")
        .select("*")
        .eq("id", client_id)
        .eq("advisor_id", advisor_id)
        .single()
        .execute()
    )
    if not res.data:
        raise ValueError("Client not found.")
    return res.data


def _month_year() -> str:
    return datetime.now(UTC).strftime("%B %Y")


def _prompt_for_type(
    comm_type: str,
    metrics: dict[str, Any],
    context_notes: str | None,
) -> str:
    base = json.dumps(metrics, default=str)
    notes = (context_notes or "").strip()[:3000]
    month = _month_year()
    if comm_type == "email":
        return f"""You are writing a client-facing email for a non-expert retail investor.
Tone: professional, warm, plain English - no quant jargon, no model names.
Jurisdiction: default Singapore/Malaysia-style wealth context unless context notes say otherwise.
Return ONLY valid JSON: {{"subject": "Your Portfolio Review - {month}", "content": "full email body with paragraphs separated by \\n\\n", "disclaimer": "short compliance footer paragraph"}}
Context notes from advisor (may be empty): {notes}
Metrics (structured only - do not invent tickers not in metrics): {base}
Structure inside content:
- Opening personalised to client name and portfolio value summary from metrics
- What's changed: DNA score and top bias in plain language
- The recommendation: one clear action
- What improves: behavioural risk tier movement if applicable
- Next steps: advisor + client
End content with the disclaimer text duplicated in the disclaimer field too (footer)."""

    if comm_type == "whatsapp":
        disc_esc = json.dumps(_DEFAULT_DISCLAIMER)
        return f"""Write an ultra-concise WhatsApp update for the client (max 5 short lines, optional emoji).
Return ONLY valid JSON: {{"subject": "Portfolio update", "content": "the WhatsApp message only", "disclaimer": {disc_esc}}}
Advisor notes: {notes}
Metrics: {base}"""

    if comm_type == "pdf":
        disc_esc = json.dumps(_DEFAULT_DISCLAIMER)
        return f"""Write a formal 1-2 page client memo (no quant model detail, no internal jargon).
Return ONLY valid JSON: {{"subject": "Portfolio Summary - {month}", "content": "memo body with \\n\\n between sections", "disclaimer": {disc_esc}}}
Advisor notes: {notes}
Metrics: {base}
Sections: Summary, What changed, Recommendations, Next steps."""

    # talking_points
    return f"""Write advisor-only talking points (bullets, not sent to client).
Return ONLY valid JSON: {{"subject": "Talking points - review", "content": "bullet lines starting with - ", "disclaimer": "Internal use only - not for client distribution."}}
Advisor notes: {notes}
Metrics: {base}"""


async def generate_communication_draft(
    advisor_id: str,
    client_id: str,
    comm_type: str,
    context_notes: str | None,
) -> dict[str, Any]:
    if comm_type not in ("email", "whatsapp", "pdf", "talking_points"):
        raise ValueError("Invalid type.")

    _assert_client(advisor_id, client_id)
    meeting_date = datetime.now(UTC).strftime("%Y-%m-%d")
    metrics = build_metrics_bundle(
        advisor_id,
        client_id,
        meeting_date,
        context_notes,
    )
    prompt = _prompt_for_type(comm_type, metrics, context_notes)
    try:
        raw = await get_ai_analysis(prompt, response_format="json")
    except Exception as exc:
        logger.warning("advisor_comms.ai_failed", error=str(exc))
        raw = {}
    if not isinstance(raw, dict):
        raw = {}

    subject = str(raw.get("subject") or "Client communication")
    content = str(raw.get("content") or "").strip() or "—"
    disclaimer = str(raw.get("disclaimer") or _DEFAULT_DISCLAIMER).strip()

    compliance = "pending_review"
    channel = (
        "email"
        if comm_type == "email"
        else (
            "whatsapp"
            if comm_type == "whatsapp"
            else "document" if comm_type == "pdf" else "note"
        )
    )

    meta: dict[str, Any] = {
        "disclaimer": disclaimer,
        "metrics_snapshot_at": datetime.now(UTC).isoformat(),
    }

    ins = (
        supabase.table("client_communications")
        .insert(
            {
                "advisor_id": advisor_id,
                "client_id": client_id,
                "channel": channel,
                "subject": subject,
                "body": content,
                "metadata": meta,
                "occurred_at": datetime.now(UTC).isoformat(),
                "status": "draft",
                "compliance_status": compliance,
                "communication_type": comm_type,
            }
        )
        .execute()
    )
    row = (ins.data or [{}])[0]
    cid = str(row.get("id") or "")

    return {
        "id": cid,
        "client_id": client_id,
        "client_display_name": metrics.get("client_display_name"),
        "type": comm_type,
        "subject": subject,
        "content": content,
        "disclaimer": disclaimer,
        "compliance_status": compliance,
        "status": "draft",
        "created_at": row.get("created_at"),
    }


def list_communications(advisor_id: str, client_id: str) -> list[dict[str, Any]]:
    _assert_client(advisor_id, client_id)
    res = (
        supabase.table("client_communications")
        .select("*")
        .eq("advisor_id", advisor_id)
        .eq("client_id", client_id)
        .order("created_at", desc=True)
        .limit(100)
        .execute()
    )
    return list(res.data or [])


def get_communication(advisor_id: str, comm_id: str) -> dict[str, Any]:
    res = (
        supabase.table("client_communications")
        .select("*")
        .eq("id", comm_id)
        .eq("advisor_id", advisor_id)
        .single()
        .execute()
    )
    if not res.data:
        raise ValueError("Communication not found.")
    return res.data


def patch_communication(
    advisor_id: str,
    comm_id: str,
    *,
    subject: str | None = None,
    body: str | None = None,
    status: str | None = None,
) -> dict[str, Any]:
    updates: dict[str, Any] = {}
    if subject is not None:
        updates["subject"] = subject
    if body is not None:
        updates["body"] = body
    if status is not None:
        if status not in ("draft", "approved", "sent"):
            raise ValueError("Invalid status.")
        updates["status"] = status
        if status == "draft":
            updates["compliance_status"] = "pending_review"
        if status == "approved":
            updates["compliance_status"] = "cleared_for_manual_send"
        if status == "sent":
            updates["sent_at"] = datetime.now(UTC).isoformat()
            updates["compliance_status"] = "marked_sent_by_advisor"
    if not updates:
        raise ValueError("No updates provided.")
    res = (
        supabase.table("client_communications")
        .update(updates)
        .eq("id", comm_id)
        .eq("advisor_id", advisor_id)
        .execute()
    )
    row = (res.data or [None])[0]
    if not row:
        raise ValueError("Communication not found.")
    return row


def build_pdf_for_communication(advisor_id: str, comm_id: str) -> tuple[bytes, str]:
    row = get_communication(advisor_id, comm_id)
    ctype = str(row.get("communication_type") or "")
    if ctype != "pdf":
        raise ValueError("PDF export is only available for pdf-type communications.")
    subj = str(row.get("subject") or "Client summary")
    body = str(row.get("body") or "")
    meta = row.get("metadata") or {}
    if not isinstance(meta, dict):
        meta = {}
    disc = str(meta.get("disclaimer") or _DEFAULT_DISCLAIMER)
    pdf = build_client_summary_pdf_bytes(subj, body, disc)
    return pdf, subj
