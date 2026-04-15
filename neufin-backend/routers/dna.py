import io
import json
import time
import uuid

import pandas as pd
import structlog
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from config import APP_BASE_URL
from database import supabase
from services.ai_router import get_ai_analysis
from services.calculator import calculate_portfolio_metrics
from services.quant_model_engine import analyze_financial_modes

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/dna", tags=["dna"])

# ── 5-minute leaderboard cache ────────────────────────────────────────────────
_lb_cache: dict[int, tuple[float, object]] = {}
_LB_TTL = 300


@router.post("/generate")
async def generate_dna_score(
    file: UploadFile = File(...),
    quant_modes: str | None = Form(None),
):
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
        raise HTTPException(
            status_code=400, detail="Could not parse CSV file."
        ) from None

    positions = df.to_dict("records")

    try:
        metrics = calculate_portfolio_metrics(positions)
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    modes = _parse_quant_modes(quant_modes)
    quant_result: dict | None = None
    if modes:
        quant_positions = _to_quant_positions(positions, metrics)
        if quant_positions:
            quant_result = await analyze_financial_modes(
                portfolio_id=f"dna-{uuid.uuid4().hex[:10]}",
                positions=quant_positions,
                modes=modes,
            )

    quant_block = ""
    if quant_result:
        quant_block = (
            "\n\nQuant model overlay (requested modes):\n"
            f"modes: {quant_result.get('modes_requested') or modes}\n"
            f"alpha_score: {quant_result.get('alpha_score')}\n"
            f"risk_adjusted_metrics: {quant_result.get('risk_adjusted_metrics')}\n"
            f"forecast: {quant_result.get('forecast')}\n"
            f"regime_context: {quant_result.get('regime_context')}\n"
            "Blend this into DNA scoring and recommendations."
        )

    prompt = f"""You are a behavioral finance expert analyzing an investor's portfolio.

Portfolio metrics:
{metrics}
{quant_block}

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
        raise HTTPException(status_code=503, detail=f"AI analysis failed: {e}") from e

    share_token = str(uuid.uuid4())[:8]

    try:
        result = (
            supabase.table("dna_scores")
            .insert(
                {
                    "dna_score": analysis["dna_score"],
                    "investor_type": analysis["investor_type"],
                    "strengths": analysis["strengths"],
                    "weaknesses": analysis["weaknesses"],
                    "recommendation": analysis["recommendation"],
                    "share_token": share_token,
                },
                returning="representation",
            )
            .execute()
        )
        record_id = result.data[0]["id"] if result.data else None
    except Exception as e:
        logger.warning("dna.supabase_insert_failed", error=str(e))
        record_id = None

    return {
        **analysis,
        "id": record_id,
        "share_token": share_token,
        "share_url": f"{APP_BASE_URL}/share/{share_token}",
        "metrics": metrics,
        "quant_analysis": quant_result,
        "quant_modes": modes,
    }


def _parse_quant_modes(raw: str | None) -> list[str]:
    if not raw or not raw.strip():
        return []

    allowed = {
        "alpha",
        "risk",
        "forecast",
        "macro",
        "allocation",
        "trading",
        "institutional",
    }

    values: list[str]
    text = raw.strip()
    if text.startswith("["):
        try:
            parsed = json.loads(text)
            if isinstance(parsed, list):
                values = [str(x) for x in parsed]
            else:
                values = [text]
        except Exception:
            values = [text]
    else:
        values = [v.strip() for v in text.split(",")]

    out: list[str] = []
    seen: set[str] = set()
    for mode in values:
        key = mode.lower().strip()
        if not key or key not in allowed or key in seen:
            continue
        seen.add(key)
        out.append(key)
    return out


def _to_quant_positions(positions: list[dict], metrics: dict) -> list[dict]:
    total_value = float(metrics.get("total_value") or 0)
    out: list[dict] = []
    for p in positions:
        sym = str(p.get("symbol") or "").strip().upper()
        if not sym:
            continue
        weight_raw = p.get("weight")
        if weight_raw is None and total_value > 0:
            try:
                weight_raw = float(p.get("value") or 0) / total_value * 100
            except (TypeError, ValueError):
                weight_raw = 0.0
        try:
            w = float(weight_raw or 0)
        except (TypeError, ValueError):
            w = 0.0
        out.append({"symbol": sym, "weight_pct": w})
    return out


@router.get("/share/{token}")
async def get_shared_dna(token: str):
    """Fetch a shared DNA score by token (increments view count)."""
    try:
        result = (
            supabase.table("dna_scores")
            .select("*")
            .eq("share_token", token)
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Share not found.") from None

    record = result.data
    if not record:
        raise HTTPException(status_code=404, detail="Share not found.")

    # Increment view count
    try:
        supabase.table("dna_scores").update(
            {"view_count": (record.get("view_count") or 0) + 1}
        ).eq("share_token", token).execute()
    except Exception:
        logger.warning("Failed to update view count", exc_info=True)

    return record


@router.get("/leaderboard")
async def get_leaderboard(limit: int = 10):
    """Top DNA scores for the public leaderboard. Results cached for 5 minutes."""
    if limit in _lb_cache:
        ts, value = _lb_cache[limit]
        if time.monotonic() - ts < _LB_TTL:
            return value

    try:
        result = (
            supabase.table("dna_scores")
            .select("dna_score, investor_type, share_token, created_at")
            .order("dna_score", desc=True)
            .limit(limit)
            .execute()
        )
        payload = {"leaderboard": result.data}
        _lb_cache[limit] = (time.monotonic(), payload)
        return payload
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
