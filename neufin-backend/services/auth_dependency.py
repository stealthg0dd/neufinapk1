import datetime
import json
import time
from urllib.parse import unquote

from fastapi import Depends, HTTPException, Request, status

from database import supabase
from services.jwt_auth import JWTUser, verify_jwt

# ── Subscription cache ─────────────────────────────────────────────────────────
# Per-user in-memory cache: {user_id: (status_dict, expires_at)}
_sub_cache: dict[str, tuple[dict, float]] = {}
_SUB_CACHE_TTL = 60.0  # seconds


def invalidate_subscription_cache(user_id: str) -> None:
    """Remove a user's cached subscription status (call after Stripe webhook)."""
    _sub_cache.pop(user_id, None)


# ── Subscription helpers ────────────────────────────────────────────────────────


def fetch_user_profile(user_id: str) -> dict:
    try:
        result = (
            supabase.table("user_profiles")
            .select("id, trial_started_at, subscription_status")
            .eq("id", user_id)
            .single()
            .execute()
        )
        return result.data or {}
    except Exception:
        return {}


def get_subscription_status(user_id: str) -> dict:
    # Check cache first
    cached = _sub_cache.get(user_id)
    if cached is not None:
        status_dict, expires_at = cached
        if time.monotonic() < expires_at:
            return status_dict

    profile = fetch_user_profile(user_id)
    trial_started_at = profile.get("trial_started_at")
    status_val = profile.get("subscription_status", "trial")
    if trial_started_at:
        try:
            started = datetime.datetime.fromisoformat(trial_started_at.replace("Z", "+00:00"))
            now = datetime.datetime.now(datetime.UTC)
            trial_days = (now - started).days
            if trial_days <= 14:
                days_remaining = 14 - trial_days
                result = {"status": "trial", "days_remaining": days_remaining}
                _sub_cache[user_id] = (result, time.monotonic() + _SUB_CACHE_TTL)
                return result
        except Exception:  # noqa: S110
            pass  # malformed date — fall through to expired
    if status_val == "active":
        result = {"status": "active"}
        _sub_cache[user_id] = (result, time.monotonic() + _SUB_CACHE_TTL)
        return result
    result = {"status": "expired", "days_remaining": 0}
    _sub_cache[user_id] = (result, time.monotonic() + _SUB_CACHE_TTL)
    return result


def require_active_subscription(user: JWTUser | None = None) -> JWTUser:
    if user is None:
        raise HTTPException(status_code=401, detail="Missing user")
    sub = get_subscription_status(user.id)
    if sub["status"] == "expired":
        raise HTTPException(
            status_code=402,
            detail={
                "code": "SUBSCRIPTION_REQUIRED",
                "message": "Trial expired. Subscribe to continue.",
            },
        )
    return user


# ── Auth dependencies ───────────────────────────────────────────────────────────
def _extract_cookie_token(raw: str | None) -> str | None:
    """Extract a usable JWT from common Supabase cookie formats."""
    if not raw:
        return None

    token = unquote(raw).strip().strip('"').strip("'")
    if not token:
        return None

    if token.startswith("Bearer "):
        return token.split(" ", 1)[1].strip() or None

    if token.startswith("{") or token.startswith("["):
        try:
            parsed = json.loads(token)
        except Exception:
            parsed = None

        if isinstance(parsed, dict):
            for key in ("access_token", "token"):
                candidate = parsed.get(key)
                if isinstance(candidate, str) and candidate.strip():
                    return candidate.strip()
        elif isinstance(parsed, list):
            for item in parsed:
                if isinstance(item, str) and item.strip():
                    return item.strip()
                if isinstance(item, dict):
                    candidate = item.get("access_token") or item.get("token")
                    if isinstance(candidate, str) and candidate.strip():
                        return candidate.strip()

    return token or None


def _extract_request_token(request: Request, strict_header: bool) -> str | None:
    auth_header = request.headers.get("Authorization")
    if auth_header:
        if auth_header.startswith("Bearer "):
            return auth_header.split(" ", 1)[1].strip() or None
        if strict_header:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid auth header",
            )

    for cookie_name in ("sb-access-token", "neufin-auth"):
        token = _extract_cookie_token(request.cookies.get(cookie_name))
        if token:
            return token

    return None


async def get_current_user(request: Request) -> JWTUser:
    token = _extract_request_token(request, strict_header=True)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
        )
    try:
        user = await verify_jwt(token)
        return user
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        ) from err


async def get_optional_user(request: Request) -> JWTUser | None:
    token = _extract_request_token(request, strict_header=False)
    if not token:
        return None
    try:
        return await verify_jwt(token)
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        ) from err


async def get_subscribed_user(user: JWTUser = Depends(get_current_user)) -> JWTUser:
    """
    FastAPI dependency that requires both a valid JWT AND an active/trial subscription.
    Use on advisor-only endpoints that require a paid or trial account.
    """
    return require_active_subscription(user)
