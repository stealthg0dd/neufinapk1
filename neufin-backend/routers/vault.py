"""
User Vault
----------
Protected endpoints for authenticated users.
All routes require a valid Bearer JWT (enforced by auth middleware in main.py).

GET  /api/vault/history          → all DNA scores for the signed-in user
POST /api/vault/claim            → associate an anonymous record with the user
GET  /api/vault/subscription     → subscription tier + portal link
POST /api/vault/stripe-portal    → create a Stripe Customer Portal session

Plan / subscription endpoints (separate router — no /vault prefix):
GET  /api/plans                  → all subscription plans (public, no auth)
GET  /api/subscription/status    → current user's plan + monthly usage (auth required)
"""

import stripe
import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import (
    APP_BASE_URL,
    STRIPE_PRICE_ADVISOR_MONTHLY,
    STRIPE_PRICE_ENTERPRISE_MONTHLY,
    STRIPE_PRICE_RETAIL_MONTHLY,
    STRIPE_SECRET_KEY,
)
from database import claim_guest_data, supabase
from services.auth_dependency import get_current_user
from services.auth_dependency import get_subscription_status as get_sub_status
from services.jwt_auth import JWTUser

logger = structlog.get_logger("neufin.vault")

# ── Subscription plan definitions ─────────────────────────────────────────────
# stripe_price_id values are populated after running scripts/setup_stripe_products.py
PLANS: dict = {
    "free": {
        "name": "Free",
        "price_monthly": 0,
        "dna_analyses_per_month": 3,
        "swarm_analyses": False,
        "advisor_reports": False,
        "api_access": False,
    },
    "retail": {
        "name": "Retail Investor",
        "price_monthly": 29,
        "stripe_price_id": STRIPE_PRICE_RETAIL_MONTHLY,
        "dna_analyses_per_month": -1,
        "swarm_analyses": True,
        "advisor_reports": False,
        "api_access": False,
    },
    "advisor": {
        "name": "Financial Advisor",
        "price_monthly": 299,
        "stripe_price_id": STRIPE_PRICE_ADVISOR_MONTHLY,
        "dna_analyses_per_month": -1,
        "swarm_analyses": True,
        "advisor_reports": True,
        "advisor_reports_per_month": 10,
        "api_access": False,
        "multi_client": True,
    },
    "enterprise": {
        "name": "Enterprise / API",
        "price_monthly": 999,
        "stripe_price_id": STRIPE_PRICE_ENTERPRISE_MONTHLY,
        "dna_analyses_per_month": -1,
        "swarm_analyses": True,
        "advisor_reports": True,
        "advisor_reports_per_month": -1,
        "api_access": True,
        "multi_client": True,
        "api_rate_limit_per_day": 10000,
    },
}

# Per-plan DNA analysis limits (-1 = unlimited)
PLAN_DNA_LIMITS: dict[str, int] = {
    "free": 3,
    "retail": -1,
    "advisor": -1,
    "enterprise": -1,
}

stripe.api_key = STRIPE_SECRET_KEY

# ── Plans router (public, no /vault prefix) ────────────────────────────────────
plans_router = APIRouter(tags=["subscription"])


@plans_router.get("/api/plans")
async def get_plans():
    """Return all subscription plans and their features (public, no auth required)."""
    return {"plans": PLANS}


@plans_router.get("/api/subscription/status")
async def get_subscription_status(user: JWTUser = Depends(get_current_user)):
    """Return the authenticated user's current plan and monthly usage."""
    from services.usage_tracker import get_monthly_usage

    uid = user.id
    try:
        result = (
            supabase.table("user_profiles")
            .select(
                "subscription_tier, subscription_status, trial_started_at,"
                "advisor_name, firm_name, onboarding_completed"
            )
            .eq("id", uid)
            .single()
            .execute()
        )
        data = result.data or {}
    except Exception:
        data = {}

    # Trial users get full Advisor-tier access for 14 days, even if subscription_tier is still 'free'.
    sub = get_sub_status(uid)
    status = sub.get("status") or "expired"
    days_remaining = sub.get("days_remaining", 0)
    trial_started_at = data.get("trial_started_at")

    tier = data.get("subscription_tier", "free") or "free"
    if status == "trial":
        tier = "advisor"

    plan = PLANS.get(tier, PLANS["free"])
    dna_limit = PLAN_DNA_LIMITS.get(tier, 3)
    usage = get_monthly_usage(uid)

    return {
        "plan": tier,
        "status": status,
        "days_remaining": days_remaining,
        "trial_started_at": trial_started_at,
        "plan_details": plan,
        "usage": {
            **usage,
            "dna_limit": dna_limit,
            "dna_remaining": (
                max(0, dna_limit - usage["dna_analyses"]) if dna_limit != -1 else -1
            ),
        },
        "advisor_name": data.get("advisor_name"),
        "firm_name": data.get("firm_name"),
        "onboarding_completed": data.get("onboarding_completed", True),
    }


