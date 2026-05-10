"""
Advisor Multi-Client Dashboard & CRM
-----------------------------------
GET  /api/advisor/brief                      → daily brief JSON (30m cache)
GET  /api/advisor/morning-brief              → aggregated advisor morning brief
GET  /api/advisor/clients                    → advisor client book (CRM)
POST /api/advisor/clients                    → create advisor_client + primary portfolio link
GET  /api/advisor/clients/{id}               → client detail
PATCH /api/advisor/clients/{id}             → update client
DELETE /api/advisor/clients/{id}             → delete client (cascades)
GET  /api/advisor/clients/{id}/timeline      → DNA + portfolio snapshots
GET  /api/advisor/clients/{id}/analysis       → latest DNA (legacy portfolio OR book client)
GET  /api/advisor/clients/{id}/reports       → advisor PDF reports for linked portfolio
POST /api/advisor/reports/batch              → queue reports (portfolio UUIDs)
POST /api/advisor/meeting-prep               → generate 1-page meeting prep brief
PATCH /api/advisor/meeting-prep/{meeting_id}  → update prep status / saved JSON
POST /api/advisor/communications/generate    → AI draft (email / WhatsApp / PDF / talking points)
GET  /api/advisor/communications?client_id= → list communications for client
PATCH /api/advisor/communications/{id}       → save draft / approve / mark sent (no auto-send)
GET  /api/advisor/communications/{id}/pdf  → download client-summary PDF (pdf type only)
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel

from database import supabase
from services.advisor_brief import build_morning_brief_dashboard, get_daily_brief_cached
from services.advisor_communications import (
    build_pdf_for_communication,
    generate_communication_draft,
    list_communications,
    patch_communication,
)
from services.auth_dependency import get_current_user
from services.jwt_auth import JWTUser
from services.meeting_prep import generate_meeting_prep_brief, patch_meeting_prep

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/advisor", tags=["advisor"])

_ADVISOR_PLANS = {"advisor", "enterprise"}

CHURN_ORDER = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}


def _truthy_admin(raw: Any) -> bool:
    if raw is True:
        return True
    if raw in (1, "1", "true", "t", "yes"):
        return True
    return False


def _load_profile(user_id: str) -> dict[str, Any]:
    try:
        result = (
            supabase.table("user_profiles")
            .select("subscription_tier, role, is_admin")
            .eq("id", user_id)
            .single()
            .execute()
        )
        return dict(result.data or {})
    except Exception:
        return {}


def _require_advisor_access(user: JWTUser) -> str:
    """
    Advisor/enterprise tier OR internal admin OR advisor/admin role.
    Returns normalized subscription tier string for logging (may be 'free' for admins).
    """
    p = _load_profile(user.id)
    tier = str(p.get("subscription_tier") or "free").lower()
    role = str(p.get("role") or "").lower()
    is_admin = _truthy_admin(p.get("is_admin"))

    if tier in _ADVISOR_PLANS or is_admin or role in {"advisor", "admin"}:
        return tier

    raise HTTPException(
        status_code=403,
        detail={
            "error": "plan_required",
            "message": "Advisor access required for this feature.",
            "upgrade_url": "/pricing",
            "required_plan": "advisor",
        },
    )


def _severity_to_churn(sev: str | None) -> str:
    s = (sev or "").lower()
    if s in {"critical", "high"}:
        return "HIGH"
    if s == "medium":
        return "MEDIUM"
    return "LOW"


def _detail_bias(detail: Any) -> str | None:
    if not isinstance(detail, dict):
        return None
    for key in ("top_bias", "bias_flag", "top_flag", "primary_bias"):
        v = detail.get(key)
        if v:
            return str(v)
    return None


def _payload_str(payload: Any, *keys: str) -> str | None:
    if not isinstance(payload, dict):
        return None
    for k in keys:
        v = payload.get(k)
        if v:
            return str(v)
    return None


def _resolve_primary_portfolio_id(client_id: str, advisor_id: str) -> str | None:
    try:
        r = (
            supabase.table("client_portfolios")
            .select("id, base_portfolio_id, created_at")
            .eq("client_id", client_id)
            .eq("advisor_id", advisor_id)
            .order("created_at", desc=False)
            .limit(25)
            .execute()
        )
        rows = list(r.data or [])
        for row in rows:
            bp = row.get("base_portfolio_id")
            if bp:
                return str(bp)
        return None
    except Exception:
        return None


def _assert_portfolio_access(portfolio_id: str, advisor_id: str) -> dict[str, Any]:
    try:
        port_result = (
            supabase.table("portfolios")
            .select("id, advisor_id, name, total_value, client_name, client_email")
            .eq("id", portfolio_id)
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(404, "Client portfolio not found.") from None
    data = port_result.data or {}
    if data.get("advisor_id") != advisor_id:
        raise HTTPException(403, "Access denied to this client portfolio.")
    return data


# ── Request models ────────────────────────────────────────────────────────────


class ClientPortfolioRequest(BaseModel):
    """Create client — accepts legacy `name` or form `client_name`."""

    name: str | None = None
    client_name: str | None = None
    client_email: str | None = None
    notes: str | None = None
    total_value: float = 0.0


class AdvisorClientUpdate(BaseModel):
    display_name: str | None = None
    email: str | None = None
    notes: str | None = None
    company: str | None = None
    phone: str | None = None
    status: str | None = None
    metadata: dict[str, Any] | None = None


class BatchReportRequest(BaseModel):
    client_ids: list[str]


class MeetingPrepRequest(BaseModel):
    client_id: str
    meeting_date: str
    notes: str | None = None


class MeetingPrepPatchBody(BaseModel):
    prep_status: str | None = None
    prep_brief_json: dict[str, Any] | None = None


class CommunicationGenerateBody(BaseModel):
    client_id: str
    type: Literal["email", "whatsapp", "pdf", "talking_points"]
    context_notes: str | None = None


class CommunicationPatchBody(BaseModel):
    subject: str | None = None
    body: str | None = None
    status: Literal["draft", "approved", "sent"] | None = None


# ── Morning brief ─────────────────────────────────────────────────────────────


@router.get("/brief")
async def advisor_daily_brief(user: JWTUser = Depends(get_current_user)):
    """
    Cached daily brief (30m) — regime, ranked clients, unread alerts, meetings.
    """
    _require_advisor_access(user)
    return get_daily_brief_cached(user.id)


@router.get("/morning-brief")
async def morning_brief(user: JWTUser = Depends(get_current_user)):
    """Aggregated behavioral / CRM brief for the advisor dashboard."""
    _require_advisor_access(user)
    return build_morning_brief_dashboard(user)


@router.post("/meeting-prep")
async def meeting_prep_create(
    body: MeetingPrepRequest,
    user: JWTUser = Depends(get_current_user),
):
    """Generate meeting prep brief (metrics-only → Claude), persist meeting + draft comms."""
    _require_advisor_access(user)
    try:
        return await generate_meeting_prep_brief(
            user.id,
            body.client_id,
            body.meeting_date,
            body.notes,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        logger.exception("advisor.meeting_prep_failed", error=str(exc))
        raise HTTPException(500, "Meeting prep generation failed.") from exc


@router.patch("/meeting-prep/{meeting_id}")
async def meeting_prep_patch(
    meeting_id: str,
    body: MeetingPrepPatchBody,
    user: JWTUser = Depends(get_current_user),
):
    _require_advisor_access(user)
    if body.prep_status is None and body.prep_brief_json is None:
        raise HTTPException(400, "Provide prep_status and/or prep_brief_json.")
    try:
        return patch_meeting_prep(
            user.id,
            meeting_id,
            prep_status=body.prep_status,
            prep_brief_json=body.prep_brief_json,
        )
    except ValueError as exc:
        msg = str(exc).lower()
        if "not found" in msg:
            raise HTTPException(404, str(exc)) from exc
        raise HTTPException(400, str(exc)) from exc


@router.post("/communications/generate")
async def communications_generate(
    body: CommunicationGenerateBody,
    user: JWTUser = Depends(get_current_user),
):
    """
    Generate advisor-reviewable client communication; persists as draft.
    NeuFin never sends email or WhatsApp from this API.
    """
    _require_advisor_access(user)
    try:
        return await generate_communication_draft(
            user.id,
            body.client_id,
            body.type,
            body.context_notes,
        )
    except ValueError as exc:
        msg = str(exc).lower()
        if "not found" in msg:
            raise HTTPException(404, str(exc)) from exc
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        logger.exception("advisor.communications_generate_failed", error=str(exc))
        raise HTTPException(500, "Communication generation failed.") from exc


@router.get("/communications")
async def communications_list(
    client_id: str = Query(..., description="advisor_clients.id"),
    user: JWTUser = Depends(get_current_user),
):
    _require_advisor_access(user)
    try:
        rows = list_communications(user.id, client_id)
        return {"communications": rows}
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.patch("/communications/{comm_id}")
async def communications_patch(
    comm_id: str,
    body: CommunicationPatchBody,
    user: JWTUser = Depends(get_current_user),
):
    _require_advisor_access(user)
    if body.subject is None and body.body is None and body.status is None:
        raise HTTPException(400, "Provide subject, body, and/or status.")
    try:
        return patch_communication(
            user.id,
            comm_id,
            subject=body.subject,
            body=body.body,
            status=body.status,
        )
    except ValueError as exc:
        msg = str(exc).lower()
        if "not found" in msg:
            raise HTTPException(404, str(exc)) from exc
        raise HTTPException(400, str(exc)) from exc


@router.get("/communications/{comm_id}/pdf")
async def communications_pdf_download(
    comm_id: str,
    user: JWTUser = Depends(get_current_user),
):
    _require_advisor_access(user)
    try:
        pdf_bytes, title = build_pdf_for_communication(user.id, comm_id)
    except ValueError as exc:
        msg = str(exc).lower()
        if "not found" in msg:
            raise HTTPException(404, str(exc)) from exc
        raise HTTPException(400, str(exc)) from exc
    safe = "".join(c if c.isalnum() or c in "._-" else "_" for c in title)[:80]
    fname = f"{safe or 'client-summary'}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


# ── Client book ───────────────────────────────────────────────────────────────


def _enriched_client_rows(
    advisor_id: str,
    risk: str | None,
    overdue: bool | None,
    bias: str | None,
) -> list[dict[str, Any]]:
    c_res = (
        supabase.table("advisor_clients")
        .select("*")
        .eq("advisor_id", advisor_id)
        .execute()
    )
    clients = list(c_res.data or [])
    if not clients:
        return []

    ids = [str(x["id"]) for x in clients]
    cp_res = (
        supabase.table("client_portfolios")
        .select("*")
        .eq("advisor_id", advisor_id)
        .in_("client_id", ids)
        .execute()
    )
    cps = list(cp_res.data or [])
    cp_ids = [str(x["id"]) for x in cps]
    cp_to_client = {str(x["id"]): str(x["client_id"]) for x in cps}

    snaps_by_cp: dict[str, list[dict[str, Any]]] = {cid: [] for cid in cp_ids}
    if cp_ids:
        snap_res = (
            supabase.table("dna_score_snapshots")
            .select("client_portfolio_id, dna_score, detail, created_at")
            .in_("client_portfolio_id", cp_ids)
            .order("created_at", desc=True)
            .limit(1200)
            .execute()
        )
        for s in snap_res.data or []:
            cid = str(s.get("client_portfolio_id") or "")
            if cid in snaps_by_cp:
                snaps_by_cp[cid].append(s)

    alerts_res = (
        supabase.table("behavioral_alerts")
        .select("*")
        .eq("advisor_id", advisor_id)
        .order("created_at", desc=True)
        .limit(500)
        .execute()
    )
    alert_by_client: dict[str, dict[str, Any]] = {}
    for a in alerts_res.data or []:
        cid = str(a.get("client_id") or "")
        if cid and cid not in alert_by_client:
            alert_by_client[cid] = a

    out: list[dict[str, Any]] = []
    now = datetime.now(UTC)
    cutoff = now - timedelta(days=90)

    for cl in clients:
        cid = str(cl["id"])
        latest = alert_by_client.get(cid)
        churn = _severity_to_churn(str((latest or {}).get("severity")))

        series: list[tuple[datetime, int]] = []
        for cp_id, client_uuid in cp_to_client.items():
            if client_uuid != cid:
                continue
            for s in snaps_by_cp.get(cp_id, [])[:5]:
                ds = s.get("dna_score")
                if ds is None:
                    continue
                try:
                    dt = datetime.fromisoformat(
                        str(s.get("created_at")).replace("Z", "+00:00")
                    )
                    series.append((dt, int(ds)))
                except Exception as exc:
                    logger.debug("advisor.book_list.skip_snapshot_ts", error=str(exc))
                    continue
        series.sort(key=lambda x: x[0], reverse=True)
        dna_score = series[0][1] if series else None
        delta: int | None = None
        if len(series) >= 2:
            delta = series[0][1] - series[1][1]

        payload = (latest or {}).get("payload") or {}
        detail_snap = None
        for cp_id, client_uuid in cp_to_client.items():
            if client_uuid == cid and snaps_by_cp.get(cp_id):
                detail_snap = snaps_by_cp[cp_id][0]
                break
        detail = (detail_snap or {}).get("detail") if detail_snap else {}
        if not isinstance(detail, dict):
            detail = {}
        top_bias = (
            _payload_str(payload, "top_bias", "bias_flag")
            or _detail_bias(detail)
            or "—"
        )

        meta = cl.get("metadata") or {}
        if not isinstance(meta, dict):
            meta = {}
        last_review_at = meta.get("last_review_at")
        overdue_hit = False
        if overdue:
            if not last_review_at:
                overdue_hit = True
            else:
                try:
                    lr_dt = datetime.fromisoformat(
                        str(last_review_at).replace("Z", "+00:00")
                    )
                    overdue_hit = lr_dt < cutoff
                except Exception:
                    overdue_hit = True

        next_action = (
            _payload_str(payload, "recommended_action", "next_action", "action")
            or ((latest or {}).get("body") if latest else None)
            or "—"
        )

        if risk and churn != risk.upper():
            continue
        if overdue is True and not overdue_hit:
            continue
        if bias and bias.lower() not in (top_bias or "").lower():
            continue

        out.append(
            {
                "id": cid,
                "display_name": cl.get("display_name"),
                "email": cl.get("email"),
                "status": cl.get("status"),
                "dna_score": dna_score,
                "score_delta": delta,
                "churn_risk": churn,
                "top_bias": top_bias,
                "last_review_at": last_review_at,
                "next_action": next_action,
                "updated_at": cl.get("updated_at"),
                "primary_portfolio_id": _resolve_primary_portfolio_id(cid, advisor_id),
            }
        )

    def sort_key(row: dict[str, Any]) -> tuple[int, int, str]:
        churn = CHURN_ORDER.get(str(row.get("churn_risk")), 9)
        sd = row.get("score_delta")
        # biggest drops first: more negative delta sorts earlier; missing delta last
        tie = sd if isinstance(sd, int) else 999
        return (churn, tie, str(row.get("id")))

    out.sort(key=sort_key)
    return out


@router.get("/clients")
async def list_clients(
    user: JWTUser = Depends(get_current_user),
    risk: str | None = Query(None, description="HIGH, MEDIUM, or LOW"),
    overdue: bool | None = Query(None),
    bias: str | None = Query(None),
):
    _require_advisor_access(user)
    try:
        rows = _enriched_client_rows(user.id, risk, overdue, bias)
        return {"clients": rows}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Could not fetch clients: {e}") from e


@router.post("/clients", status_code=201)
async def add_client(
    body: ClientPortfolioRequest, user: JWTUser = Depends(get_current_user)
):
    _require_advisor_access(user)

    display = (body.client_name or body.name or "").strip()
    if not display:
        raise HTTPException(400, "client_name or name is required.")

    try:
        ac_row = {
            "advisor_id": user.id,
            "display_name": display,
            "email": (body.client_email or "").strip() or None,
            "notes": body.notes,
            "metadata": {},
        }
        ac_ins = supabase.table("advisor_clients").insert(ac_row).execute()
        ac = (ac_ins.data or [None])[0]
        if not ac:
            raise HTTPException(500, "Insert advisor_clients returned no row.")
        client_id = str(ac["id"])

        port_payload: dict[str, Any] = {
            "advisor_id": user.id,
            "name": f"{display} — client book",
            "total_value": body.total_value,
            "client_name": display,
        }
        if body.client_email:
            port_payload["client_email"] = body.client_email
        if body.notes:
            port_payload["notes"] = body.notes

        p_ins = supabase.table("portfolios").insert(port_payload).execute()
        port = (p_ins.data or [None])[0]
        portfolio_id = str(port["id"]) if port else None

        supabase.table("client_portfolios").insert(
            {
                "advisor_id": user.id,
                "client_id": client_id,
                "name": "Primary",
                "base_portfolio_id": portfolio_id,
            }
        ).execute()

        return {
            **ac,
            "primary_portfolio_id": portfolio_id,
            "id": client_id,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Could not add client: {e}") from e


@router.get("/clients/{client_id}")
async def get_client_detail(client_id: str, user: JWTUser = Depends(get_current_user)):
    _require_advisor_access(user)
    try:
        c_res = (
            supabase.table("advisor_clients")
            .select("*")
            .eq("id", client_id)
            .eq("advisor_id", user.id)
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(404, "Client not found.") from None

    cl = c_res.data
    if not cl:
        raise HTTPException(404, "Client not found.")

    cps = (
        supabase.table("client_portfolios")
        .select("*")
        .eq("client_id", client_id)
        .eq("advisor_id", user.id)
        .execute()
    ).data or []

    meetings = (
        supabase.table("client_meetings")
        .select("*")
        .eq("client_id", client_id)
        .eq("advisor_id", user.id)
        .order("scheduled_at", desc=False)
        .limit(40)
        .execute()
    ).data or []

    comms = (
        supabase.table("client_communications")
        .select("*")
        .eq("client_id", client_id)
        .eq("advisor_id", user.id)
        .order("occurred_at", desc=True)
        .limit(50)
        .execute()
    ).data or []

    alerts = (
        supabase.table("behavioral_alerts")
        .select("*")
        .eq("client_id", client_id)
        .eq("advisor_id", user.id)
        .order("created_at", desc=True)
        .limit(40)
        .execute()
    ).data or []

    primary_portfolio_id = _resolve_primary_portfolio_id(client_id, user.id)

    latest_dna: dict[str, Any] | None = None
    if primary_portfolio_id:
        try:
            dr = (
                supabase.table("dna_scores")
                .select(
                    "id, dna_score, investor_type, recommendation, strengths, weaknesses, "
                    "total_value, created_at, weighted_beta"
                )
                .eq("portfolio_id", primary_portfolio_id)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            latest_dna = dr.data[0] if dr.data else None
        except Exception:
            latest_dna = None

    return {
        "client": cl,
        "portfolios": cps,
        "primary_portfolio_id": primary_portfolio_id,
        "latest_dna": latest_dna,
        "meetings": meetings,
        "communications": comms,
        "alerts": alerts,
    }


@router.patch("/clients/{client_id}")
async def patch_client(
    client_id: str,
    body: AdvisorClientUpdate,
    user: JWTUser = Depends(get_current_user),
):
    _require_advisor_access(user)
    updates: dict[str, Any] = {}
    for field in (
        "display_name",
        "email",
        "notes",
        "company",
        "phone",
        "status",
    ):
        v = getattr(body, field, None)
        if v is not None:
            updates[field] = v
    if body.metadata is not None:
        updates["metadata"] = body.metadata

    if not updates:
        raise HTTPException(400, "No fields to update.")

    try:
        res = (
            supabase.table("advisor_clients")
            .update(updates)
            .eq("id", client_id)
            .eq("advisor_id", user.id)
            .execute()
        )
        row = (res.data or [None])[0]
        if not row:
            raise HTTPException(404, "Client not found.")
        return row
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Could not update client: {e}") from e


@router.delete("/clients/{client_id}", status_code=204)
async def delete_client(client_id: str, user: JWTUser = Depends(get_current_user)):
    _require_advisor_access(user)
    try:
        res = (
            supabase.table("advisor_clients")
            .delete()
            .eq("id", client_id)
            .eq("advisor_id", user.id)
            .execute()
        )
        if not res.data:
            raise HTTPException(404, "Client not found.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Could not delete client: {e}") from e


@router.get("/clients/{client_id}/timeline")
async def client_timeline(client_id: str, user: JWTUser = Depends(get_current_user)):
    _require_advisor_access(user)

    try:
        chk = (
            supabase.table("advisor_clients")
            .select("id")
            .eq("id", client_id)
            .eq("advisor_id", user.id)
            .single()
            .execute()
        )
        if not chk.data:
            raise HTTPException(404, "Client not found.")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(404, "Client not found.") from None

    cps = (
        supabase.table("client_portfolios")
        .select("id")
        .eq("client_id", client_id)
        .eq("advisor_id", user.id)
        .execute()
    ).data or []
    cp_ids = [str(x["id"]) for x in cps]

    dna_snaps: list[dict[str, Any]] = []
    port_snaps: list[dict[str, Any]] = []
    if cp_ids:
        dna_snaps = (
            supabase.table("dna_score_snapshots")
            .select("*")
            .in_("client_portfolio_id", cp_ids)
            .eq("advisor_id", user.id)
            .order("created_at", desc=True)
            .limit(200)
            .execute()
        ).data or []

        port_snaps = (
            supabase.table("portfolio_snapshots")
            .select("*")
            .in_("client_portfolio_id", cp_ids)
            .eq("advisor_id", user.id)
            .order("as_of", desc=True)
            .limit(200)
            .execute()
        ).data or []

    return {
        "dna_snapshots": dna_snaps,
        "portfolio_snapshots": port_snaps,
    }


@router.get("/clients/{client_id}/analysis")
async def get_client_analysis(
    client_id: str, user: JWTUser = Depends(get_current_user)
):
    _require_advisor_access(user)

    portfolio_id = _resolve_primary_portfolio_id(client_id, user.id)
    if portfolio_id:
        pdata = _assert_portfolio_access(portfolio_id, user.id)
    else:
        try:
            pdata = _assert_portfolio_access(client_id, user.id)
            portfolio_id = str(pdata["id"])
        except HTTPException:
            book = (
                supabase.table("advisor_clients")
                .select("id")
                .eq("id", client_id)
                .eq("advisor_id", user.id)
                .limit(1)
                .execute()
            )
            if book.data:
                raise HTTPException(
                    404,
                    "No linked portfolio for this client yet — add holdings or upload a portfolio.",
                ) from None
            raise HTTPException(404, "Client portfolio not found.") from None

    try:
        analysis_result = (
            supabase.table("dna_scores")
            .select(
                "id, dna_score, investor_type, recommendation, "
                "strengths, weaknesses, total_value, created_at"
            )
            .eq("portfolio_id", portfolio_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        analysis = analysis_result.data[0] if analysis_result.data else None
        return {
            "portfolio": pdata,
            "latest_analysis": analysis,
            "resolved_portfolio_id": portfolio_id,
        }
    except Exception as e:
        raise HTTPException(500, f"Could not fetch analysis: {e}") from e


@router.get("/clients/{client_id}/reports")
async def list_client_reports(
    client_id: str, user: JWTUser = Depends(get_current_user)
):
    _require_advisor_access(user)

    portfolio_id = _resolve_primary_portfolio_id(client_id, user.id)
    if not portfolio_id:
        try:
            pdata = _assert_portfolio_access(client_id, user.id)
            portfolio_id = str(pdata["id"])
        except HTTPException:
            raise HTTPException(404, "Client portfolio not found.") from None
    else:
        _assert_portfolio_access(portfolio_id, user.id)

    try:
        reports_result = (
            supabase.table("advisor_reports")
            .select("id, is_paid, pdf_url, created_at")
            .eq("portfolio_id", portfolio_id)
            .order("created_at", desc=True)
            .execute()
        )
        return {"reports": reports_result.data or []}
    except Exception as e:
        raise HTTPException(500, f"Could not fetch reports: {e}") from e


@router.post("/reports/batch")
async def generate_batch_reports(
    body: BatchReportRequest, user: JWTUser = Depends(get_current_user)
):
    """
    Queue report generation for multiple clients.
    Each report is inserted as is_paid=True (covered by advisor subscription).
    Maximum 50 clients per request.
    `client_ids` are **portfolio** UUIDs (legacy batch API).
    """
    _require_advisor_access(user)

    if not body.client_ids:
        raise HTTPException(400, "client_ids must not be empty.")
    if len(body.client_ids) > 50:
        raise HTTPException(400, "Maximum 50 clients per batch request.")

    results = []
    for portfolio_id in body.client_ids:
        try:
            _assert_portfolio_access(portfolio_id, user.id)

            report_result = (
                supabase.table("advisor_reports")
                .insert(
                    {
                        "portfolio_id": portfolio_id,
                        "advisor_id": user.id,
                        "is_paid": True,
                    }
                )
                .execute()
            )
            report_id = report_result.data[0]["id"] if report_result.data else None
            results.append(
                {
                    "client_id": portfolio_id,
                    "status": "queued",
                    "report_id": report_id,
                }
            )
            logger.info(
                "advisor.batch_report_queued",
                advisor_id=user.id,
                client_id=portfolio_id,
                report_id=report_id,
            )
        except HTTPException as he:
            if he.status_code == 403:
                results.append({"client_id": portfolio_id, "status": "forbidden"})
            else:
                results.append(
                    {
                        "client_id": portfolio_id,
                        "status": "error",
                        "error": str(he.detail),
                    }
                )
        except Exception as e:
            results.append(
                {"client_id": portfolio_id, "status": "error", "error": str(e)}
            )

    queued = sum(1 for r in results if r["status"] == "queued")
    return {
        "batch_results": results,
        "total": len(body.client_ids),
        "queued": queued,
    }
