"""
Advisor Multi-Client Dashboard
-------------------------------
Endpoints for financial advisors (advisor / enterprise tier) to manage
client portfolios and generate reports in bulk.

GET  /api/advisor/clients                      → list all managed client portfolios
POST /api/advisor/clients                      → add a client portfolio
GET  /api/advisor/clients/{client_id}/analysis → latest DNA analysis for a client
GET  /api/advisor/clients/{client_id}/reports  → list PDF reports for a client
POST /api/advisor/reports/batch                → queue reports for multiple clients
"""

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import supabase
from services.auth_dependency import get_current_user
from services.jwt_auth import JWTUser

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/advisor", tags=["advisor"])

_ADVISOR_PLANS = {"advisor", "enterprise"}


def _require_advisor_plan(user: JWTUser) -> str:
    """Validate user holds an advisor or enterprise subscription. Returns tier."""
    try:
        result = (
            supabase.table("user_profiles")
            .select("subscription_tier")
            .eq("id", user.id)
            .single()
            .execute()
        )
        tier = (result.data or {}).get("subscription_tier", "free")
    except Exception:
        tier = "free"

    if tier not in _ADVISOR_PLANS:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "plan_required",
                "message": "Advisor plan required to access this feature.",
                "upgrade_url": "/pricing",
                "required_plan": "advisor",
            },
        )
    return tier


# ── Request models ────────────────────────────────────────────────────────────


class ClientPortfolioRequest(BaseModel):
    name: str
    client_name: str | None = None
    client_email: str | None = None
    notes: str | None = None
    total_value: float = 0.0


class BatchReportRequest(BaseModel):
    client_ids: list[str]


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/clients")
async def list_clients(user: JWTUser = Depends(get_current_user)):
    """List all client portfolios managed by the authenticated advisor."""
    _require_advisor_plan(user)
    try:
        result = (
            supabase.table("portfolios")
            .select(
                "id, name, total_value, created_at, advisor_id, client_name, client_email"
            )
            .eq("advisor_id", user.id)
            .order("created_at", desc=True)
            .execute()
        )
        return {"clients": result.data or []}
    except Exception as e:
        raise HTTPException(500, f"Could not fetch clients: {e}") from e


@router.post("/clients", status_code=201)
async def add_client(
    body: ClientPortfolioRequest, user: JWTUser = Depends(get_current_user)
):
    """Add a new client portfolio under this advisor's account."""
    _require_advisor_plan(user)
    try:
        row = {
            "advisor_id": user.id,
            "name": body.name,
            "total_value": body.total_value,
        }
        if body.client_name:
            row["client_name"] = body.client_name
        if body.client_email:
            row["client_email"] = body.client_email
        if body.notes:
            row["notes"] = body.notes

        result = supabase.table("portfolios").insert(row).execute()
        return result.data[0] if result.data else row
    except Exception as e:
        raise HTTPException(500, f"Could not add client: {e}") from e


@router.get("/clients/{client_id}/analysis")
async def get_client_analysis(
    client_id: str, user: JWTUser = Depends(get_current_user)
):
    """Return the latest DNA analysis for a client's portfolio."""
    _require_advisor_plan(user)

    try:
        port_result = (
            supabase.table("portfolios")
            .select("id, advisor_id, name, total_value")
            .eq("id", client_id)
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(404, "Client portfolio not found.") from None

    if (port_result.data or {}).get("advisor_id") != user.id:
        raise HTTPException(403, "Access denied to this client portfolio.")

    try:
        analysis_result = (
            supabase.table("dna_scores")
            .select(
                "id, dna_score, investor_type, recommendation, "
                "strengths, weaknesses, total_value, created_at"
            )
            .eq("portfolio_id", client_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        analysis = analysis_result.data[0] if analysis_result.data else None
        return {
            "portfolio": port_result.data,
            "latest_analysis": analysis,
        }
    except Exception as e:
        raise HTTPException(500, f"Could not fetch analysis: {e}") from e


@router.get("/clients/{client_id}/reports")
async def list_client_reports(
    client_id: str, user: JWTUser = Depends(get_current_user)
):
    """List all reports generated for a client's portfolio."""
    _require_advisor_plan(user)

    try:
        port_result = (
            supabase.table("portfolios")
            .select("id, advisor_id")
            .eq("id", client_id)
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(404, "Client portfolio not found.") from None

    if (port_result.data or {}).get("advisor_id") != user.id:
        raise HTTPException(403, "Access denied to this client portfolio.")

    try:
        reports_result = (
            supabase.table("advisor_reports")
            .select("id, is_paid, pdf_url, created_at")
            .eq("portfolio_id", client_id)
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
    """
    _require_advisor_plan(user)

    if not body.client_ids:
        raise HTTPException(400, "client_ids must not be empty.")
    if len(body.client_ids) > 50:
        raise HTTPException(400, "Maximum 50 clients per batch request.")

    results = []
    for client_id in body.client_ids:
        try:
            port_result = (
                supabase.table("portfolios")
                .select("id, advisor_id")
                .eq("id", client_id)
                .single()
                .execute()
            )
            if (port_result.data or {}).get("advisor_id") != user.id:
                results.append({"client_id": client_id, "status": "forbidden"})
                continue

            report_result = (
                supabase.table("advisor_reports")
                .insert(
                    {
                        "portfolio_id": client_id,
                        "advisor_id": user.id,
                        "is_paid": True,
                    }
                )
                .execute()
            )
            report_id = report_result.data[0]["id"] if report_result.data else None
            results.append(
                {"client_id": client_id, "status": "queued", "report_id": report_id}
            )
            logger.info(
                "advisor.batch_report_queued",
                advisor_id=user.id,
                client_id=client_id,
                report_id=report_id,
            )
        except Exception as e:
            results.append({"client_id": client_id, "status": "error", "error": str(e)})

    queued = sum(1 for r in results if r["status"] == "queued")
    return {
        "batch_results": results,
        "total": len(body.client_ids),
        "queued": queued,
    }
