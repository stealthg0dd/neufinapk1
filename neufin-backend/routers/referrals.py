"""
Referral system
---------------
Each user's share_token doubles as their referral token.

GET  /api/referrals/validate/{ref_token}  → check token is valid
POST /api/emails/subscribe                → subscribe to weekly digest
GET  /api/emails/weekly-digest            → data payload for cron email job
"""

import structlog
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import supabase

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["referrals"])


@router.get("/api/referrals/validate/{ref_token}")
async def validate_referral(ref_token: str):
    """
    Check if a ref_token is a valid share_token in dna_scores.
    Returns { valid, discount_pct } for the frontend to show a discount banner.
    """
    try:
        result = (
            supabase.table("dna_scores")
            .select("share_token, user_id")
            .eq("share_token", ref_token)
            .limit(1)
            .execute()
        )
        if result.data:
            return {"valid": True, "discount_pct": 20, "ref_token": ref_token}
    except Exception:
        logger.warning("Referral token lookup failed", exc_info=True)


# ── Email subscription ─────────────────────────────────────────────────────────

class SubscribeRequest(BaseModel):
    email: str
    user_id: str | None = None


@router.post("/api/emails/subscribe")
async def subscribe_email(body: SubscribeRequest):
    """Subscribe an email to the weekly portfolio digest."""
    try:
        supabase.table("email_subscribers").upsert({
            "email":     body.email,
            "user_id":   body.user_id,
            "subscribed": True,
        }, on_conflict="email").execute()
        return {"subscribed": True}
    except Exception as e:
        raise HTTPException(500, f"Subscription failed: {e}") from e


@router.get("/api/emails/weekly-digest")
async def weekly_digest_data(limit: int = 100):
    """
    Returns subscriber list + their latest DNA scores.
    Call this from a cron job (Railway Cron or GitHub Actions) and pipe
    the results into Resend / SendGrid to send the weekly portfolio update email.

    Cron trigger: 0 9 * * 1  (every Monday 9am UTC)
    """
    try:
        subscribers = (
            supabase.table("email_subscribers")
            .select("email, user_id")
            .eq("subscribed", True)
            .limit(limit)
            .execute()
        )
    except Exception as e:
        raise HTTPException(500, str(e)) from e

    digest = []
    for sub in subscribers.data:
        user_id = sub.get("user_id")
        latest_score = None
        if user_id:
            try:
                score_result = (
                    supabase.table("dna_scores")
                    .select("dna_score, investor_type, recommendation, share_token")
                    .eq("user_id", user_id)
                    .order("created_at", desc=True)
                    .limit(1)
                    .execute()
                )
                latest_score = score_result.data[0] if score_result.data else None
            except Exception:
                logger.warning("Failed to fetch latest score for digest", exc_info=True)
        digest.append({"email": sub["email"], "latest_score": latest_score})

    return {"recipients": len(digest), "digest": digest}
