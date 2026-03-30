from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from typing import Optional
from database import supabase
from services.ai_router import get_ai_analysis
from services.calculator import calculate_portfolio_metrics
from services.pdf_generator import generate_advisor_report
from services.auth_dependency import get_current_user
from services.jwt_auth import JWTUser
import uuid
import datetime

router = APIRouter(prefix="/api/reports", tags=["reports"])


class ColorScheme(BaseModel):
    primary:   str = "#1A56DB"
    secondary: str = "#8B5CF6"
    accent:    str = "#F97316"


class ReportRequest(BaseModel):
    portfolio_id: str
    advisor_id:   str
    advisor_name: str = "Neufin Advisor"
    logo_base64:  Optional[str] = None   # base64-encoded PNG/JPG advisor logo
    color_scheme: Optional[ColorScheme] = None


def _upload_to_storage(pdf_bytes: bytes, filename: str) -> Optional[str]:
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
            signed = supabase.storage.from_("advisor-reports").create_signed_url(path, 3600)
            url = signed.get("signedURL") or signed.get("signedUrl")
            if url:
                return url
        except Exception:
            pass
        return supabase.storage.from_("advisor-reports").get_public_url(path)
    except Exception as e:
        print(f"Supabase Storage upload failed: {e}")
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
        raise HTTPException(status_code=404, detail="Report not found.")

    data = record.data
    if not data or data.get("advisor_id") != user.id:
        raise HTTPException(status_code=404, detail="Report not found.")

    return data


@router.post("/generate")
async def generate_report(body: ReportRequest, user: JWTUser = Depends(get_current_user)):
    """
    Generate a 10-page white-label PDF report with optional advisor logo and color scheme.
    Uploads to Supabase Storage and returns a public URL.
    """
    # 1. Fetch positions
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
            raise HTTPException(status_code=403, detail="You do not have access to this portfolio.")

        positions_result = (
            supabase.table("portfolio_positions")
            .select("symbol, shares, cost_basis")
            .eq("portfolio_id", body.portfolio_id)
            .execute()
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not positions_result.data:
        raise HTTPException(status_code=404, detail="No positions found for this portfolio.")

    # 2. Calculate metrics
    try:
        metrics = calculate_portfolio_metrics(positions_result.data)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

    # 3. Check for existing DNA score
    try:
        dna_result = (
            supabase.table("dna_scores")
            .select("*")
            .eq("portfolio_id", body.portfolio_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        existing_dna = dna_result.data[0] if dna_result.data else None
    except Exception:
        existing_dna = None

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
        raise HTTPException(status_code=503, detail=f"AI analysis failed: {e}")

    # 5. Generate 10-page PDF with custom branding
    try:
        color_dict = body.color_scheme.model_dump() if body.color_scheme else None
        pdf_bytes = generate_advisor_report(
            portfolio_data={"metrics": metrics},
            analysis=analysis,
            advisor_name=body.advisor_name,
            logo_base64=body.logo_base64,
            color_scheme=color_dict,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {e}")

    # 6. Upload to Supabase Storage
    filename = f"report-{body.portfolio_id[:8]}-{uuid.uuid4().hex[:6]}.pdf"
    pdf_url = _upload_to_storage(pdf_bytes, filename)

    # 7. Save report record with public URL
    try:
        report_result = supabase.table("advisor_reports").insert({
            "portfolio_id": body.portfolio_id,
            "advisor_id":   user.id,
            "pdf_url":      pdf_url,
            "is_paid":      False,
        }).execute()
        report_id = report_result.data[0]["id"] if report_result.data else None
    except Exception as e:
        print(f"Failed to save report record: {e}")
        report_id = None

    return {
        "report_id":      report_id,
        "pdf_url":        pdf_url,
        "pdf_size_bytes": len(pdf_bytes),
        "analysis":       analysis,
        "pages":          10,
    }


@router.get("/{report_id}/download")
async def download_report(report_id: str, user: JWTUser = Depends(get_current_user)):
    """Redirect to the Supabase Storage public URL for this report."""
    record = _load_report_for_advisor(report_id, user)
    pdf_url = record.get("pdf_url")
    if not pdf_url:
        raise HTTPException(status_code=404, detail="PDF not yet available for this report.")

    return RedirectResponse(url=pdf_url)


@router.get("/advisor/{advisor_id}")
async def get_advisor_reports(advisor_id: str, user: JWTUser = Depends(get_current_user)):
    """List all reports generated by an advisor, including public PDF URLs."""
    if advisor_id != user.id:
        raise HTTPException(status_code=403, detail="You do not have access to these reports.")

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
        raise HTTPException(status_code=500, detail=str(e))
