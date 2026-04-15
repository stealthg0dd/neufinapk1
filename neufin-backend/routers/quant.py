"""Quant analysis — financial objective composition (no raw model names in HTTP contracts)."""

from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database import supabase
from services.auth_dependency import get_current_user
from services.quant_model_engine import analyze_financial_modes

logger = structlog.get_logger("neufin.quant_router")

router = APIRouter(prefix="/api/quant", tags=["quant"])


class QuantAnalyzeBody(BaseModel):
    portfolio_id: str = Field(..., description="UUID of portfolio owned by the user")
    financial_modes: list[str] = Field(
        default_factory=list,
        description="Selected objectives: alpha, risk, forecast, macro, allocation, trading, institutional",
    )


@router.post("/analyze")
async def analyze_quant(body: QuantAnalyzeBody, user=Depends(get_current_user)) -> dict:
    uid = getattr(user, "id", None) or getattr(user, "sub", None)
    if not uid:
        raise HTTPException(status_code=401, detail="Unauthorized")

    modes = [m.strip().lower() for m in body.financial_modes if m and str(m).strip()]
    if not modes:
        modes = ["institutional"]

    try:
        port = (
            supabase.table("portfolios")
            .select("id,user_id")
            .eq("id", body.portfolio_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        logger.warning("quant_analyze.portfolio_lookup_failed", error=str(exc))
        raise HTTPException(status_code=503, detail="Database unavailable") from exc

    rows = port.data or []
    if not rows or str(rows[0].get("user_id")) != str(uid):
        raise HTTPException(status_code=404, detail="Portfolio not found")

    try:
        pos_res = (
            supabase.table("portfolio_positions")
            .select("symbol, weight_pct, shares, value")
            .eq("portfolio_id", body.portfolio_id)
            .execute()
        )
    except Exception as exc:
        logger.warning("quant_analyze.positions_failed", error=str(exc))
        raise HTTPException(status_code=503, detail="Could not load positions") from exc

    positions_raw = pos_res.data or []
    total_val = sum(
        float(r.get("value") or 0) for r in positions_raw if r.get("value") is not None
    )
    positions: list[dict] = []
    for r in positions_raw:
        sym = (r.get("symbol") or "").strip()
        if not sym:
            continue
        w = r.get("weight_pct")
        if w is not None:
            positions.append({"symbol": sym, "weight_pct": float(w)})
        elif total_val > 0 and r.get("value") is not None:
            positions.append(
                {"symbol": sym, "weight_pct": float(r["value"]) / total_val * 100.0}
            )
        else:
            positions.append({"symbol": sym, "weight_pct": 0.0})
    # Equal-weight fallback if weights missing
    if positions and sum(p["weight_pct"] for p in positions) < 0.01:
        eq = 100.0 / len(positions)
        for p in positions:
            p["weight_pct"] = eq

    if len(positions) < 1:
        raise HTTPException(status_code=400, detail="Portfolio has no positions")

    try:
        result = await analyze_financial_modes(body.portfolio_id, positions, modes)
    except Exception as exc:
        logger.exception("quant_analyze.engine_failed", error=str(exc))
        raise HTTPException(status_code=500, detail="Analysis failed") from exc

    return {"ok": True, "result": result}
