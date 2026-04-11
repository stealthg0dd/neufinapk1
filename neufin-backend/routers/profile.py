"""
Profile & white-label (advisors table)
--------------------------------------
POST /api/profile/complete-onboarding  → finish onboarding; upsert advisors row
GET  /api/profile/white-label          → read firm_name, logo_base64, etc. from advisors
PATCH /api/profile/branding            → update advisors + user_profiles
POST /api/profile/logo                 → upload image → advisors.logo_base64 (+ optional storage)
POST /api/profile/onboarding           → legacy alias → complete-onboarding
"""

import base64
import io
import uuid

import structlog
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from database import supabase
from services.auth_dependency import get_current_user
from services.jwt_auth import JWTUser

logger = structlog.get_logger("neufin.profile")
router = APIRouter(prefix="/api/profile", tags=["profile"])

ALLOWED_LOGO_TYPES = {"image/png", "image/svg+xml", "image/jpeg", "image/webp"}
MAX_LOGO_BYTES = 5 * 1024 * 1024


def _advisors_merge(user_id: str, patch: dict) -> None:
    """Read-modify-write merge into advisors so partial updates do not null columns.

    Brand color is stored on ``user_profiles.brand_primary_color`` only; many
    production DBs do not yet have ``advisors.brand_color`` (PostgREST PGRST204).
    """
    patch = {k: v for k, v in patch.items() if k != "brand_color"}
    try:
        ex = supabase.table("advisors").select("*").eq("id", user_id).limit(1).execute()
        base = dict(ex.data[0]) if ex.data else {}
    except Exception:
        base = {}
    merged: dict = {
        "id": user_id,
        "calendar_link": base.get("calendar_link") or "",
        "firm_name": base.get("firm_name") or "",
        "advisor_name": base.get("advisor_name") or "",
        "white_label": bool(base.get("white_label")),
        "logo_base64": base.get("logo_base64"),
    }
    merged.pop("brand_color", None)
    for k, v in patch.items():
        if k == "white_label" or v is not None:
            merged[k] = v
    if "logo_base64" not in patch and merged.get("logo_base64") is None:
        merged.pop("logo_base64", None)
    merged.pop("brand_color", None)
    supabase.table("advisors").upsert(merged, on_conflict="id").execute()


class CompleteOnboardingBody(BaseModel):
    user_type: str | None = None
    firm_name: str | None = None
    advisor_name: str | None = None
    advisor_email: str | None = None
    white_label: bool = False
    brand_color: str | None = None
    logo_base64: str | None = None


class BrandingBody(BaseModel):
    firm_name: str | None = None
    advisor_name: str | None = None
    advisor_email: str | None = None
    white_label_enabled: bool | None = None
    brand_primary_color: str | None = None


@router.post("/complete-onboarding")
async def complete_onboarding(
    body: CompleteOnboardingBody,
    user: JWTUser = Depends(get_current_user),
):
    """
    Saves onboarding data and marks onboarding complete.
    body: {user_type?, firm_name?, advisor_name?, advisor_email?,
           white_label?, brand_color?, logo_base64?}
    """
    uid = str(user.id)
    profile_updates: dict = {"onboarding_completed": True}
    if body.user_type:
        profile_updates["user_type"] = body.user_type
    if body.advisor_name:
        profile_updates["full_name"] = body.advisor_name
        profile_updates["advisor_name"] = body.advisor_name
    if body.advisor_email:
        profile_updates["advisor_email"] = body.advisor_email
    if body.firm_name is not None:
        profile_updates["firm_name"] = body.firm_name
    if body.brand_color is not None:
        profile_updates["brand_primary_color"] = body.brand_color or "#1EB8CC"

    try:
        supabase.table("user_profiles").update(profile_updates).eq("id", uid).execute()
    except Exception as exc:
        logger.error("profile.complete_onboarding_profile_failed", error=str(exc))
        raise HTTPException(status_code=500, detail="Could not update profile") from exc

    if body.firm_name or body.white_label or body.logo_base64 or body.advisor_name:
        patch: dict = {
            "firm_name": body.firm_name or "",
            "advisor_name": body.advisor_name or "",
            "white_label": bool(body.white_label),
        }
        if body.logo_base64:
            patch["logo_base64"] = body.logo_base64
        try:
            _advisors_merge(uid, patch)
        except Exception as exc:
            logger.error("profile.complete_onboarding_advisor_failed", error=str(exc))
            raise HTTPException(status_code=500, detail="Could not save advisor branding") from exc

    logger.info("profile.onboarding_complete", user_id=uid)
    return {"ok": True, "onboarding_completed": True}


@router.post("/onboarding")
async def legacy_onboarding(
    body: CompleteOnboardingBody,
    user: JWTUser = Depends(get_current_user),
):
    """Backward-compatible alias for older clients."""
    return await complete_onboarding(body, user)


