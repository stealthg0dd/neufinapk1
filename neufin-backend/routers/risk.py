"""
Risk analysis router — behavioral drift and cross-portfolio endpoints.

Exposes NeuFin's "financial zero-day" detection capabilities:
- Behavioral drift detection (suitability time-bomb)
- Cross-portfolio concentration analysis (platform silo risk)
"""

from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from services.auth_dependency import get_current_user
from services.behavioral_drift_detector import detect_behavioral_drift
from services.cross_portfolio_analyzer import analyze_cross_portfolio

logger = structlog.get_logger("neufin.risk_router")

router = APIRouter(prefix="/api/risk", tags=["risk"])


# ── Request/Response Models ──────────────────────────────────────────────────


class BehavioralDriftRequest(BaseModel):
    """Request body for behavioral drift analysis."""

    user_id: str | None = Field(
        default=None,
        description="Optional user ID to analyze. Defaults to current user.",
    )
    portfolio_history: list[dict] | None = Field(
        default=None,
        description="Optional portfolio history data. Will fetch from DB if not provided.",
    )
    documented_risk_profile: dict | None = Field(
        default=None,
        description="Optional documented risk profile. Will fetch from DB if not provided.",
    )


class CrossPortfolioRequest(BaseModel):
    """Request body for cross-portfolio analysis."""

    user_id: str | None = Field(
        default=None,
        description="Optional user ID to analyze. Defaults to current user.",
    )
    portfolios: list[dict] | None = Field(
        default=None,
        description="Optional list of portfolios with positions. Will fetch from DB if not provided.",
    )
    market_data: dict | None = Field(
        default=None,
        description="Optional market data for correlation estimation.",
    )


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.get("/behavioral-drift")
async def get_behavioral_drift(
    user=Depends(get_current_user),
) -> dict:
    """
    GET endpoint to detect behavioral drift for the current user.

    Returns analysis of whether the user's actual trading behavior
    has diverged from their documented risk profile.
    """
    uid = getattr(user, "id", None) or getattr(user, "sub", None)
    if not uid:
        raise HTTPException(status_code=401, detail="Unauthorized")

    logger.info("risk.behavioral_drift.get", user_id=uid)

    try:
        result = detect_behavioral_drift(
            user_id=uid,
            portfolio_history=None,
            documented_risk_profile=None,
        )
        return {"ok": True, "result": result}
    except Exception as e:
        logger.error("risk.behavioral_drift.error", error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Behavioral drift analysis failed: {e!s}",
        ) from None


@router.post("/behavioral-drift")
async def analyze_behavioral_drift(
    body: BehavioralDriftRequest,
    user=Depends(get_current_user),
) -> dict:
    """
    POST endpoint to detect behavioral drift with custom data.

    Accepts optional portfolio history and risk profile data,
    otherwise fetches from database.
    """
    uid = getattr(user, "id", None) or getattr(user, "sub", None)
    if not uid:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # Allow analyzing own data or specific user_id if provided
    target_user = body.user_id or uid

    logger.info(
        "risk.behavioral_drift.post",
        requesting_user=uid,
        target_user=target_user,
    )

    try:
        result = detect_behavioral_drift(
            user_id=target_user,
            portfolio_history=body.portfolio_history,
            documented_risk_profile=body.documented_risk_profile,
        )
        return {"ok": True, "result": result}
    except Exception as e:
        logger.error("risk.behavioral_drift.error", error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Behavioral drift analysis failed: {e!s}",
        ) from None


@router.get("/cross-portfolio")
async def get_cross_portfolio(
    user=Depends(get_current_user),
) -> dict:
    """
    GET endpoint to analyze cross-portfolio concentration for current user.

    Detects hidden correlation and concentration risks across multiple
    portfolios held by the user on different platforms.
    """
    uid = getattr(user, "id", None) or getattr(user, "sub", None)
    if not uid:
        raise HTTPException(status_code=401, detail="Unauthorized")

    logger.info("risk.cross_portfolio.get", user_id=uid)

    try:
        result = analyze_cross_portfolio(
            user_id=uid,
            portfolios=None,
            market_data=None,
        )
        return {"ok": True, "result": result}
    except Exception as e:
        logger.error("risk.cross_portfolio.error", error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Cross-portfolio analysis failed: {e!s}",
        ) from None


@router.post("/cross-portfolio")
async def analyze_cross_portfolio_endpoint(
    body: CrossPortfolioRequest,
    user=Depends(get_current_user),
) -> dict:
    """
    POST endpoint to analyze cross-portfolio concentration with custom data.

    Accepts optional portfolio data, otherwise fetches all user portfolios
    from database.
    """
    uid = getattr(user, "id", None) or getattr(user, "sub", None)
    if not uid:
        raise HTTPException(status_code=401, detail="Unauthorized")

    target_user = body.user_id or uid

    logger.info(
        "risk.cross_portfolio.post",
        requesting_user=uid,
        target_user=target_user,
    )

    try:
        result = analyze_cross_portfolio(
            user_id=target_user,
            portfolios=body.portfolios,
            market_data=body.market_data,
        )
        return {"ok": True, "result": result}
    except Exception as e:
        logger.error("risk.cross_portfolio.error", error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Cross-portfolio analysis failed: {e!s}",
        ) from None


@router.get("/health")
async def risk_health() -> dict:
    """Health check for risk analysis endpoints."""
    return {
        "status": "healthy",
        "services": ["behavioral_drift", "cross_portfolio"],
    }
