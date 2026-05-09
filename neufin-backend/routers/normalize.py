"""POST /api/portfolio/normalize — deterministic raw portfolio parsing."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from services.auth_dependency import get_current_user
from services.jwt_auth import JWTUser
from services.raw_portfolio_normalize import normalize_raw_portfolio

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


class NormalizePortfolioRequest(BaseModel):
    raw_text: str = Field(..., max_length=500_000)
    market_code: str = Field(default="US", max_length=8)


@router.post("/normalize")
async def normalize_portfolio(
    body: NormalizePortfolioRequest,
    _user: JWTUser = Depends(get_current_user),
):
    """
    Parse pasted broker exports / freeform text into editable positions.
    Does not persist. Requires a valid JWT (same as other /api/portfolio routes).
    """
    return normalize_raw_portfolio(body.raw_text, body.market_code)