@router.get("/white-label")
async def get_white_label(user: JWTUser = Depends(get_current_user)):
    """Returns white-label config from the advisors table."""
    uid = str(user.id)
    advisor_email = ""
    firm_logo_url = ""
    rowp: dict = {}
    try:
        pr = (
            supabase.table("user_profiles")
            .select("advisor_email,firm_logo_url,brand_primary_color")
            .eq("id", uid)
            .limit(1)
            .execute()
        )
        if pr.data:
            rowp = pr.data[0]
            advisor_email = rowp.get("advisor_email") or ""
            firm_logo_url = rowp.get("firm_logo_url") or ""
    except Exception as exc:
        logger.debug("profile.user_profile_read_failed", error=str(exc))

    profile_brand = rowp.get("brand_primary_color") or "#1EB8CC"

    try:
        result = (
            supabase.table("advisors")
            .select("firm_name,advisor_name,logo_base64,white_label")
            .eq("id", uid)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        logger.warning("profile.white_label_read_failed", error=str(exc))
        return {
            "white_label_enabled": False,
            "firm_name": None,
            "advisor_name": None,
            "logo_base64": None,
            "brand_color": profile_brand,
            "firm_logo_url": firm_logo_url,
            "advisor_email": advisor_email,
            "brand_primary_color": profile_brand,
        }

    if not result.data:
        return {
            "white_label_enabled": False,
            "firm_name": None,
            "advisor_name": None,
            "logo_base64": None,
            "brand_color": profile_brand,
            "firm_logo_url": firm_logo_url,
            "advisor_email": advisor_email,
            "brand_primary_color": profile_brand,
        }

    row = result.data[0]
    return {
        "white_label_enabled": bool(row.get("white_label")),
        "firm_name": row.get("firm_name"),
        "advisor_name": row.get("advisor_name"),
        "logo_base64": row.get("logo_base64"),
        "brand_color": profile_brand,
        "firm_logo_url": firm_logo_url,
        "advisor_email": advisor_email,
        "brand_primary_color": profile_brand,
    }


@router.patch("/branding")
async def update_branding(
    body: BrandingBody,
    user: JWTUser = Depends(get_current_user),
):
    """Update branding in advisors + user_profiles."""
    uid = str(user.id)
    prof: dict = {}
    if body.firm_name is not None:
        prof["firm_name"] = body.firm_name
    if body.advisor_name is not None:
        prof["advisor_name"] = body.advisor_name
        prof["full_name"] = body.advisor_name
    if body.advisor_email is not None:
        prof["advisor_email"] = body.advisor_email
    if body.white_label_enabled is not None:
        prof["white_label_enabled"] = body.white_label_enabled
    if body.brand_primary_color is not None:
        prof["brand_primary_color"] = body.brand_primary_color

    adv_patch: dict = {}
    if body.firm_name is not None:
        adv_patch["firm_name"] = body.firm_name
    if body.advisor_name is not None:
        adv_patch["advisor_name"] = body.advisor_name
    if body.white_label_enabled is not None:
        adv_patch["white_label"] = body.white_label_enabled
    if not prof and not adv_patch:
        raise HTTPException(status_code=400, detail="No fields supplied to update.")

    try:
        if prof:
            supabase.table("user_profiles").update(prof).eq("id", uid).execute()
        if adv_patch:
            _advisors_merge(uid, adv_patch)
        logger.info("profile.branding_updated", user_id=uid)
        return {"ok": True}
    except Exception as exc:
        logger.error("profile.branding_error", error=str(exc))
        raise HTTPException(status_code=500, detail="Could not save branding settings.") from exc


@router.post("/logo")
async def upload_logo(
    file: UploadFile = File(...),
    user: JWTUser = Depends(get_current_user),
):
    """Store logo as base64 on advisors (+ optional Supabase storage URL on user_profiles)."""
    if file.content_type not in ALLOWED_LOGO_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{file.content_type}'.",
        )
    contents = await file.read()
    if len(contents) > MAX_LOGO_BYTES:
        raise HTTPException(status_code=413, detail="Logo file exceeds 5 MB.")

    b64 = base64.b64encode(contents).decode("ascii")
    uid = str(user.id)

    try:
        _advisors_merge(uid, {"logo_base64": b64})
    except Exception as exc:
        logger.error("profile.logo_advisor_failed", error=str(exc))
        raise HTTPException(status_code=500, detail="Could not save logo") from exc

    public_url: str | None = None
    try:
        ext = (file.filename or "logo.png").rsplit(".", 1)[-1].lower()
        storage_path = f"{user.id}/{uuid.uuid4().hex[:12]}.{ext}"
        supabase.storage.from_("firm-logos").upload(
            path=storage_path,
            file=io.BytesIO(contents),
            file_options={"content-type": file.content_type or "image/png", "upsert": "true"},
        )
        public_url = supabase.storage.from_("firm-logos").get_public_url(storage_path)
        supabase.table("user_profiles").update({"firm_logo_url": public_url}).eq("id", uid).execute()
    except Exception as exc:
        logger.debug("profile.logo_storage_skipped", error=str(exc))

    return {"logo_url": public_url, "logo_base64": b64}
