"""Quant analyze endpoint."""

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
    portfolio_id: str = Field(..., description="Portfolio UUID")
    financial_modes: list[str] = Field(
        default_factory=list,
        description=(
            "Requested quant modes: alpha, risk, macro, forecast, institutional. "
            "Legacy aliases allocation and trading are also accepted."
        ),
    )
    positions: list[dict] = Field(
        default_factory=list,
        description="Optional position payload; falls back to stored portfolio positions when omitted.",
    )


def _normalize_db_positions(rows: list[dict]) -> list[dict]:
    total_val = sum(
        float(row.get("value") or 0) for row in rows if row.get("value") is not None
    )
    positions: list[dict] = []
    for row in rows:
        symbol = str(row.get("symbol") or "").strip()
        if not symbol:
            continue
        weight_pct = row.get("weight_pct")
        if weight_pct is None and row.get("weight") is not None:
            weight_pct = float(row["weight"]) * 100.0
        if weight_pct is None and total_val > 0 and row.get("value") is not None:
            weight_pct = float(row["value"]) / total_val * 100.0
        positions.append(
            {
                "symbol": symbol,
                "weight_pct": float(weight_pct or 0.0),
                "shares": row.get("shares"),
                "value": row.get("value"),
            }
        )
    if positions and sum(float(p["weight_pct"]) for p in positions) < 0.01:
        equal_weight = 100.0 / len(positions)
        for position in positions:
            position["weight_pct"] = equal_weight
    return positions


@router.post("/analyze")
async def analyze_quant(
    body: QuantAnalyzeBody,
    user=Depends(get_current_user),
) -> dict:
    uid = getattr(user, "id", None) or getattr(user, "sub", None)
    if not uid:
        raise HTTPException(status_code=401, detail="Unauthorized")

    requested_modes = [str(mode or "").strip().lower() for mode in body.financial_modes]
    requested_modes = [mode for mode in requested_modes if mode]
    if not requested_modes:
        return {
            "ok": True,
            "skipped": True,
            "reason": "financial_modes not provided",
            "result": None,
        }

    try:
        portfolio = (
            supabase.table("portfolios")
            .select("id,user_id")
            .eq("id", body.portfolio_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        logger.warning("quant_analyze.portfolio_lookup_failed", error=str(exc))
        raise HTTPException(status_code=503, detail="Database unavailable") from exc

    rows = portfolio.data or []
    if not rows or str(rows[0].get("user_id")) != str(uid):
        raise HTTPException(status_code=404, detail="Portfolio not found")

    positions = body.positions or []
    if not positions:
        try:
            pos_res = (
                supabase.table("portfolio_positions")
                .select("symbol, weight, weight_pct, shares, value")
                .eq("portfolio_id", body.portfolio_id)
                .execute()
            )
        except Exception as exc:
            logger.warning("quant_analyze.positions_failed", error=str(exc))
            raise HTTPException(
                status_code=503, detail="Could not load positions"
            ) from exc
        positions = _normalize_db_positions(list(pos_res.data or []))

    if not positions:
        raise HTTPException(status_code=400, detail="Portfolio has no positions")

    try:
        result = await analyze_financial_modes(
            body.portfolio_id, positions, requested_modes
        )
    except Exception as exc:
        logger.exception("quant_analyze.engine_failed", error=str(exc))
        raise HTTPException(status_code=500, detail="Analysis failed") from exc

    return {"ok": True, "skipped": False, "result": result}