# ── Vault router (authenticated, /api/vault prefix) ───────────────────────────
router = APIRouter(prefix="/api/vault", tags=["vault"])


@router.get("/history")
async def get_vault_history(user: JWTUser = Depends(get_current_user), limit: int = 50):
    """
    Return all DNA scores for the authenticated user, newest first.
    Excludes positions/raw data — just the scored records.

    Enriches each row with portfolio_id, portfolio_name (from portfolios),
    and the latest advisor_reports pdf_url / is_paid for that portfolio when
    the report belongs to this user.
    """
    uid = user.id
    try:
        result = (
            supabase.table("dna_scores")
            .select(
                "id, dna_score, investor_type, recommendation, share_token, total_value, created_at, portfolio_id"
            )
            .eq("user_id", uid)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        rows = result.data or []
    except Exception as e:
        raise HTTPException(500, f"Could not fetch history: {e}") from e

    pids = list({str(r["portfolio_id"]) for r in rows if r.get("portfolio_id")})
    names: dict[str, str | None] = {}
    if pids:
        try:
            pr = (
                supabase.table("portfolios")
                .select("id, name")
                .in_("id", pids)
                .execute()
            )
            for p in pr.data or []:
                names[str(p["id"])] = p.get("name")
        except Exception as e:
            logger.debug("vault.portfolio_names_enrich_failed", error=str(e))

    pdf_by_pid: dict[str, str | None] = {}
    paid_by_pid: dict[str, bool] = {}
    if pids:
        try:
            rep = (
                supabase.table("advisor_reports")
                .select("portfolio_id, pdf_url, is_paid, created_at")
                .eq("advisor_id", uid)
                .in_("portfolio_id", pids)
                .order("created_at", desc=True)
                .execute()
            )
            for r in rep.data or []:
                pid = str(r.get("portfolio_id") or "")
                if pid and pid not in pdf_by_pid:
                    pdf_by_pid[pid] = r.get("pdf_url")
                    paid_by_pid[pid] = bool(r.get("is_paid"))
        except Exception as e:
            logger.debug("vault.advisor_reports_enrich_failed", error=str(e))

    enriched = []
    for r in rows:
        pid = r.get("portfolio_id")
        pid_str = str(pid) if pid else None
        row = dict(r)
        row["portfolio_name"] = names.get(pid_str) if pid_str else None
        row["pdf_url"] = pdf_by_pid.get(pid_str) if pid_str else None
        row["is_paid"] = paid_by_pid.get(pid_str, False) if pid_str else False
        enriched.append(row)

    return {"history": enriched}


# ── Claim anonymous record (single, by record_id) ──────────────────────────────


class ClaimRequest(BaseModel):
    record_id: str


@router.post("/claim")
async def claim_anonymous_record(
    body: ClaimRequest, user: JWTUser = Depends(get_current_user)
):
    """
    Associate an anonymous dna_scores record with the now-authenticated user.
    Only succeeds if the record currently has no user_id (prevents hijacking).
    """
    uid = user.id
    try:
        existing = (
            supabase.table("dna_scores")
            .select("id, user_id")
            .eq("id", body.record_id)
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(404, "Record not found.") from None

    record = existing.data
    if not record:
        raise HTTPException(404, "Record not found.")
    if record.get("user_id") is not None:
        if record["user_id"] == uid:
            return {"claimed": True, "record_id": body.record_id}
        raise HTTPException(
            409, "This record is already associated with another account."
        )

    try:
        supabase.table("dna_scores").update({"user_id": uid}).eq(
            "id", body.record_id
        ).execute()
        return {"claimed": True, "record_id": body.record_id}
    except Exception as e:
        raise HTTPException(500, f"Claim failed: {e}") from e


# ── Bulk-claim by session_id (Guest → Authenticated) ───────────────────────────


class SessionClaimRequest(BaseModel):
    session_id: str  # localStorage key generated client-side before auth


@router.post("/claim-session")
async def claim_session_portfolios(
    body: SessionClaimRequest, user: JWTUser = Depends(get_current_user)
):
    """
    Re-assign ALL unclaimed portfolios, dna_scores, and swarm_reports that share
    a guest session_id to the now-authenticated user.

    Called immediately after registration/login when localStorage contains
    a 'neufin-session-id' that was set before the user was authenticated.

    Encrypted cost_basis values are left intact — Fernet tokens are user-agnostic,
    so ownership transfer does not require re-encryption.

    Returns a summary of what was claimed.
    """
    uid = user.id
    sid = body.session_id.strip()
    if not sid:
        raise HTTPException(400, "session_id must not be empty.")

    # Delegates to database.claim_guest_data which also clears session_id after claim
    claimed = claim_guest_data(session_id=sid, user_id=uid)

    return {
        "claimed": claimed,
        "total": sum(claimed.values()),
        "user_id": uid,
        "session_id": sid,
    }


# ── Subscription ───────────────────────────────────────────────────────────────


def _compute_is_pro(tier: str, status: str, trial_started_at: object) -> bool:
    """
    Returns True when the user has full (Advisor-tier) access:
      - Paid advisor/enterprise subscription that is currently active, OR
      - An active 14-day trial (trial_started_at is within the last 14 days).
    """
    # Paid tiers
    if tier in ("advisor", "enterprise") and status == "active":
        return True

    # Trial period
    if status == "trial" and trial_started_at:
        from datetime import datetime, timezone, timedelta
        try:
            ts = trial_started_at
            if isinstance(ts, str):
                ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            trial_end = ts + timedelta(days=14)
            if datetime.now(timezone.utc) < trial_end:
                return True
        except Exception:
            pass

    return False


@router.get("/subscription")
async def get_subscription(user: JWTUser = Depends(get_current_user)):
    """Return the user's current subscription tier and access level."""
    uid = user.id
    try:
        result = (
            supabase.table("user_profiles")
            .select(
                "subscription_tier, subscription_status, trial_started_at, "
                "advisor_name, firm_name"
            )
            .eq("id", uid)
            .single()
            .execute()
        )
        data = result.data or {}
        tier   = data.get("subscription_tier", "free") or "free"
        status = data.get("subscription_status", "free") or "free"
        trial_started_at = data.get("trial_started_at")
        return {
            "subscription_tier":   tier,
            "subscription_status": status,
            "trial_started_at":    str(trial_started_at or ""),
            "is_pro":              _compute_is_pro(tier, status, trial_started_at),
            "advisor_name":        data.get("advisor_name"),
            "firm_name":           data.get("firm_name"),
        }
    except Exception:
        return {
            "subscription_tier":   "free",
            "subscription_status": "free",
            "trial_started_at":    "",
            "is_pro":              False,
        }


# ── Stripe Customer Portal ─────────────────────────────────────────────────────


class PortalRequest(BaseModel):
    return_url: str = f"{APP_BASE_URL}/vault"


@router.post("/stripe-portal")
async def create_stripe_portal(
    body: PortalRequest, user: JWTUser = Depends(get_current_user)
):
    """
    Create a Stripe Customer Portal session so users can manage their subscription.
    Looks up the Stripe customer_id from user_profiles; creates one if missing.
    """
    if not STRIPE_SECRET_KEY:
        raise HTTPException(503, "Stripe is not configured on this server.")

    uid = user.id

    # Get or create Stripe customer
    try:
        profile_result = (
            supabase.table("user_profiles")
            .select("stripe_customer_id, subscription_tier")
            .eq("id", uid)
            .single()
            .execute()
        )
        profile = profile_result.data or {}
    except Exception:
        profile = {}

    customer_id = profile.get("stripe_customer_id")

    if not customer_id:
        try:
            customer = stripe.Customer.create(
                email=user.email,
                metadata={"user_id": uid},
            )
            customer_id = customer.id
            # Persist for next time
            supabase.table("user_profiles").upsert(
                {
                    "id": uid,
                    "stripe_customer_id": customer_id,
                },
                on_conflict="id",
            ).execute()
        except Exception as e:
            raise HTTPException(500, f"Could not create Stripe customer: {e}") from e

    try:
        session = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=body.return_url,
        )
        return {"portal_url": session.url}
    except stripe.StripeError as e:
        raise HTTPException(502, f"Stripe error: {e.user_message}") from e
