import datetime
import json
import time
from datetime import timedelta
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
            .select(
                "id, email, trial_started_at, subscription_status, subscription_tier"
            )
            .eq("id", user_id)
            .single()
            .execute()
        )
        return result.data or {}
    except Exception:
        return {}


def _parse_iso_dt(val: str) -> datetime.datetime | None:
    try:
        dt = datetime.datetime.fromisoformat(val.replace("Z", "+00:00"))
    except Exception:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=datetime.UTC)
    return dt


def _trial_active_from_profile(profile: dict) -> tuple[bool, int]:
    """
    Returns (is_active, days_remaining). Trial is active if now < started + 14 days.
    days_remaining is clamped to [0..14].
    """
    trial_started_at = profile.get("trial_started_at")
    if not trial_started_at:
        return (False, 0)
    started = _parse_iso_dt(str(trial_started_at))
    if not started:
        return (False, 0)
    now = datetime.datetime.now(datetime.UTC)
    trial_end = started + timedelta(days=14)
    if now >= trial_end:
        return (False, 0)
    remaining = int((trial_end - now).total_seconds() // 86400) + 1
    return (True, max(0, min(14, remaining)))


async def is_trial_active(user_id: str) -> bool:
    profile = fetch_user_profile(user_id)
    active, _ = _trial_active_from_profile(profile)
    return active


def _ensure_trial_started_at(user: JWTUser) -> None:
    """
    On first authenticated request, start the 14-day trial if missing.
    Best-effort: never blocks the request path.
    """
    try:
        profile = fetch_user_profile(user.id)
        if profile.get("trial_started_at"):
            return
        if str(profile.get("subscription_status") or "").lower() == "active":
            return
        now = datetime.datetime.now(datetime.UTC).isoformat()
        supabase.table("user_profiles").upsert(
            {
                "id": user.id,
                "email": profile.get("email") or user.email,
                "trial_started_at": now,
                "subscription_status": "trial",
            },
            on_conflict="id",
        ).execute()
        invalidate_subscription_cache(user.id)
    except Exception:
        return


def get_subscription_status(user_id: str) -> dict:
    # Check cache first
    cached = _sub_cache.get(user_id)
    if cached is not None:
        status_dict, expires_at = cached
        if time.monotonic() < expires_at:
            return status_dict

    profile = fetch_user_profile(user_id)
    status_val = (profile.get("subscription_status") or "trial").lower()

    trial_active, days_remaining = _trial_active_from_profile(profile)
    if trial_active:
        # Trial users get full Advisor-tier access.
        result = {
            "status": "trial",
            "days_remaining": days_remaining,
            "tier": "advisor",
        }
        _sub_cache[user_id] = (result, time.monotonic() + _SUB_CACHE_TTL)
        return result

    if status_val == "active":
        tier = (profile.get("subscription_tier") or "").lower() or "free"
        result = {"status": "active", "tier": tier}
        _sub_cache[user_id] = (result, time.monotonic() + _SUB_CACHE_TTL)
        return result
    result = {"status": "expired", "days_remaining": 0}
    _sub_cache[user_id] = (result, time.monotonic() + _SUB_CACHE_TTL)
    return result


def require_active_subscription(user: JWTUser | None = None) -> JWTUser:
    if user is None:
        raise HTTPException(status_code=401, detail="Missing user")
    sub = get_subscription_status(user.id)
    if sub.get("status") == "expired":
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
        _ensure_trial_started_at(user)
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
        user = await verify_jwt(token)
        _ensure_trial_started_at(user)
        return user
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


def _truthy_is_admin(val) -> bool:
    """Treat DB / JSON variants as admin (bool, int, string)."""
    if val is True:
        return True
    if isinstance(val, int | float) and val:
        return True
    if isinstance(val, str) and val.strip().lower() in ("true", "1", "yes", "t"):
        return True
    return False


def _has_admin_access(
    row: dict | None, email: str | None, admin_emails: frozenset[str]
) -> bool:
    role = str((row or {}).get("role") or "").strip().lower()
    normalized_email = str(email or "").strip().lower()
    return (
        _truthy_is_admin((row or {}).get("is_admin"))
        or role == "admin"
        or (normalized_email and normalized_email in admin_emails)
    )


async def get_admin_user(user: JWTUser = Depends(get_current_user)) -> JWTUser:
    """
    FastAPI dependency that requires a valid JWT AND admin access in user_profiles.
    Falls back to ADMIN_EMAILS env var allowlist before raising 403.
    """
    from core.config import settings  # local import avoids circular

    # Fast path: email allowlist from env var (overrides DB state)
    if user.email and user.email.strip().lower() in settings.admin_emails_set:
        return user

    try:
        result = (
            supabase.table("user_profiles")
            .select("is_admin, role")
            .eq("id", user.id)
            .limit(1)
            .execute()
        )
        row = result.data[0] if result.data else {}
    except Exception:
        row = {}

    if not _has_admin_access(row, user.email, settings.admin_emails_set):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required.",
        )
    return user


async def get_ops_user(user: JWTUser = Depends(get_current_user)) -> JWTUser:
    """
    Internal ops: advisors OR admins (for legacy /dashboard/admin + shared list APIs).
    Falls back to ADMIN_EMAILS env var allowlist before raising 403.
    """
    from core.config import settings  # local import avoids circular

    # Fast path: email allowlist from env var
    if user.email and user.email.strip().lower() in settings.admin_emails_set:
        return user

    try:
        result = (
            supabase.table("user_profiles")
            .select("is_admin, role")
            .eq("id", user.id)
            .limit(1)
            .execute()
        )
        row = result.data[0] if result.data else {}
    except Exception:
        row = {}
    role = (row.get("role") or "").strip().lower()
    if (
        _has_admin_access(row, user.email, settings.admin_emails_set)
        or role == "advisor"
    ):
        return user
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Advisor or admin access required.",
    )
