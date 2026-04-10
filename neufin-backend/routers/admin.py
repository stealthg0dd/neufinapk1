"""
Admin Router — Internal ops endpoints
--------------------------------------
All endpoints require a valid JWT AND advisor role in user_profiles.

GET  /api/admin/users                         → list users with enrichment
POST /api/admin/users/{user_id}/extend-trial  → extend a user's trial
POST /api/admin/users/{user_id}/resend-onboarding → best-effort onboarding email
"""

import datetime

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import supabase
from services.auth_dependency import get_current_user, invalidate_subscription_cache
from services.jwt_auth import JWTUser

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="", tags=["admin"])


# ── Role guard ─────────────────────────────────────────────────────────────────


def require_advisor_role(user: JWTUser) -> None:
    """Raise HTTP 403 if the authenticated user does not have role='advisor'."""
    try:
        result = (
            supabase.table("user_profiles")
            .select("role")
            .eq("id", user.id)
            .single()
            .execute()
        )
        profile = result.data or {}
    except Exception as exc:
        logger.warning("admin.role_check_failed", user_id=user.id, error=str(exc))
        raise HTTPException(403, "Could not verify admin role.") from exc

    if profile.get("role") != "advisor":
        raise HTTPException(403, "Advisor role required.")


# ── Request models ─────────────────────────────────────────────────────────────


class ExtendTrialRequest(BaseModel):
    days: int


# ── Endpoints ──────────────────────────────────────────────────────────────────


@router.get("/api/admin/users")
async def list_users(
    plan: str | None = None,
    user: JWTUser = Depends(get_current_user),
):
    """
    List all user profiles enriched with dna_score count and paid reports count.
    Optional ?plan= query param filters by subscription_status.
    """
    require_advisor_role(user)

    try:
        query = supabase.table("user_profiles").select(
            "id, email, subscription_status, trial_started_at, created_at, last_sign_in_at, role"
        )
        if plan:
            query = query.eq("subscription_status", plan)
        profiles_result = query.limit(200).execute()
        profiles = profiles_result.data or []
    except Exception as exc:
        logger.error("admin.list_users.profiles_failed", error=str(exc))
        raise HTTPException(500, f"Failed to fetch user profiles: {exc}") from exc

    if not profiles:
        return []

    user_ids = [p["id"] for p in profiles]

    # Fetch dna_scores counts
    dna_counts: dict[str, int] = {}
    try:
        dna_result = (
            supabase.table("dna_scores")
            .select("user_id")
            .in_("user_id", user_ids)
            .execute()
        )
        for row in dna_result.data or []:
            uid = row["user_id"]
            dna_counts[uid] = dna_counts.get(uid, 0) + 1
    except Exception as exc:
        logger.warning("admin.list_users.dna_counts_failed", error=str(exc))

    # Fetch paid advisor_reports counts
    report_counts: dict[str, int] = {}
    try:
        reports_result = (
            supabase.table("advisor_reports")
            .select("advisor_id")
            .in_("advisor_id", user_ids)
            .eq("is_paid", True)
            .execute()
        )
        for row in reports_result.data or []:
            uid = row["advisor_id"]
            report_counts[uid] = report_counts.get(uid, 0) + 1
    except Exception as exc:
        logger.warning("admin.list_users.report_counts_failed", error=str(exc))

    return [
        {
            "id": p["id"],
            "email": p.get("email") or "",
            "subscription_status": p.get("subscription_status"),
            "trial_started_at": p.get("trial_started_at"),
            "created_at": p.get("created_at"),
            "last_sign_in_at": p.get("last_sign_in_at"),
            "dna_score_count": dna_counts.get(p["id"], 0),
            "reports_purchased": report_counts.get(p["id"], 0),
        }
        for p in profiles
    ]


@router.post("/api/admin/users/{user_id}/extend-trial")
async def extend_trial(
    user_id: str,
    body: ExtendTrialRequest,
    user: JWTUser = Depends(get_current_user),
):
    """
    Extend a user's trial by `days` extra days.

    Sets trial_started_at = (now + days - 14) so that the calculated
    trial end date is (now + days).
    """
    require_advisor_role(user)

    if body.days <= 0:
        raise HTTPException(400, "days must be a positive integer.")

    now = datetime.datetime.now(datetime.UTC)
    # Trial ends at trial_started_at + 14 days.
    # To make it end at now + days: trial_started_at = now + days - 14 days
    new_start = now + datetime.timedelta(days=body.days - 14)
    new_start_iso = new_start.isoformat()
    new_trial_ends = (now + datetime.timedelta(days=body.days)).date().isoformat()

    try:
        supabase.table("user_profiles").update({"trial_started_at": new_start_iso}).eq(
            "id", user_id
        ).execute()
    except Exception as exc:
        logger.error("admin.extend_trial.failed", user_id=user_id, error=str(exc))
        raise HTTPException(500, f"Failed to extend trial: {exc}") from exc

    invalidate_subscription_cache(user_id)
    logger.info(
        "admin.extend_trial.ok",
        user_id=user_id,
        days=body.days,
        new_trial_ends=new_trial_ends,
    )

    return {"ok": True, "new_trial_ends": new_trial_ends}


@router.post("/api/admin/users/{user_id}/resend-onboarding")
async def resend_onboarding(
    user_id: str,
    user: JWTUser = Depends(get_current_user),
):
    """
    Best-effort: attempt to trigger a Supabase onboarding/signup email
    for the given user via the admin REST API.
    Always returns ok=true; falls back to queued=true if email send fails.
    """
    require_advisor_role(user)

    from core.config import settings

    # Attempt to call Supabase admin API to resend signup confirmation
    try:
        import httpx

        headers = {
            "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": "application/json",
        }
        url = f"{settings.SUPABASE_URL}/auth/v1/admin/users/{user_id}/send-email"
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, headers=headers, json={"type": "signup"})

        if resp.status_code in (200, 201, 204):
            logger.info("admin.resend_onboarding.sent", user_id=user_id)
            return {"ok": True, "queued": False}

        logger.warning(
            "admin.resend_onboarding.api_error",
            user_id=user_id,
            status=resp.status_code,
            body=resp.text[:200],
        )
    except Exception as exc:
        logger.warning(
            "admin.resend_onboarding.failed", user_id=user_id, error=str(exc)
        )

    # Best-effort fallback — log and return queued
    logger.info("admin.resend_onboarding.queued", user_id=user_id)
    return {"ok": True, "queued": True}
