"""
Developer API Keys (Tier 3 — Enterprise/API)
--------------------------------------------
Enterprise customers authenticate external calls with the custom header:
  X-NeuFin-API-Key: <raw_key>

Keys are stored as SHA-256 hashes; the raw key is only returned once at creation.

Table: api_keys
  id UUID, user_id TEXT, key_hash TEXT UNIQUE, name TEXT,
  created_at TIMESTAMPTZ, last_used_at TIMESTAMPTZ,
  is_active BOOL DEFAULT TRUE, rate_limit_per_day INT DEFAULT 10000

Table: api_keys_daily_usage
  key_id UUID REFERENCES api_keys(id), date DATE,
  calls INT DEFAULT 0, PRIMARY KEY (key_id, date)

Endpoints:
  GET    /api/developer/keys            → list user's API keys
  POST   /api/developer/keys            → generate new API key
  DELETE /api/developer/keys/{key_id}   → revoke a key
"""

import datetime
import hashlib
import secrets

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from database import supabase
from services.auth_dependency import get_current_user
from services.jwt_auth import JWTUser

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/developer", tags=["developer"])

_ENTERPRISE_PLANS = {"enterprise"}


def _require_enterprise_plan(user: JWTUser) -> None:
    try:
        result = (
            supabase.table("user_profiles")
            .select("subscription_tier")
            .eq("id", user.id)
            .single()
            .execute()
        )
        tier = (result.data or {}).get("subscription_tier", "free")
    except Exception:
        tier = "free"

    if tier not in _ENTERPRISE_PLANS:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "plan_required",
                "message": "Enterprise plan required to use API keys.",
                "upgrade_url": "/pricing",
                "required_plan": "enterprise",
            },
        )


def _hash_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode()).hexdigest()


# ── Request models ────────────────────────────────────────────────────────────


class CreateKeyRequest(BaseModel):
    name: str


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/keys")
async def list_api_keys(user: JWTUser = Depends(get_current_user)):
    """List API keys for the authenticated user (hashes never returned)."""
    _require_enterprise_plan(user)
    try:
        result = (
            supabase.table("api_keys")
            .select("id, name, created_at, last_used_at, is_active, rate_limit_per_day")
            .eq("user_id", user.id)
            .order("created_at", desc=True)
            .execute()
        )
        return {"keys": result.data or []}
    except Exception as e:
        raise HTTPException(500, f"Could not fetch API keys: {e}") from e


@router.post("/keys", status_code=201)
async def create_api_key(body: CreateKeyRequest, user: JWTUser = Depends(get_current_user)):
    """
    Generate a new API key.
    The raw key is returned only once — store it securely.
    """
    _require_enterprise_plan(user)

    # Cap at 10 active keys per user
    try:
        existing = (
            supabase.table("api_keys")
            .select("id")
            .eq("user_id", user.id)
            .eq("is_active", True)
            .execute()
        )
        if len(existing.data or []) >= 10:
            raise HTTPException(400, "Maximum of 10 active API keys allowed.")
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("api_key.count_check_failed", user_id=user.id, error=str(e))

    raw_key = f"nf_{secrets.token_urlsafe(32)}"
    key_hash = _hash_key(raw_key)

    try:
        result = (
            supabase.table("api_keys")
            .insert(
                {
                    "user_id": user.id,
                    "key_hash": key_hash,
                    "name": body.name,
                    "is_active": True,
                    "rate_limit_per_day": 10000,
                }
            )
            .execute()
        )
        record = result.data[0] if result.data else {}
        logger.info("api_key.created", user_id=user.id, key_name=body.name)
        return {
            "id": record.get("id"),
            "name": body.name,
            "key": raw_key,
            "created_at": record.get("created_at"),
            "rate_limit_per_day": 10000,
            "warning": "Store this key securely — it will not be shown again.",
        }
    except Exception as e:
        raise HTTPException(500, f"Could not create API key: {e}") from e


@router.delete("/keys/{key_id}")
async def revoke_api_key(key_id: str, user: JWTUser = Depends(get_current_user)):
    """Revoke an API key (sets is_active=False)."""
    _require_enterprise_plan(user)
    try:
        result = (
            supabase.table("api_keys")
            .update({"is_active": False})
            .eq("id", key_id)
            .eq("user_id", user.id)
            .execute()
        )
        if not result.data:
            raise HTTPException(404, "API key not found.")
        logger.info("api_key.revoked", user_id=user.id, key_id=key_id)
        return {"revoked": True, "key_id": key_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Could not revoke API key: {e}") from e


# ── Middleware helper ─────────────────────────────────────────────────────────


async def check_api_key(request: Request) -> JWTUser | None:
    """
    Validate X-NeuFin-API-Key header for enterprise API calls.

    Checks:
      1. Key exists in api_keys table and is_active=True
      2. Daily rate limit not exceeded (tracked in api_keys_daily_usage)

    Returns the associated JWTUser or raises HTTPException.
    Returns None if the header is absent (caller may fall through to JWT auth).
    """
    raw_key = request.headers.get("X-NeuFin-API-Key")
    if not raw_key:
        return None

    key_hash = _hash_key(raw_key)

    try:
        result = (
            supabase.table("api_keys")
            .select("id, user_id, is_active, rate_limit_per_day")
            .eq("key_hash", key_hash)
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(401, "Invalid API key.") from None

    key_record = result.data
    if not key_record or not key_record.get("is_active"):
        raise HTTPException(401, "Invalid or revoked API key.")

    key_id = key_record["id"]
    user_id = key_record["user_id"]
    rate_limit = key_record.get("rate_limit_per_day") or 10000
    today = datetime.date.today().isoformat()

    try:
        usage_result = (
            supabase.table("api_keys_daily_usage")
            .select("calls")
            .eq("key_id", key_id)
            .eq("date", today)
            .limit(1)
            .execute()
        )
        current_calls = usage_result.data[0]["calls"] if usage_result.data else 0

        if current_calls >= rate_limit:
            raise HTTPException(429, "API rate limit exceeded. Resets at midnight UTC.")

        if usage_result.data:
            supabase.table("api_keys_daily_usage").update({"calls": current_calls + 1}).eq(
                "key_id", key_id
            ).eq("date", today).execute()
        else:
            supabase.table("api_keys_daily_usage").insert(
                {"key_id": key_id, "date": today, "calls": 1}
            ).execute()

        supabase.table("api_keys").update(
            {"last_used_at": datetime.datetime.utcnow().isoformat() + "Z"}
        ).eq("id", key_id).execute()

    except HTTPException:
        raise
    except Exception as e:
        logger.warning("api_key.rate_limit_check_failed", key_id=key_id, error=str(e))
        # Fail open — don't block valid calls if rate-limit table is unavailable

    return JWTUser(id=user_id, email="")
