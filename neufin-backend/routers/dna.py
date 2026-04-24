from __future__ import annotations

import asyncio
import io
import json
import time
import uuid
from typing import Any

import pandas as pd
import structlog
from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field

from config import APP_BASE_URL
from core.config import settings
from database import supabase
from services.ai_router import get_ai_analysis
from services.calculator import calculate_portfolio_metrics, compute_churn_risk
from services.portfolio_region import dna_archetype_overlay
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
            f"forecast_outputs: {quant_result.get('forecast_outputs') or quant_result.get('forecast')}\n"
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

    applied_modifier = 0.0
    if quant_result:
        try:
            applied_modifier = max(
                -15.0,
                min(15.0, float(quant_result.get("composite_dna_modifier") or 0.0)),
            )
        except (TypeError, ValueError):
            applied_modifier = 0.0

    try:
        base_dna_score = float(analysis.get("dna_score"))
    except (TypeError, ValueError, AttributeError):
        raise HTTPException(
            status_code=502, detail="AI DNA score response was invalid."
        ) from None

    final_dna_score = round(max(0.0, min(100.0, base_dna_score + applied_modifier)))
    analysis["dna_score"] = final_dna_score
    analysis["investor_type"] = dna_archetype_overlay(
        metrics.get("positions") or positions,
        str(analysis.get("investor_type") or "Balanced Growth Investor"),
    )

    # Churn risk uses HHI + biases from metrics + regime from quant
    churn_input = {
        "hhi": metrics.get("hhi", 0),
        "structural_biases": metrics.get("structural_biases") or [],
        "regime_label": (quant_result or {}).get("regime_context", {}).get("regime")
        if quant_result
        else None,
    }
    churn = compute_churn_risk(churn_input)
    analysis.update(churn)

    share_token = str(uuid.uuid4())[:8]

    try:
        result = (
            supabase.table("dna_scores")
            .insert(
                {
                    "dna_score": final_dna_score,
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
        "composite_dna_modifier_applied": applied_modifier,
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


# ── Batch Portfolio Analysis ───────────────────────────────────────────────────

_BATCH_MAX_SIZE = 1000
_BATCH_RATE_LIMIT: dict[str, float] = {}  # api_key → last_batch_ts
_BATCH_RATE_WINDOW = 60.0  # 1 batch per minute per key

# In-process fallback store (Redis is primary when REDIS_URL is set)
_batch_store: dict[str, dict[str, Any]] = {}

_BATCH_REDIS_TTL = 3600  # 1 hour


def _get_batch_redis():
    """Return a Redis client if configured, else None."""
    url = getattr(settings, "REDIS_URL", "") or ""
    if not url:
        return None
    try:
        import redis as _redis_lib

        r = _redis_lib.from_url(url, decode_responses=True, socket_connect_timeout=2)
        r.ping()
        return r
    except Exception:
        return None


def _batch_set(batch_id: str, data: dict) -> None:
    r = _get_batch_redis()
    serialised = json.dumps(data)
    if r:
        r.setex(f"neufin:batch:{batch_id}", _BATCH_REDIS_TTL, serialised)
    _batch_store[batch_id] = data


def _batch_get(batch_id: str) -> dict | None:
    r = _get_batch_redis()
    if r:
        raw = r.get(f"neufin:batch:{batch_id}")
        if raw:
            return json.loads(raw)
    return _batch_store.get(batch_id)


class BatchPosition(BaseModel):
    symbol: str
    shares: float
    cost_basis: float | None = None


class BatchPortfolioItem(BaseModel):
    portfolio_id: str
    positions: list[BatchPosition]


class BatchRequest(BaseModel):
    portfolios: list[BatchPortfolioItem] = Field(..., max_length=_BATCH_MAX_SIZE)
    market_code: str = "US"
    include_churn_risk: bool = True
    api_key: str | None = None


async def _process_single(item: BatchPortfolioItem, include_churn: bool) -> dict:
    """Compute DNA metrics for one portfolio item in the batch."""
    try:
        positions = [p.model_dump() for p in item.positions]
        metrics = calculate_portfolio_metrics(positions)
        result: dict[str, Any] = {
            "portfolio_id": item.portfolio_id,
            "status": "ok",
            "dna_score": metrics.get("dna_score"),
            "hhi": metrics.get("hhi"),
            "weighted_beta": metrics.get("weighted_beta"),
            "num_positions": metrics.get("num_positions"),
            "total_value": metrics.get("total_value"),
        }
        if include_churn:
            churn = compute_churn_risk(
                {"hhi": metrics.get("hhi", 0), "structural_biases": []}
            )
            result.update(churn)
        return result
    except Exception as exc:
        return {
            "portfolio_id": item.portfolio_id,
            "status": "error",
            "error": str(exc),
        }


async def _run_batch(batch_id: str, req: BatchRequest) -> None:
    """Background task: process all portfolios, update state as results arrive."""
    total = len(req.portfolios)
    completed = 0
    results: list[dict] = []

    _batch_set(
        batch_id,
        {
            "batch_id": batch_id,
            "status": "processing",
            "total": total,
            "completed": 0,
            "results": [],
        },
    )

    # Process in chunks of 50 to avoid overwhelming the price feed
    chunk_size = 50
    for i in range(0, total, chunk_size):
        chunk = req.portfolios[i : i + chunk_size]
        chunk_results = await asyncio.gather(
            *[_process_single(item, req.include_churn_risk) for item in chunk],
            return_exceptions=False,
        )
        results.extend(chunk_results)
        completed += len(chunk)
        _batch_set(
            batch_id,
            {
                "batch_id": batch_id,
                "status": "processing" if completed < total else "complete",
                "total": total,
                "completed": completed,
                "results": results,
            },
        )
        # Brief yield to avoid starving other requests
        await asyncio.sleep(0)

    _batch_set(
        batch_id,
        {
            "batch_id": batch_id,
            "status": "complete",
            "total": total,
            "completed": total,
            "results": results,
        },
    )


@router.post("/batch")
async def submit_batch(req: BatchRequest):
    """
    Submit up to 1000 portfolios for async DNA analysis.
    Requires enterprise API key. Rate limit: 1 batch/minute per key.
    Returns a batch_id for polling status and results.
    """
    api_key = req.api_key or ""
    if not api_key:
        raise HTTPException(status_code=401, detail="api_key is required for batch analysis.")

    # Rate limit: 1 batch per 60s per API key
    now = time.monotonic()
    last = _BATCH_RATE_LIMIT.get(api_key, 0.0)
    if now - last < _BATCH_RATE_WINDOW:
        retry_after = int(_BATCH_RATE_WINDOW - (now - last)) + 1
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit: 1 batch per minute. Retry after {retry_after}s.",
        )
    _BATCH_RATE_LIMIT[api_key] = now

    if len(req.portfolios) > _BATCH_MAX_SIZE:
        raise HTTPException(
            status_code=422,
            detail=f"Maximum batch size is {_BATCH_MAX_SIZE} portfolios.",
        )
    if not req.portfolios:
        raise HTTPException(status_code=422, detail="portfolios array cannot be empty.")

    batch_id = f"batch_{uuid.uuid4().hex[:12]}"
    estimated_seconds = max(5, len(req.portfolios) // 20)

    # Fire-and-forget background processing
    asyncio.create_task(_run_batch(batch_id, req))

    return {
        "batch_id": batch_id,
        "total": len(req.portfolios),
        "estimated_seconds": estimated_seconds,
        "status_url": f"/api/dna/batch/{batch_id}/status",
        "results_url": f"/api/dna/batch/{batch_id}/results",
    }


@router.get("/batch/{batch_id}/status")
async def get_batch_status(batch_id: str):
    """Poll batch processing progress. Returns completed count and current status."""
    state = _batch_get(batch_id)
    if not state:
        raise HTTPException(status_code=404, detail="Batch not found.")
    return {
        "batch_id": batch_id,
        "status": state.get("status", "unknown"),
        "total": state.get("total", 0),
        "completed": state.get("completed", 0),
        "pct_complete": round(
            state.get("completed", 0) / max(state.get("total", 1), 1) * 100, 1
        ),
    }


@router.get("/batch/{batch_id}/results")
async def get_batch_results(
    batch_id: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
):
    """
    Retrieve full batch results (paginated).
    Available as soon as status == 'complete'.
    """
    state = _batch_get(batch_id)
    if not state:
        raise HTTPException(status_code=404, detail="Batch not found.")
    if state.get("status") != "complete":
        raise HTTPException(
            status_code=202,
            detail=f"Batch still processing ({state.get('completed', 0)}/{state.get('total', 0)} complete).",
        )
    results: list[dict] = state.get("results") or []
    page = results[offset : offset + limit]
    return {
        "batch_id": batch_id,
        "total": len(results),
        "offset": offset,
        "limit": limit,
        "results": page,
    }
