"""
Advisor profile management
--------------------------
GET  /api/advisors/by-token/{share_token}  → look up advisor by DNA share_token (public)
GET  /api/advisors/{advisor_id}            → public profile by user UUID
PUT  /api/advisors/me                      → upsert own profile (requires Bearer token)
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import supabase
from services.auth_dependency import get_subscribed_user
from services.jwt_auth import JWTUser

router = APIRouter(prefix="/api/advisors", tags=["advisors"])


class AdvisorProfileRequest(BaseModel):
    advisor_name: str
    firm_name: str
    calendar_link: str
    logo_base64: str | None = None
    brand_color: str = "#1A56DB"
    white_label: bool = False


@router.get("/by-token/{share_token}")
async def get_advisor_by_share_token(share_token: str):
    """
    Look up an advisor profile using a DNA share_token.
    Used by AdvisorCTA when a visitor arrives via a referral link.
    """
    # Find the user_id linked to this share_token
    try:
        dna_result = (
            supabase.table("dna_scores")
            .select("user_id")
            .eq("share_token", share_token)
            .limit(1)
            .execute()
        )
    except Exception:
        raise HTTPException(404, "Token not found.") from None

    if not dna_result.data or not dna_result.data[0].get("user_id"):
        raise HTTPException(404, "No advisor linked to this token.")

    user_id = dna_result.data[0]["user_id"]

    # Fetch advisor profile
    try:
        result = (
            supabase.table("user_profiles")
            .select(
                "id, advisor_name, firm_name, calendar_link, logo_base64, "
                "brand_primary_color, white_label, subscription_tier"
            )
            .eq("id", user_id)
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(404, "Advisor profile not found.") from None

    data = dict(result.data or {})
    if not data or not data.get("advisor_name"):
        raise HTTPException(404, "Advisor profile not found.")

    data["brand_color"] = data.get("brand_primary_color") or "#1A56DB"
    return data


@router.get("/{advisor_id}")
async def get_advisor_profile(advisor_id: str):
    """Return public advisor profile by user UUID."""
    try:
        result = (
            supabase.table("user_profiles")
            .select(
                "id, advisor_name, firm_name, calendar_link, logo_base64, "
                "brand_primary_color, white_label, subscription_tier"
            )
            .eq("id", advisor_id)
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(404, "Advisor not found.") from None

    if not result.data:
        raise HTTPException(404, "Advisor not found.")

    out = dict(result.data)
    out["brand_color"] = out.get("brand_primary_color") or "#1A56DB"
    return out


@router.put("/me")
async def upsert_advisor_profile(
    body: AdvisorProfileRequest, user: JWTUser = Depends(get_subscribed_user)
):
    """Upsert advisor branding on `advisors` and mirror key fields to `user_profiles`."""
    user_id = user.id

    advisor_row = {
        "id": user_id,
        "advisor_name": body.advisor_name,
        "firm_name": body.firm_name,
        "calendar_link": body.calendar_link or "",
        "logo_base64": body.logo_base64,
        "white_label": body.white_label,
    }
    profile_row = {
        "id": user_id,
        "advisor_name": body.advisor_name,
        "firm_name": body.firm_name,
        "calendar_link": body.calendar_link,
        "logo_base64": body.logo_base64,
        "white_label": body.white_label,
        "white_label_enabled": body.white_label,
        "brand_primary_color": body.brand_color,
    }

    try:
        supabase.table("advisors").upsert(advisor_row, on_conflict="id").execute()
        result = supabase.table("user_profiles").upsert(profile_row, on_conflict="id").execute()
        return result.data[0] if result.data else advisor_row
    except Exception as e:
        raise HTTPException(500, f"Could not save profile: {e}") from e
