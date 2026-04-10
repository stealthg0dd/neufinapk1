# RUN IN SUPABASE SQL EDITOR (see services/analytics.py for actual column names):
#
# CREATE TABLE IF NOT EXISTS analytics_events (
#   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
#   event_name TEXT NOT NULL,
#   user_id UUID,
#   session_id TEXT,
#   properties JSONB DEFAULT '{}',
#   created_at TIMESTAMPTZ DEFAULT NOW()
# );
# CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON analytics_events(user_id);
# CREATE INDEX IF NOT EXISTS idx_analytics_events_name ON analytics_events(event_name);

import base64
import datetime
import traceback
import uuid

import stripe
import structlog
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse, Response
from pydantic import BaseModel

from config import APP_BASE_URL, STRIPE_PRICE_ADVISOR_REPORT_ONETIME, STRIPE_SECRET_KEY
from database import supabase
from services.auth_dependency import (
    get_current_user,
    get_subscription_status,
    require_active_subscription,
)
from services.calculator import calculate_portfolio_metrics
from services.jwt_auth import JWTUser
from services.pdf_generator import generate_advisor_report

router = APIRouter(prefix="/api/reports", tags=["reports"])

logger = structlog.get_logger("neufin.reports")
stripe.api_key = STRIPE_SECRET_KEY


async def can_download_report_free(user_id: str) -> bool:
    """
    Free report downloads:
      - Active 14-day trial (treated as Advisor tier)
      - Paid Advisor/Enterprise subscription_status == active (subscription_tier set by webhook)
    """
    sub = get_subscription_status(user_id)
    if sub.get("status") == "trial":
        return True
    if sub.get("status") == "active":
        tier = str(sub.get("tier") or "").lower()
        return tier in ("advisor", "enterprise")
    return False


class ColorScheme(BaseModel):
    primary: str = "#0B0F14"
    secondary: str = "#161D2E"
    accent: str = "#1EB8CC"


class ReportRequest(BaseModel):
    portfolio_id: str
    advisor_id: str
    advisor_name: str = "NeuFin Intelligence"
    logo_base64: str | None = None
    color_scheme: ColorScheme | None = None
    client_name: str = "Confidential"
    firm_name: str = ""
    advisor_logo_url: str | None = None
    advisor_email: str = "info@neufin.ai"
    white_label: bool = False
    # When True, response is raw PDF bytes (media_type application/pdf) instead of JSON metadata.
    inline_pdf: bool = False


def _positions_from_dna_row(dna: dict | None) -> list[dict]:
    """Best-effort rows for calculator when portfolio_positions is empty."""
    if not dna:
        return []
    syms = dna.get("symbols") or dna.get("tickers")
    wts = dna.get("weights")
    if (
        isinstance(syms, list)
        and isinstance(wts, list)
        and len(syms) == len(wts)
        and len(syms) > 0
    ):
        out = []
        for s, w in zip(syms, wts):
            try:
                wf = float(w)
            except (TypeError, ValueError):
                wf = 0.0
            out.append({"symbol": str(s).upper(), "shares": 1.0, "weight": wf})
        return out
    return []


def _synthesis_payload(dna: dict | None, metrics: dict, swarm_row: dict | None) -> dict:
    """Client-facing summary from DNA + metrics + swarm (no LLM)."""
    dna = dna or {}
    s = swarm_row or {}
    action_plan = s.get("action_plan")
    if not isinstance(action_plan, list):
        action_plan = []
    return {
        "dna_score": dna.get("dna_score") or metrics.get("dna_score"),
        "investor_type": dna.get("investor_type"),
        "strengths": list(dna.get("strengths") or []),
        "weaknesses": list(dna.get("weaknesses") or []),
        "recommendation": dna.get("recommendation"),
        "risk_assessment": s.get("risk_sentinel"),
        "market_outlook": s.get("regime"),
        "action_items": action_plan,
        "swarm_headline": s.get("headline"),
    }


