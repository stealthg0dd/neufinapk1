from fastapi import APIRouter, UploadFile, File, HTTPException
from services.ai_router import get_ai_analysis
from services.calculator import calculate_portfolio_metrics
from database import supabase
import pandas as pd
import uuid
import io
from config import APP_BASE_URL

router = APIRouter(prefix="/api/dna", tags=["dna"])


@router.post("/generate")
async def generate_dna_score(file: UploadFile = File(...)):
    """
    Upload a CSV with columns: symbol, shares[, cost_basis]
    Returns an AI-generated Investor DNA Score + shareable URL.
    """
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported.")

    contents = await file.read()
    try:
        df = pd.read_csv(io.StringIO(contents.decode("utf-8")))
    except Exception:
        raise HTTPException(status_code=400, detail="Could not parse CSV file.")

    positions = df.to_dict("records")

    try:
        metrics = calculate_portfolio_metrics(positions)
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=422, detail=str(e))

    prompt = f"""You are a behavioral finance expert analyzing an investor's portfolio.

Portfolio metrics:
{metrics}

Return ONLY valid JSON (no markdown, no code fences):
{{
  "dna_score": <integer 0-100>,
  "investor_type": "<one of: Diversified Strategist, Conviction Growth, Momentum Trader, Defensive Allocator, Speculative Investor>",
  "strengths": ["<strength1>", "<strength2>", "<strength3>"],
  "weaknesses": ["<weakness1>", "<weakness2>"],
  "recommendation": "<one specific, actionable suggestion>",
  "leaderboard_category": "<one of: Risk Manager, Diversification Expert, Growth Investor, Long-Term Strategist>"
}}

Be engaging, data-driven, and make the insights feel personal and shareable."""

    try:
        analysis = await get_ai_analysis(prompt)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"AI analysis failed: {e}")

    share_token = str(uuid.uuid4())[:8]

    try:
        result = supabase.table("dna_scores").insert({
            "dna_score": analysis["dna_score"],
            "investor_type": analysis["investor_type"],
            "strengths": analysis["strengths"],
            "weaknesses": analysis["weaknesses"],
            "recommendation": analysis["recommendation"],
            "share_token": share_token,
        }).execute()
        record_id = result.data[0]["id"] if result.data else None
    except Exception as e:
        print(f"Supabase insert failed: {e}")
        record_id = None

    return {
        **analysis,
        "id": record_id,
        "share_token": share_token,
        "share_url": f"{APP_BASE_URL}/share/{share_token}",
        "metrics": metrics,
    }


@router.get("/share/{token}")
async def get_shared_dna(token: str):
    """Fetch a shared DNA score by token (increments view count)."""
    try:
        result = supabase.table("dna_scores").select("*").eq("share_token", token).single().execute()
    except Exception:
        raise HTTPException(status_code=404, detail="Share not found.")

    record = result.data
    if not record:
        raise HTTPException(status_code=404, detail="Share not found.")

    # Increment view count
    try:
        supabase.table("dna_scores").update(
            {"view_count": (record.get("view_count") or 0) + 1}
        ).eq("share_token", token).execute()
    except Exception:
        pass

    return record


@router.get("/leaderboard")
async def get_leaderboard(limit: int = 10):
    """Top DNA scores for the public leaderboard."""
    try:
        result = (
            supabase.table("dna_scores")
            .select("dna_score, investor_type, share_token, created_at")
            .order("dna_score", desc=True)
            .limit(limit)
            .execute()
        )
        return {"leaderboard": result.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
