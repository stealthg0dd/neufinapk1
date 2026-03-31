import datetime

from fastapi import HTTPException, Request, status

from database import supabase
from services.jwt_auth import JWTUser, verify_jwt

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
                return {"status": "trial", "days_remaining": days_remaining}
        except Exception:  # noqa: S110
            pass  # malformed date — fall through to expired
    if status_val == "active":
        return {"status": "active"}
    return {"status": "expired", "days_remaining": 0}


def require_active_subscription(user: JWTUser | None = None) -> JWTUser:
    if user is None:
        raise HTTPException(status_code=401, detail="Missing user")
    sub = get_subscription_status(user.id)
    if sub["status"] == "expired":
        raise HTTPException(
            status_code=402,
            detail={"code": "SUBSCRIPTION_REQUIRED", "message": "Trial expired. Subscribe to continue."},
        )
    return user


# ── Auth dependencies ───────────────────────────────────────────────────────────

def _extract_bearer_token(request: Request) -> str | None:
    auth = request.headers.get("Authorization")
    if not auth:
        return None
    if not auth.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid auth header",
        )
    return auth.split(" ", 1)[1]


async def get_current_user(request: Request) -> JWTUser:
    token = _extract_bearer_token(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing auth token",
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
    token = _extract_bearer_token(request)
    if not token:
        return None
    try:
        return await verify_jwt(token)
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        ) from err
