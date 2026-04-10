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
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from config import APP_BASE_URL, STRIPE_PRICE_ADVISOR_REPORT_ONETIME, STRIPE_SECRET_KEY
from database import supabase
from services.ai_router import get_ai_analysis
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
    primary: str = "#1A56DB"
    secondary: str = "#8B5CF6"
    accent: str = "#F97316"


class ReportRequest(BaseModel):
    portfolio_id: str
    advisor_id: str
    advisor_name: str = "NeuFin"
    logo_base64: str | None = None  # base64-encoded PNG/JPG advisor logo
    color_scheme: ColorScheme | None = None


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


def _normalize_analysis(raw: dict) -> dict:
    """Coerce AI JSON into shapes safe for ReportLab / metrics display."""

    def _list_str(key: str) -> list[str]:
        v = raw.get(key)
        if v is None:
            return []
        if isinstance(v, list):
            return [str(x) for x in v if x is not None]
        return [str(v)]

    out = dict(raw)
    out["strengths"] = _list_str("strengths")
    out["weaknesses"] = _list_str("weaknesses")
    out["action_items"] = _list_str("action_items")
    ds = out.get("dna_score")
    if ds is not None and not isinstance(ds, int):
        try:
            out["dna_score"] = int(float(ds))
        except (TypeError, ValueError):
            out["dna_score"] = None
    for k in ("risk_assessment", "market_outlook", "recommendation", "investor_type"):
        if out.get(k) is not None:
            out[k] = str(out[k])
    return out


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
    Generate a 10-page white-label PDF report with optional advisor logo and color scheme.
    Uploads to Supabase Storage and returns a public URL.
    """
    try:
        # Gate: trial/paid advisor/enterprise generate directly; otherwise return checkout URL
        if not await can_download_report_free(user.id):
            if not STRIPE_PRICE_ADVISOR_REPORT_ONETIME:
                raise HTTPException(503, "Stripe single-report price is not configured.")
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

        # 1. Fetch portfolio + DNA (DNA used if positions missing)
        try:
            portfolio_result = (
                supabase.table("portfolios")
                .select("id, user_id")
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

        # 2. Calculate metrics
        try:
            metrics = calculate_portfolio_metrics(positions_raw)
        except Exception as e:
            raise HTTPException(status_code=422, detail=str(e)) from e

        # 4. AI deep analysis
        prompt = f"""You are a senior portfolio strategist preparing a professional client report.

Portfolio metrics:
{metrics}

Existing DNA assessment (if any): {existing_dna}

Return ONLY valid JSON:
{{
  "dna_score": <integer 0-100>,
  "investor_type": "<Diversified Strategist | Conviction Growth | Momentum Trader | Defensive Allocator | Speculative Investor>",
  "strengths": ["<strength1>", "<strength2>", "<strength3>"],
  "weaknesses": ["<weakness1>", "<weakness2>"],
  "recommendation": "<one specific, high-impact recommendation>",
  "risk_assessment": "<brief paragraph on overall risk profile>",
  "market_outlook": "<brief paragraph on portfolio positioning vs current market>",
  "action_items": ["<action1>", "<action2>", "<action3>"]
}}

Be specific, data-driven, and professional."""

        try:
            analysis = await get_ai_analysis(prompt)
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"AI analysis failed: {e}") from e

        if not isinstance(analysis, dict):
            analysis = {}
        analysis = _normalize_analysis(analysis)

        portfolio_payload = {
            "metrics": metrics,
            "swarm_data": {},
        }

        # 5. Generate 10-page PDF with custom branding
        color_dict = body.color_scheme.model_dump() if body.color_scheme else None
        pdf_bytes = generate_advisor_report(
            portfolio_data=portfolio_payload,
            analysis=analysis,
            advisor_name=body.advisor_name,
            logo_base64=body.logo_base64,
            color_scheme=color_dict,
        )

        # 6. Upload to Supabase Storage
        filename = f"report-{body.portfolio_id[:8]}-{uuid.uuid4().hex[:6]}.pdf"
        pdf_url = _upload_to_storage(pdf_bytes, filename)

        # 7. Save report record with public URL
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
            detail=f"Report generation failed: {str(e)}",
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
