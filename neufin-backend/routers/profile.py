"""
Profile & White-Label Router
-----------------------------
Protected endpoints for managing user identity and white-label branding.

POST /api/profile/onboarding    → save user_type, name, firm details; mark onboarding done
POST /api/profile/logo          → upload firm logo to Supabase Storage → update firm_logo_url
GET  /api/profile/white-label   → return white-label config for the authenticated user
PATCH /api/profile/branding     → update branding fields without re-running full onboarding
"""

import uuid
import io
import structlog
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, EmailStr

from database import supabase
from services.auth_dependency import get_current_user
from services.jwt_auth import JWTUser

logger = structlog.get_logger("neufin.profile")
router = APIRouter(prefix="/api/profile", tags=["profile"])

# Allowed logo MIME types
ALLOWED_LOGO_TYPES = {"image/png", "image/svg+xml", "image/jpeg", "image/webp"}
MAX_LOGO_BYTES = 5 * 1024 * 1024  # 5 MB


# ── Pydantic models ────────────────────────────────────────────────────────────

class OnboardingBody(BaseModel):
    user_type: str                           # retail | advisor | pm | enterprise
    full_name: str | None = None
    firm_name: str | None = None
    advisor_name: str | None = None
    advisor_email: str | None = None
    white_label_enabled: bool = False
    brand_primary_color: str | None = None  # hex string e.g. '#1EB8CC'


class BrandingBody(BaseModel):
    firm_name: str | None = None
    advisor_name: str | None = None
    advisor_email: str | None = None
    white_label_enabled: bool | None = None
    brand_primary_color: str | None = None


# ── Helpers ────────────────────────────────────────────────────────────────────

def _safe_update(user_id: str, payload: dict) -> dict:
    """Update user_profiles for the given user; return updated row."""
    payload = {k: v for k, v in payload.items() if v is not None}
    result = (
        supabase.table("user_profiles")
        .upsert({"id": user_id, **payload}, on_conflict="id")
        .execute()
    )
    return result.data[0] if result.data else {}


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/onboarding")
async def complete_onboarding(
    body: OnboardingBody,
    user: JWTUser = Depends(get_current_user),
):
    """
    Save the user's onboarding choices and mark onboarding as complete.
    Safe to call multiple times (idempotent upsert).
    """
    payload: dict = {
        "user_type": body.user_type,
        "onboarding_completed": True,
    }
    if body.full_name:
        payload["full_name"] = body.full_name
    if body.firm_name:
        payload["firm_name"] = body.firm_name
    if body.advisor_name:
        payload["advisor_name"] = body.advisor_name
    if body.advisor_email:
        payload["advisor_email"] = body.advisor_email
    if body.brand_primary_color:
        payload["brand_primary_color"] = body.brand_primary_color
    payload["white_label_enabled"] = body.white_label_enabled

    try:
        updated = _safe_update(str(user.id), payload)
        logger.info("profile.onboarding_complete", user_id=str(user.id), user_type=body.user_type)
        return {"ok": True, "profile": updated}
    except Exception as exc:
        logger.error("profile.onboarding_error", error=str(exc))
        raise HTTPException(status_code=500, detail="Could not save onboarding data")


@router.post("/logo")
async def upload_logo(
    file: UploadFile = File(...),
    user: JWTUser = Depends(get_current_user),
):
    """
    Upload a firm logo to the 'firm-logos' Supabase Storage bucket.
    Returns the public URL which is stored in user_profiles.firm_logo_url.
    """
    if file.content_type not in ALLOWED_LOGO_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{file.content_type}'. Use PNG, SVG, JPEG, or WebP.",
        )

    contents = await file.read()
    if len(contents) > MAX_LOGO_BYTES:
        raise HTTPException(status_code=413, detail="Logo file exceeds 5 MB limit.")

    ext = (file.filename or "logo.png").rsplit(".", 1)[-1].lower()
    storage_path = f"{user.id}/{uuid.uuid4().hex[:12]}.{ext}"

    try:
        supabase.storage.from_("firm-logos").upload(
            path=storage_path,
            file=io.BytesIO(contents),
            file_options={"content-type": file.content_type, "upsert": "true"},
        )
    except Exception as exc:
        logger.error("profile.logo_upload_failed", error=str(exc))
        raise HTTPException(status_code=500, detail="Logo upload failed. Try again.")

    public_url = supabase.storage.from_("firm-logos").get_public_url(storage_path)

    try:
        _safe_update(str(user.id), {"firm_logo_url": public_url})
    except Exception as exc:
        logger.warning("profile.logo_db_update_failed", error=str(exc))

    logger.info("profile.logo_uploaded", user_id=str(user.id), url=public_url)
    return {"logo_url": public_url}


@router.get("/white-label")
async def get_white_label_config(user: JWTUser = Depends(get_current_user)):
    """
    Return the white-label branding config for the authenticated user.
    Used by the frontend before report generation to populate the toggle UI.
    """
    try:
        result = (
            supabase.table("user_profiles")
            .select(
                "white_label_enabled,firm_name,firm_logo_url,"
                "advisor_name,advisor_email,brand_primary_color,user_type,onboarding_completed"
            )
            .eq("id", str(user.id))
            .single()
            .execute()
        )
        data = result.data or {}
    except Exception:
        data = {}

    return {
        "white_label_enabled": bool(data.get("white_label_enabled")),
        "firm_name": data.get("firm_name") or "",
        "firm_logo_url": data.get("firm_logo_url") or "",
        "advisor_name": data.get("advisor_name") or "",
        "advisor_email": data.get("advisor_email") or "",
        "brand_primary_color": data.get("brand_primary_color") or "#1EB8CC",
        "user_type": data.get("user_type") or "retail",
        "onboarding_completed": bool(data.get("onboarding_completed")),
    }


@router.patch("/branding")
async def update_branding(
    body: BrandingBody,
    user: JWTUser = Depends(get_current_user),
):
    """
    Update branding fields from the Settings page without re-running onboarding.
    All fields are optional; only supplied values are updated.
    """
    payload: dict = {}
    if body.firm_name is not None:
        payload["firm_name"] = body.firm_name
    if body.advisor_name is not None:
        payload["advisor_name"] = body.advisor_name
    if body.advisor_email is not None:
        payload["advisor_email"] = body.advisor_email
    if body.white_label_enabled is not None:
        payload["white_label_enabled"] = body.white_label_enabled
    if body.brand_primary_color is not None:
        payload["brand_primary_color"] = body.brand_primary_color

    if not payload:
        raise HTTPException(status_code=400, detail="No fields supplied to update.")

    try:
        updated = _safe_update(str(user.id), payload)
        logger.info("profile.branding_updated", user_id=str(user.id))
        return {"ok": True, "profile": updated}
    except Exception as exc:
        logger.error("profile.branding_error", error=str(exc))
        raise HTTPException(status_code=500, detail="Could not save branding settings.")
