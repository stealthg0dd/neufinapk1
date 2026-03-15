"""
User Vault
----------
Protected endpoints for authenticated users.
All routes require a valid Bearer JWT (enforced by auth middleware in main.py).

GET  /api/vault/history          → all DNA scores for the signed-in user
POST /api/vault/claim            → associate an anonymous record with the user
GET  /api/vault/subscription     → subscription tier + portal link
POST /api/vault/stripe-portal    → create a Stripe Customer Portal session
"""

import stripe
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from database import supabase, claim_guest_data
from config import STRIPE_SECRET_KEY, APP_BASE_URL

router = APIRouter(prefix="/api/vault", tags=["vault"])

stripe.api_key = STRIPE_SECRET_KEY


def _user_id(request: Request) -> str:
    """Extract user_id from auth middleware state. Raises 401 if missing."""
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(401, "Authentication required.")
    return user.id


# ── History ────────────────────────────────────────────────────────────────────

@router.get("/history")
async def get_vault_history(request: Request, limit: int = 50):
    """
    Return all DNA scores for the authenticated user, newest first.
    Excludes positions/raw data — just the scored records.
    """
    uid = _user_id(request)
    try:
        result = (
            supabase.table("dna_scores")
            .select("id, dna_score, investor_type, recommendation, share_token, total_value, created_at")
            .eq("user_id", uid)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return {"history": result.data or []}
    except Exception as e:
        raise HTTPException(500, f"Could not fetch history: {e}")


# ── Claim anonymous record (single, by record_id) ──────────────────────────────

class ClaimRequest(BaseModel):
    record_id: str


@router.post("/claim")
async def claim_anonymous_record(body: ClaimRequest, request: Request):
    """
    Associate an anonymous dna_scores record with the now-authenticated user.
    Only succeeds if the record currently has no user_id (prevents hijacking).
    """
    uid = _user_id(request)
    try:
        existing = (
            supabase.table("dna_scores")
            .select("id, user_id")
            .eq("id", body.record_id)
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(404, "Record not found.")

    record = existing.data
    if not record:
        raise HTTPException(404, "Record not found.")
    if record.get("user_id") is not None:
        if record["user_id"] == uid:
            return {"claimed": True, "record_id": body.record_id}
        raise HTTPException(409, "This record is already associated with another account.")

    try:
        supabase.table("dna_scores").update({"user_id": uid}).eq("id", body.record_id).execute()
        return {"claimed": True, "record_id": body.record_id}
    except Exception as e:
        raise HTTPException(500, f"Claim failed: {e}")


# ── Bulk-claim by session_id (Guest → Authenticated) ───────────────────────────

class SessionClaimRequest(BaseModel):
    session_id: str   # localStorage key generated client-side before auth


@router.post("/claim-session")
async def claim_session_portfolios(body: SessionClaimRequest, request: Request):
    """
    Re-assign ALL unclaimed portfolios, dna_scores, and swarm_reports that share
    a guest session_id to the now-authenticated user.

    Called immediately after registration/login when localStorage contains
    a 'neufin-session-id' that was set before the user was authenticated.

    Encrypted cost_basis values are left intact — Fernet tokens are user-agnostic,
    so ownership transfer does not require re-encryption.

    Returns a summary of what was claimed.
    """
    uid = _user_id(request)
    sid = body.session_id.strip()
    if not sid:
        raise HTTPException(400, "session_id must not be empty.")

    # Delegates to database.claim_guest_data which also clears session_id after claim
    claimed = claim_guest_data(session_id=sid, user_id=uid)

    return {
        "claimed":    claimed,
        "total":      sum(claimed.values()),
        "user_id":    uid,
        "session_id": sid,
    }


# ── Subscription ───────────────────────────────────────────────────────────────

@router.get("/subscription")
async def get_subscription(request: Request):
    """Return the user's current subscription_tier from user_profiles."""
    uid = _user_id(request)
    try:
        result = (
            supabase.table("user_profiles")
            .select("subscription_tier, advisor_name, firm_name")
            .eq("id", uid)
            .single()
            .execute()
        )
        data = result.data or {}
        return {
            "subscription_tier": data.get("subscription_tier", "free"),
            "is_pro": data.get("subscription_tier") == "pro",
            "advisor_name": data.get("advisor_name"),
            "firm_name": data.get("firm_name"),
        }
    except Exception:
        return {"subscription_tier": "free", "is_pro": False}


# ── Stripe Customer Portal ─────────────────────────────────────────────────────

class PortalRequest(BaseModel):
    return_url: str = f"{APP_BASE_URL}/vault"


@router.post("/stripe-portal")
async def create_stripe_portal(body: PortalRequest, request: Request):
    """
    Create a Stripe Customer Portal session so users can manage their subscription.
    Looks up the Stripe customer_id from user_profiles; creates one if missing.
    """
    if not STRIPE_SECRET_KEY:
        raise HTTPException(503, "Stripe is not configured on this server.")

    uid = _user_id(request)
    user = request.state.user

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
            supabase.table("user_profiles").upsert({
                "id": uid,
                "stripe_customer_id": customer_id,
            }, on_conflict="id").execute()
        except Exception as e:
            raise HTTPException(500, f"Could not create Stripe customer: {e}")

    try:
        session = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=body.return_url,
        )
        return {"portal_url": session.url}
    except stripe.StripeError as e:
        raise HTTPException(502, f"Stripe error: {e.user_message}")