def _upload_to_storage(pdf_bytes: bytes, filename: str) -> str | None:
    """Upload PDF to Supabase Storage 'advisor-reports' bucket.
    Returns a 1-hour signed URL (falls back to public URL if signing fails)."""
    try:
        path = f"{datetime.datetime.utcnow().strftime('%Y/%m/%d')}/{filename}"
        supabase.storage.from_("advisor-reports").upload(
            path=path,
            file=pdf_bytes,
            file_options={"content-type": "application/pdf"},
        )
        # Prefer a signed URL so the bucket can remain private
        try:
            signed = supabase.storage.from_("advisor-reports").create_signed_url(
                path, 3600
            )
            url = signed.get("signedURL") or signed.get("signedUrl")
            if url:
                return url
        except Exception:  # noqa: S110 — fall through to public URL
            pass
    except Exception as e:
        logger.warning("reports.storage_upload_failed", error=str(e))
        return None


def _load_report_for_advisor(report_id: str, user: JWTUser) -> dict:
    try:
        record = (
            supabase.table("advisor_reports")
            .select("id, advisor_id, pdf_url, is_paid, created_at, portfolio_id")
            .eq("id", report_id)
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Report not found.") from None

    data = record.data
    if not data or data.get("advisor_id") != user.id:
        raise HTTPException(status_code=404, detail="Report not found.")

    return data


@router.post("/generate")
async def generate_report(
    body: ReportRequest, user: JWTUser = Depends(get_current_user)
):
    """
    Generate a 10-page IC PDF from portfolio metrics, DNA scores, and latest swarm output.
    No extra LLM calls — formatting and synthesis only.

    Set ``inline_pdf: true`` to receive ``Response(content=pdf_bytes, media_type="application/pdf")``
    instead of JSON (optional ``X-Report-Id``, ``X-PDF-URL`` headers when available).
    """
    try:
        # Gate: trial/paid advisor/enterprise generate directly; otherwise return checkout URL
        if not await can_download_report_free(user.id):
            if not STRIPE_PRICE_ADVISOR_REPORT_ONETIME:
                raise HTTPException(
                    503, "Stripe single-report price is not configured."
                )
            try:
                session = stripe.checkout.Session.create(
                    line_items=[
                        {"price": STRIPE_PRICE_ADVISOR_REPORT_ONETIME, "quantity": 1}
                    ],
                    mode="payment",
                    success_url=f"{APP_BASE_URL}/pricing/success",
                    cancel_url=f"{APP_BASE_URL}/pricing",
                    metadata={
                        "plan": "single",
                        "portfolio_id": body.portfolio_id,
                        "advisor_id": user.id,
                        "user_id": user.id,
                    },
                )
                return {"checkout_url": session.url}
            except stripe.StripeError as e:
                raise HTTPException(502, f"Stripe error: {e.user_message}") from e

        try:
            portfolio_result = (
                supabase.table("portfolios")
                .select("id, user_id, name, total_value")
                .eq("id", body.portfolio_id)
                .single()
                .execute()
            )
            portfolio = portfolio_result.data
            if not portfolio:
                raise HTTPException(status_code=404, detail="Portfolio not found.")
            if portfolio.get("user_id") and portfolio.get("user_id") != user.id:
                raise HTTPException(
                    status_code=403, detail="You do not have access to this portfolio."
                )

            dna_result = (
                supabase.table("dna_scores")
                .select("*")
                .eq("portfolio_id", body.portfolio_id)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            existing_dna = dna_result.data[0] if dna_result.data else None

            positions_result = (
                supabase.table("portfolio_positions")
                .select("symbol, shares, cost_basis")
                .eq("portfolio_id", body.portfolio_id)
                .execute()
            )

            swarm_result = (
                supabase.table("swarm_reports")
                .select("*")
                .eq("user_id", user.id)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            swarm_row = swarm_result.data[0] if swarm_result.data else None

            profile_result = (
                supabase.table("user_profiles")
                .select("display_name, email, avatar_url")
                .eq("id", user.id)
                .limit(1)
                .execute()
            )
            profile = (profile_result.data or [None])[0] or {}
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e)) from e

        positions_raw = list(positions_result.data or [])
        if not positions_raw:
            positions_raw = _positions_from_dna_row(existing_dna)

        if not positions_raw:
            raise HTTPException(
                status_code=404,
                detail="No positions found for this portfolio.",
            )

        try:
            metrics = calculate_portfolio_metrics(positions_raw)
        except Exception as e:
            raise HTTPException(status_code=422, detail=str(e)) from e

        run_id = uuid.uuid4().hex[:8]
        brand = body.color_scheme.model_dump() if body.color_scheme else None
        advisor_config = {
            "firm_name": body.firm_name or profile.get("display_name") or "",
            "logo_url": body.advisor_logo_url or profile.get("avatar_url"),
            "logo_base64": body.logo_base64,
            "brand_colors": brand,
            "advisor_name": body.advisor_name,
            "client_name": body.client_name,
            "advisor_email": body.advisor_email
            or profile.get("email")
            or "info@neufin.ai",
            "white_label": body.white_label,
            "report_run_id": run_id,
        }

        portfolio_payload = {
            "name": portfolio.get("name") or "Portfolio Analysis",
            "total_value": float(
                portfolio.get("total_value") or metrics.get("total_value") or 0
            ),
            "metrics": metrics,
        }

        pdf_bytes = await generate_advisor_report(
            portfolio_payload,
            existing_dna or {},
            swarm_row,
            advisor_config,
        )

        filename = f"report-{body.portfolio_id[:8]}-{uuid.uuid4().hex[:6]}.pdf"
        pdf_url = _upload_to_storage(pdf_bytes, filename)

        try:
            report_result = (
                supabase.table("advisor_reports")
                .insert(
                    {
                        "portfolio_id": body.portfolio_id,
                        "advisor_id": user.id,
                        "pdf_url": pdf_url,
                        "is_paid": False,
                    }
                )
                .execute()
            )
            report_id = report_result.data[0]["id"] if report_result.data else None
        except Exception as e:
            logger.warning("reports.save_record_failed", error=str(e))
            report_id = None

        analysis = _synthesis_payload(existing_dna, metrics, swarm_row)

        if body.inline_pdf:
            headers = {
                "Content-Disposition": f'inline; filename="{filename}"',
            }
            if report_id:
                headers["X-Report-Id"] = str(report_id)
            if pdf_url:
                headers["X-PDF-URL"] = pdf_url
            return Response(
                content=pdf_bytes,
                media_type="application/pdf",
                headers=headers,
            )

        out: dict = {
            "report_id": report_id,
            "pdf_size_bytes": len(pdf_bytes),
            "analysis": analysis,
            "pages": 10,
        }
        if pdf_url:
            out["pdf_url"] = pdf_url
            out["delivery"] = "url"
        else:
            out["pdf_base64"] = base64.b64encode(pdf_bytes).decode("ascii")
            out["delivery"] = "base64"
            out["filename"] = filename
        return out

    except HTTPException:
        raise
    except Exception as e:
        tb = traceback.format_exc()
        logger.error(
            "report_generation_failed",
            error=str(e),
            traceback=tb,
            portfolio_id=getattr(body, "portfolio_id", "unknown"),
            user_id=str(user.id) if user else "unknown",
        )
        raise HTTPException(
            status_code=500,
            detail=f"Report generation failed: {e!s}",
        ) from e


@router.get("/{report_id}/download")
async def download_report(
    report_id: str, user: JWTUser = Depends(require_active_subscription)
):
    """Redirect to the Supabase Storage public URL for this report."""
    record = _load_report_for_advisor(report_id, user)
    pdf_url = record.get("pdf_url")
    if not pdf_url:
        raise HTTPException(
            status_code=404, detail="PDF not yet available for this report."
        )

    return RedirectResponse(url=pdf_url)


@router.get("/advisor/{advisor_id}")
async def get_advisor_reports(
    advisor_id: str, user: JWTUser = Depends(get_current_user)
):
    """List all reports generated by an advisor, including public PDF URLs."""
    if advisor_id != user.id:
        raise HTTPException(
            status_code=403, detail="You do not have access to these reports."
        )

    try:
        result = (
            supabase.table("advisor_reports")
            .select("id, portfolio_id, pdf_url, is_paid, created_at")
            .eq("advisor_id", user.id)
            .order("created_at", desc=True)
            .execute()
        )
        return {"reports": result.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
