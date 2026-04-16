"""
Admin Router — Internal NeuFin admin portal + legacy advisor ops
-----------------------------------------------------------------
Ops (advisor OR is_admin):
  GET  /api/admin/users
  POST /api/admin/users/{user_id}/extend-trial
  POST /api/admin/users/{user_id}/resend-onboarding

Admin only (is_admin):
  GET  /api/admin/access
  GET  /api/admin/dashboard
  POST /api/admin/users/{user_id}/plan
  POST /api/admin/users/{user_id}/suspend
  DELETE /api/admin/users/{user_id}
  GET  /api/admin/partners
  POST /api/admin/partners/{partner_id}/rotate-key
  GET  /api/admin/revenue
  GET  /api/admin/api-keys
  GET  /api/admin/reports
  GET  /api/admin/system
  GET  /api/admin/partners/{partner_id}/usage
"""

from __future__ import annotations

import calendar
import datetime
import hashlib
import secrets
from typing import Any

import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from core.config import settings
from database import supabase
from services import market_cache
from services.auth_dependency import (
    get_admin_user,
    get_ops_user,
    invalidate_subscription_cache,
)
from services.jwt_auth import JWTUser
from services.request_metrics import http_stats_last_hours

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="", tags=["admin"])


# ── Request models ─────────────────────────────────────────────────────────────


class ExtendTrialRequest(BaseModel):
    days: int = Field(..., ge=1, le=365)


class PlanChangeRequest(BaseModel):
    subscription_tier: str | None = None
    subscription_status: str | None = None


class SuspendUserRequest(BaseModel):
    unsuspend: bool = False


# ── Helpers ──────────────────────────────────────────────────────────────────


def _hash_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode()).hexdigest()


def _trial_end_iso(trial_started_at: str | None) -> datetime.datetime | None:
    if not trial_started_at:
        return None
    try:
        started = datetime.datetime.fromisoformat(
            trial_started_at.replace("Z", "+00:00")
        )
        return started + datetime.timedelta(days=14)
    except Exception:
        return None


def _count_profiles_where(
    filters: list[tuple[str, Any]],
) -> int:
    q = supabase.table("user_profiles").select("id", count="exact")
    for col, val in filters:
        q = q.eq(col, val)
    try:
        r = q.execute()
        return int(r.count or 0)
    except Exception:
        return 0


def _count_profiles_since(since_iso: str) -> int:
    try:
        r = (
            supabase.table("user_profiles")
            .select("id", count="exact")
            .gte("created_at", since_iso)
            .execute()
        )
        return int(r.count or 0)
    except Exception:
        return 0


def _count_table_since(table: str, since_iso: str, date_col: str = "created_at") -> int:
    try:
        r = (
            supabase.table(table)
            .select("id", count="exact")
            .gte(date_col, since_iso)
            .execute()
        )
        return int(r.count or 0)
    except Exception:
        return 0


def _daily_series_for_month(table: str, days: int = 14) -> list[int]:
    """Last `days` calendar days UTC, count rows per day (best-effort)."""
    out: list[int] = []
    now = datetime.datetime.now(datetime.UTC).date()
    for i in range(days - 1, -1, -1):
        day = now - datetime.timedelta(days=i)
        start = datetime.datetime.combine(day, datetime.time.min, tzinfo=datetime.UTC)
        end = start + datetime.timedelta(days=1)
        try:
            r = (
                supabase.table(table)
                .select("id", count="exact")
                .gte("created_at", start.isoformat())
                .lt("created_at", end.isoformat())
                .execute()
            )
            out.append(int(r.count or 0))
        except Exception as exc:
            logger.debug("admin.daily_series.day", table=table, error=str(exc))
            out.append(0)
    return out


def _delta_pct(current: float, previous: float) -> float | None:
    if previous <= 0:
        return None if current == 0 else 100.0
    return round((current - previous) / previous * 100.0, 1)


# ── Dashboard ────────────────────────────────────────────────────────────────


@router.get("/api/admin/access")
async def admin_access(_user: JWTUser = Depends(get_admin_user)):
    return {"ok": True}


@router.get("/api/admin/dashboard")
async def admin_dashboard(_user: JWTUser = Depends(get_admin_user)):
    now = datetime.datetime.now(datetime.UTC)
    d30 = (now - datetime.timedelta(days=30)).isoformat()
    d60 = (now - datetime.timedelta(days=60)).isoformat()
    month_start = datetime.datetime(
        now.year, now.month, 1, tzinfo=datetime.UTC
    ).isoformat()

    total_users = _count_profiles_where([])
    trials = _count_profiles_where([("subscription_status", "trial")])
    paying = _count_profiles_where([("subscription_status", "active")])
    expired = _count_profiles_where([("subscription_status", "expired")])
    suspended = _count_profiles_where([("subscription_status", "suspended")])

    new_users_30 = _count_profiles_since(d30)
    new_users_prev_30 = 0
    try:
        r = (
            supabase.table("user_profiles")
            .select("id", count="exact")
            .gte("created_at", d60)
            .lt("created_at", d30)
            .execute()
        )
        new_users_prev_30 = int(r.count or 0)
    except Exception as exc:
        logger.debug("admin.dashboard.prev_users_window", error=str(exc))

    # API partners: distinct users with at least one api_keys row
    api_partner_ids: set[str] = set()
    try:
        keys_res = supabase.table("api_keys").select("user_id").execute()
        for row in keys_res.data or []:
            uid = row.get("user_id")
            if uid:
                api_partner_ids.add(str(uid))
    except Exception as exc:
        logger.debug("admin.dashboard.api_partner_ids", error=str(exc))
    api_partners = len(api_partner_ids)
    active_api_keys = 0
    try:
        r = (
            supabase.table("api_keys")
            .select("id", count="exact")
            .eq("is_active", True)
            .execute()
        )
        active_api_keys = int(r.count or 0)
    except Exception as exc:
        logger.debug("admin.dashboard.active_api_keys", error=str(exc))

    analyses_month = _count_table_since("dna_scores", month_start)
    d30_dna = _count_table_since("dna_scores", d30)
    d60_dna = _count_table_since("dna_scores", d60)
    analyses_prev_30 = max(0, d60_dna - d30_dna)

    reports_month = 0
    reports_7d = 0
    for tbl in ("advisor_reports", "swarm_reports"):
        try:
            reports_month += _count_table_since(tbl, month_start)
            reports_7d += _count_table_since(
                tbl, (now - datetime.timedelta(days=7)).isoformat()
            )
        except Exception as exc:
            logger.debug(
                "admin.dashboard.reports_month_table", table=tbl, error=str(exc)
            )
            continue

    # Sparklines (14d new users + dna_scores as activity proxy)
    spark_users = _daily_series_for_month("user_profiles", 14)
    spark_dna = _daily_series_for_month("dna_scores", 14)

    return {
        "generated_at": now.isoformat(),
        "cards": {
            "total_users": {
                "value": total_users,
                "delta_pct": _delta_pct(float(new_users_30), float(new_users_prev_30)),
                "sparkline": spark_users,
            },
            "active_trials": {
                "value": trials,
                "delta_pct": None,
                "sparkline": spark_users,
            },
            "paying_mrr_proxy": {
                "value": paying,
                "subtitle": "subscription_status=active",
                "delta_pct": None,
                "sparkline": spark_users,
            },
            "expired_users": {
                "value": expired,
                "delta_pct": None,
                "sparkline": spark_users,
            },
            "suspended_users": {
                "value": suspended,
                "delta_pct": None,
                "sparkline": spark_users,
            },
            "api_partners": {
                "value": api_partners,
                "delta_pct": None,
                "sparkline": [0] * 14,
            },
            "active_api_keys": {
                "value": active_api_keys,
                "delta_pct": None,
                "sparkline": [0] * 14,
            },
            "analyses_this_month": {
                "value": analyses_month,
                "delta_pct": _delta_pct(
                    float(d30_dna), float(max(analyses_prev_30, 1))
                ),
                "sparkline": spark_dna,
            },
            "reports_generated_this_month": {
                "value": reports_month,
                "subtitle": f"{reports_7d} in last 7d",
                "delta_pct": None,
                "sparkline": spark_dna,
            },
        },
        "sql_hints": {
            "trials": trials,
            "paying": paying,
            "expired": expired,
            "suspended": suspended,
            "new_users_30d": new_users_30,
        },
    }


# ── Users ────────────────────────────────────────────────────────────────────


@router.get("/api/admin/users")
async def list_users(
    plan: str | None = None,
    search: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: JWTUser = Depends(get_ops_user),
):
    """
    Paginated user list for admin + advisor ops consoles.
    """
    try:
        query = supabase.table("user_profiles").select(
            "id, email, advisor_name, display_name, firm_name, subscription_status, "
            "subscription_tier, trial_started_at, created_at, last_sign_in_at, role"
        )
        if plan and plan != "all":
            query = query.eq("subscription_status", plan)
        query = query.order("created_at", desc=True)
        if search and search.strip():
            query = query.limit(500)
        else:
            query = query.range(offset, offset + limit - 1)
        profiles_result = query.execute()
        profiles = profiles_result.data or []
    except Exception as exc:
        logger.error("admin.list_users.profiles_failed", error=str(exc))
        raise HTTPException(500, f"Failed to fetch user profiles: {exc}") from exc

    if search and search.strip():
        q = search.strip().lower()
        profiles = [
            p
            for p in profiles
            if q in (p.get("email") or "").lower()
            or q in (p.get("advisor_name") or "").lower()
            or q in (p.get("display_name") or "").lower()
            or q in (p.get("firm_name") or "").lower()
        ]
        profiles = profiles[offset : offset + limit]

    if not profiles:
        return {"items": [], "offset": offset, "limit": limit}

    user_ids = [p["id"] for p in profiles]

    dna_counts: dict[str, int] = {}
    report_counts: dict[str, int] = {}
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

    items = []
    for p in profiles:
        tid = p["id"]
        trial_end = _trial_end_iso(p.get("trial_started_at"))
        items.append(
            {
                "id": tid,
                "email": p.get("email") or "",
                "name": p.get("advisor_name")
                or p.get("display_name")
                or p.get("email")
                or "",
                "firm_name": p.get("firm_name"),
                "plan": p.get("subscription_tier") or "—",
                "status": p.get("subscription_status"),
                "subscription_status": p.get("subscription_status"),
                "subscription_tier": p.get("subscription_tier"),
                "trial_started_at": p.get("trial_started_at"),
                "trial_ends_at": trial_end.isoformat() if trial_end else None,
                "analyses_used": dna_counts.get(tid, 0),
                "dna_score_count": dna_counts.get(tid, 0),
                "reports_purchased": report_counts.get(tid, 0),
                "last_active_at": p.get("last_sign_in_at"),
                "last_sign_in_at": p.get("last_sign_in_at"),
                "created_at": p.get("created_at"),
                "role": p.get("role"),
            }
        )

    return {"items": items, "offset": offset, "limit": limit}


@router.get("/api/admin/users/{user_id}")
async def get_user_detail(
    user_id: str,
    _admin: JWTUser = Depends(get_admin_user),
):
    """Single user row for admin detail page."""
    try:
        r = (
            supabase.table("user_profiles")
            .select(
                "id, email, advisor_name, display_name, firm_name, subscription_status, "
                "subscription_tier, trial_started_at, created_at, last_sign_in_at, role"
            )
            .eq("id", user_id)
            .single()
            .execute()
        )
        p = r.data or {}
    except Exception as exc:
        raise HTTPException(404, "User not found") from exc
    if not p.get("id"):
        raise HTTPException(404, "User not found")
    trial_end = _trial_end_iso(p.get("trial_started_at"))
    dna_score_count = 0
    reports_purchased = 0
    try:
        dna_result = (
            supabase.table("dna_scores")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .execute()
        )
        dna_score_count = int(dna_result.count or 0)
    except Exception as exc:
        logger.debug(
            "admin.user_detail.dna_count_failed", user_id=user_id, error=str(exc)
        )
    try:
        reports_result = (
            supabase.table("advisor_reports")
            .select("id", count="exact")
            .eq("advisor_id", user_id)
            .eq("is_paid", True)
            .execute()
        )
        reports_purchased = int(reports_result.count or 0)
    except Exception as exc:
        logger.debug(
            "admin.user_detail.report_count_failed", user_id=user_id, error=str(exc)
        )
    return {
        "id": p["id"],
        "email": p.get("email") or "",
        "name": p.get("advisor_name") or p.get("display_name") or "",
        "firm_name": p.get("firm_name"),
        "subscription_status": p.get("subscription_status"),
        "subscription_tier": p.get("subscription_tier"),
        "trial_started_at": p.get("trial_started_at"),
        "trial_ends_at": trial_end.isoformat() if trial_end else None,
        "created_at": p.get("created_at"),
        "last_sign_in_at": p.get("last_sign_in_at"),
        "role": p.get("role"),
        "dna_score_count": dna_score_count,
        "reports_purchased": reports_purchased,
    }


@router.post("/api/admin/users/{user_id}/extend-trial")
async def extend_trial(
    user_id: str,
    body: ExtendTrialRequest,
    user: JWTUser = Depends(get_ops_user),
):
    now = datetime.datetime.now(datetime.UTC)
    new_start = now + datetime.timedelta(days=body.days - 14)
    new_start_iso = new_start.isoformat()
    new_trial_ends = (now + datetime.timedelta(days=body.days)).date().isoformat()

    try:
        supabase.table("user_profiles").update(
            {"trial_started_at": new_start_iso, "subscription_status": "trial"}
        ).eq("id", user_id).execute()
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
    user: JWTUser = Depends(get_ops_user),
):
    try:
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

    logger.info("admin.resend_onboarding.queued", user_id=user_id)
    return {"ok": True, "queued": True}


@router.post("/api/admin/users/{user_id}/plan")
async def change_user_plan(
    user_id: str,
    body: PlanChangeRequest,
    _admin: JWTUser = Depends(get_admin_user),
):
    if not body.subscription_tier and not body.subscription_status:
        raise HTTPException(400, "Provide subscription_tier and/or subscription_status")

    patch: dict[str, Any] = {}
    if body.subscription_tier is not None:
        patch["subscription_tier"] = body.subscription_tier
    if body.subscription_status is not None:
        patch["subscription_status"] = body.subscription_status

    try:
        supabase.table("user_profiles").update(patch).eq("id", user_id).execute()
    except Exception as exc:
        raise HTTPException(500, f"Failed to update plan: {exc}") from exc

    invalidate_subscription_cache(user_id)
    return {"ok": True, "updated": patch}


@router.post("/api/admin/users/{user_id}/suspend")
async def suspend_user(
    user_id: str,
    body: SuspendUserRequest,
    _admin: JWTUser = Depends(get_admin_user),
):
    try:
        profile_result = (
            supabase.table("user_profiles")
            .select("subscription_tier, trial_started_at")
            .eq("id", user_id)
            .single()
            .execute()
        )
        profile = profile_result.data or {}
    except Exception as exc:
        raise HTTPException(404, "User not found") from exc

    status_value = "suspended"
    if body.unsuspend:
        trial_end = _trial_end_iso(profile.get("trial_started_at"))
        now = datetime.datetime.now(datetime.UTC)
        if trial_end and now < trial_end:
            status_value = "trial"
        elif str(profile.get("subscription_tier") or "").strip().lower() in {
            "retail",
            "advisor",
            "enterprise",
            "unlimited",
        }:
            status_value = "active"
        else:
            status_value = "expired"
    try:
        supabase.table("user_profiles").update(
            {"subscription_status": status_value}
        ).eq("id", user_id).execute()
    except Exception as exc:
        raise HTTPException(500, f"Failed to suspend: {exc}") from exc
    invalidate_subscription_cache(user_id)
    return {"ok": True, "subscription_status": status_value}


@router.post("/api/admin/users/{user_id}/reset-password")
async def admin_reset_password_link(
    user_id: str,
    _admin: JWTUser = Depends(get_admin_user),
):
    """Return a one-time Supabase recovery link for the user (admin tooling)."""
    try:
        pr = (
            supabase.table("user_profiles")
            .select("email")
            .eq("id", user_id)
            .single()
            .execute()
        )
        email = (pr.data or {}).get("email")
    except Exception as exc:
        raise HTTPException(404, "User not found") from exc
    if not email:
        raise HTTPException(404, "No email on profile")
    try:
        link = supabase.auth.admin.generate_link(
            {"type": "recovery", "email": str(email)}
        )
        props = getattr(link, "properties", None) or {}
        if isinstance(props, dict):
            action_link = props.get("action_link") or props.get("href")
        else:
            action_link = getattr(props, "action_link", None) or getattr(
                props, "href", None
            )
        return {"ok": True, "action_link": action_link}
    except Exception as exc:
        logger.warning("admin.reset_password.failed", user_id=user_id, error=str(exc))
        raise HTTPException(500, f"Could not generate link: {exc}") from exc


@router.delete("/api/admin/users/{user_id}")
async def delete_user(user_id: str, _admin: JWTUser = Depends(get_admin_user)):
    """
    Delete the Supabase Auth user via the Admin REST API (SDK-neutral),
    then best-effort remove ``user_profiles``.
    """
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(500, "Supabase admin is not configured.")

    url = f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/admin/users/{user_id}"
    headers = {
        "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
    }
    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            resp = await client.delete(url, headers=headers)
        if resp.status_code not in (200, 204):
            logger.error(
                "admin.delete_user.auth_failed",
                user_id=user_id,
                status=resp.status_code,
                body=resp.text[:400],
            )
            raise HTTPException(
                status_code=500,
                detail=f"Auth delete failed ({resp.status_code}): {resp.text[:200]}",
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(
            "admin.delete_user.request_failed", user_id=user_id, error=str(exc)
        )
        raise HTTPException(500, f"Failed to delete user: {exc}") from exc

    try:
        supabase.table("user_profiles").delete().eq("id", user_id).execute()
    except Exception as exc:
        logger.debug(
            "admin.delete_user.profile_cleanup",
            user_id=user_id,
            error=str(exc),
        )

    logger.info("admin.delete_user.ok", user_id=user_id)
    return {"ok": True, "deleted": user_id}


# ── Partners (B2B / API key holders) ───────────────────────────────────────────


@router.get("/api/admin/partners")
async def list_partners(_admin: JWTUser = Depends(get_admin_user)):
    """
    Users with API keys — B2B-style partner list with usage from api_keys_daily_usage.
    """
    try:
        keys_res = (
            supabase.table("api_keys")
            .select(
                "id, user_id, key_prefix, name, plan, is_active, last_used_at, "
                "rate_limit_per_day, created_at, revoked_at"
            )
            .execute()
        )
        keys = keys_res.data or []
    except Exception as exc:
        logger.error("admin.partners.keys_failed", error=str(exc))
        return {
            "partners": [],
            "warning": "Could not load api_keys (schema, RLS, or connectivity).",
        }

    user_ids = list({str(k["user_id"]) for k in keys if k.get("user_id")})
    profiles: dict[str, dict] = {}
    if user_ids:
        try:
            prof_res = (
                supabase.table("user_profiles")
                .select(
                    "id, email, advisor_name, firm_name, subscription_tier, "
                    "subscription_status, stripe_customer_id"
                )
                .in_("id", user_ids)
                .execute()
            )
            for row in prof_res.data or []:
                profiles[str(row["id"])] = row
        except Exception as exc:
            logger.warning("admin.partners.profiles_failed", error=str(exc))

    since_30 = (
        datetime.datetime.now(datetime.UTC) - datetime.timedelta(days=30)
    ).date()
    usage_by_key: dict[str, int] = {}
    try:
        usage_res = (
            supabase.table("api_keys_daily_usage")
            .select("key_id, calls, date")
            .gte("date", since_30.isoformat())
            .execute()
        )
        for row in usage_res.data or []:
            kid = str(row.get("key_id") or "")
            usage_by_key[kid] = usage_by_key.get(kid, 0) + int(row.get("calls") or 0)
    except Exception as exc:
        logger.debug("admin.partners.usage_agg", error=str(exc))

    out = []
    for uid in user_ids:
        p = profiles.get(uid, {})
        partner_keys = [k for k in keys if str(k.get("user_id")) == uid]
        calls_30d = sum(usage_by_key.get(str(k["id"]), 0) for k in partner_keys)
        last_used = None
        for k in partner_keys:
            lu = k.get("last_used_at")
            if lu and (last_used is None or lu > last_used):
                last_used = lu

        health = "RED"
        if last_used:
            try:
                lu_dt = datetime.datetime.fromisoformat(
                    str(last_used).replace("Z", "+00:00")
                )
                if lu_dt.tzinfo is None:
                    lu_dt = lu_dt.replace(tzinfo=datetime.UTC)
                age = datetime.datetime.now(datetime.UTC) - lu_dt
                if age.days < 7:
                    health = "GREEN"
                elif age.days < 30:
                    health = "AMBER"
            except Exception as exc:
                logger.debug("admin.partners.health_parse", error=str(exc))
                health = "AMBER"

        out.append(
            {
                "id": uid,
                "firm": p.get("firm_name") or p.get("advisor_name") or p.get("email"),
                "contact_email": p.get("email"),
                "plan": (partner_keys[0].get("plan") if partner_keys else None)
                or p.get("subscription_tier"),
                "api_calls_30d": calls_30d,
                "mrr_usd": None,
                "status": p.get("subscription_status"),
                "integration_health": health,
                "last_used_at": last_used,
                "stripe_customer_id": p.get("stripe_customer_id"),
                "active_keys": sum(1 for k in partner_keys if k.get("is_active")),
                "total_keys": len(partner_keys),
            }
        )

    out.sort(key=lambda x: x["api_calls_30d"], reverse=True)
    return {"partners": out}


@router.get("/api/admin/partners/{partner_id}/usage")
async def partner_usage_detail(
    partner_id: str,
    days: int = Query(30, ge=7, le=120),
    _admin: JWTUser = Depends(get_admin_user),
):
    """Daily API calls per key + total for one partner (``user_id`` on ``api_keys``)."""
    try:
        keys_res = (
            supabase.table("api_keys")
            .select("id, key_prefix, name, is_active, created_at")
            .eq("user_id", partner_id)
            .execute()
        )
        keys = keys_res.data or []
    except Exception as exc:
        raise HTTPException(500, f"Failed to list keys: {exc}") from exc

    if not keys:
        return {
            "partner_id": partner_id,
            "days": days,
            "keys": [],
            "daily_totals": [],
        }

    key_ids = [str(k["id"]) for k in keys if k.get("id")]
    since = (datetime.datetime.now(datetime.UTC) - datetime.timedelta(days=days)).date()

    try:
        usage_res = (
            supabase.table("api_keys_daily_usage")
            .select("key_id, date, calls")
            .in_("key_id", key_ids)
            .gte("date", since.isoformat())
            .order("date", desc=False)
            .execute()
        )
        usage_rows = usage_res.data or []
    except Exception as exc:
        logger.warning("admin.partner_usage.usage_failed", error=str(exc))
        usage_rows = []

    daily_totals: dict[str, int] = {}
    per_key: dict[str, dict[str, int]] = {kid: {} for kid in key_ids}
    for row in usage_rows:
        kid = str(row.get("key_id") or "")
        d = str(row.get("date") or "")
        c = int(row.get("calls") or 0)
        daily_totals[d] = daily_totals.get(d, 0) + c
        if kid in per_key:
            per_key[kid][d] = per_key[kid].get(d, 0) + c

    daily_series = [
        {"date": d, "calls": daily_totals[d]} for d in sorted(daily_totals.keys())
    ]

    key_payload = []
    for k in keys:
        kid = str(k["id"])
        prefix = k.get("key_prefix") or k.get("name") or kid[:8]
        series = [
            {"date": d, "calls": per_key.get(kid, {}).get(d, 0)}
            for d in sorted(per_key.get(kid, {}).keys())
        ]
        key_payload.append(
            {
                "id": kid,
                "key_masked": f"{str(prefix)[:12]}…",
                "name": k.get("name"),
                "is_active": k.get("is_active"),
                "daily": series,
            }
        )

    return {
        "partner_id": partner_id,
        "days": days,
        "keys": key_payload,
        "daily_totals": daily_series,
    }


@router.post("/api/admin/partners/{partner_id}/rotate-key")
async def rotate_partner_key(
    partner_id: str,
    _admin: JWTUser = Depends(get_admin_user),
):
    """Revoke active keys for partner (user) and issue one new enterprise key."""
    raw_key = f"nf_{secrets.token_urlsafe(32)}"
    key_hash = _hash_key(raw_key)
    prefix = raw_key[:14] if len(raw_key) >= 14 else raw_key

    try:
        supabase.table("api_keys").update(
            {
                "is_active": False,
                "revoked_at": datetime.datetime.now(datetime.UTC).isoformat(),
            }
        ).eq("user_id", partner_id).eq("is_active", True).execute()
    except Exception as exc:
        logger.warning("admin.rotate_key.revoke_failed", error=str(exc))

    try:
        ins = (
            supabase.table("api_keys")
            .insert(
                {
                    "user_id": partner_id,
                    "key_hash": key_hash,
                    "key_prefix": prefix,
                    "name": "admin-rotated",
                    "plan": "enterprise",
                    "is_active": True,
                    "rate_limit_per_day": 100000,
                }
            )
            .execute()
        )
        record = ins.data[0] if ins.data else {}
    except Exception as exc:
        raise HTTPException(500, f"Failed to create key: {exc}") from exc

    logger.info("admin.rotate_key.ok", partner_id=partner_id, key_id=record.get("id"))
    return {
        "ok": True,
        "key": raw_key,
        "key_id": record.get("id"),
        "warning": "Store this key securely — it will not be shown again.",
    }


# ── API keys (global) ─────────────────────────────────────────────────────────


@router.get("/api/admin/api-keys")
async def list_all_api_keys(_admin: JWTUser = Depends(get_admin_user)):
    try:
        keys_res = (
            supabase.table("api_keys")
            .select(
                "id, user_id, key_prefix, name, plan, created_at, last_used_at, "
                "is_active, rate_limit_per_day, revoked_at"
            )
            .order("created_at", desc=True)
            .limit(500)
            .execute()
        )
        keys = keys_res.data or []
    except Exception as exc:
        logger.error("admin.api_keys.list_failed", error=str(exc))
        return {
            "keys": [],
            "warning": "Could not load api_keys (schema, RLS, or connectivity).",
        }

    user_ids = list({str(k["user_id"]) for k in keys if k.get("user_id")})
    email_map: dict[str, str] = {}
    if user_ids:
        try:
            prof = (
                supabase.table("user_profiles")
                .select("id, email, firm_name")
                .in_("id", user_ids)
                .execute()
            )
            for row in prof.data or []:
                email_map[str(row["id"])] = row.get("email") or ""
        except Exception as exc:
            logger.debug("admin.api_keys.email_map", error=str(exc))

    today = datetime.datetime.now(datetime.UTC).date().isoformat()
    month_start = datetime.datetime.now(datetime.UTC).replace(day=1).date().isoformat()

    rows = []
    for k in keys:
        kid = str(k["id"])
        uid = str(k.get("user_id") or "")
        calls_today = 0
        calls_month = 0
        try:
            u1 = (
                supabase.table("api_keys_daily_usage")
                .select("calls")
                .eq("key_id", kid)
                .eq("date", today)
                .limit(1)
                .execute()
            )
            if u1.data:
                calls_today = int(u1.data[0].get("calls") or 0)
            u2 = (
                supabase.table("api_keys_daily_usage")
                .select("calls, date")
                .eq("key_id", kid)
                .gte("date", month_start)
                .execute()
            )
            for r in u2.data or []:
                calls_month += int(r.get("calls") or 0)
        except Exception as exc:
            logger.debug("admin.api_keys.usage_row", key_id=kid, error=str(exc))

        prefix = k.get("key_prefix") or k.get("name") or "nf_••••"
        rows.append(
            {
                "id": kid,
                "partner_id": uid,
                "partner_email": email_map.get(uid),
                "key_masked": f"{str(prefix)[:12]}…",
                "created_at": k.get("created_at"),
                "last_used_at": k.get("last_used_at"),
                "calls_today": calls_today,
                "calls_month": calls_month,
                "status": "active" if k.get("is_active") else "revoked",
                "rate_limit_daily": k.get("rate_limit_per_day"),
                "plan": k.get("plan"),
            }
        )

    return {"keys": rows}


# ── Revenue (Stripe, read-only) ──────────────────────────────────────────────


@router.get("/api/admin/revenue")
async def admin_revenue(_admin: JWTUser = Depends(get_admin_user)):
    if not settings.STRIPE_SECRET_KEY:
        return {
            "configured": False,
            "message": "STRIPE_SECRET_KEY not set",
            "mrr_usd": 0,
            "series_12m": [],
        }

    import stripe

    stripe.api_key = settings.STRIPE_SECRET_KEY

    def _monthly_amount(sub_item) -> float:
        price = sub_item.get("price") or {}
        rec = price.get("recurring") or {}
        unit = (price.get("unit_amount") or 0) / 100.0
        qty = sub_item.get("quantity") or 1
        interval = rec.get("interval")
        ic = rec.get("interval_count") or 1
        if interval == "year":
            return unit * qty / 12.0
        if interval == "month":
            return unit * qty / float(ic)
        if interval == "week":
            return unit * qty * 4.33
        if interval == "day":
            return unit * qty * 30.0
        return unit * qty

    mrr_total = 0.0
    by_price: dict[str, float] = {}
    top_customers: dict[str, float] = {}

    try:
        subs = stripe.Subscription.list(status="active", limit=100)
        for sub in subs.auto_paging_iter():
            cid = sub.get("customer")
            cid_s = cid if isinstance(cid, str) else getattr(cid, "id", str(cid))
            sub_mrr = 0.0
            for item in (sub.get("items") or {}).get("data", []):
                amt = _monthly_amount(item)
                sub_mrr += amt
                pid = ((item.get("price") or {}).get("id")) or "unknown"
                by_price[pid] = by_price.get(pid, 0) + amt
            mrr_total += sub_mrr
            top_customers[cid_s] = top_customers.get(cid_s, 0) + sub_mrr
    except Exception as exc:
        logger.warning("admin.revenue.stripe_failed", error=str(exc))
        return {"configured": True, "error": str(exc), "mrr_usd": 0, "series_12m": []}

    # 12-month PaymentIntent cash (not same as MRR) for a simple line chart
    series_12m: list[dict[str, Any]] = []
    now = datetime.datetime.now(datetime.UTC)
    for i in range(11, -1, -1):
        y, m = now.year, now.month - i
        while m <= 0:
            m += 12
            y -= 1
        start = datetime.datetime(y, m, 1, tzinfo=datetime.UTC)
        last = calendar.monthrange(y, m)[1]
        end = datetime.datetime(y, m, last, 23, 59, 59, tzinfo=datetime.UTC)
        gte, lte = int(start.timestamp()), int(end.timestamp())
        month_cash = 0.0
        try:
            pis = stripe.PaymentIntent.list(created={"gte": gte, "lte": lte}, limit=100)
            for pi in pis.auto_paging_iter():
                if pi.get("status") == "succeeded":
                    month_cash += (pi.get("amount") or 0) / 100.0
        except Exception as exc:
            logger.debug("admin.revenue.pi_month", year=y, month=m, error=str(exc))
        series_12m.append({"year": y, "month": m, "cash_usd": round(month_cash, 2)})

    top10 = sorted(top_customers.items(), key=lambda x: x[1], reverse=True)[:10]

    # Trial conversion (profiles): started trial in window → now active
    def _conversion(days: int) -> dict[str, Any]:
        since = (now - datetime.timedelta(days=days)).isoformat()
        try:
            started = (
                supabase.table("user_profiles")
                .select("id", count="exact")
                .gte("trial_started_at", since)
                .execute()
            )
            denom = int(started.count or 0)
            conv = (
                supabase.table("user_profiles")
                .select("id", count="exact")
                .gte("trial_started_at", since)
                .eq("subscription_status", "active")
                .execute()
            )
            num = int(conv.count or 0)
        except Exception as exc:
            logger.debug("admin.revenue.trial_conversion", days=days, error=str(exc))
            denom, num = 0, 0
        rate = round(num / denom * 100.0, 1) if denom else None
        return {
            "window_days": days,
            "trials_started": denom,
            "now_active": num,
            "rate_pct": rate,
        }

    return {
        "configured": True,
        "mrr_usd": round(mrr_total, 2),
        "mrr_by_price_id": {k: round(v, 2) for k, v in by_price.items()},
        "series_12m": series_12m,
        "trial_conversion": {
            "30d": _conversion(30),
            "60d": _conversion(60),
            "90d": _conversion(90),
        },
        "top_partners_by_mrr": [
            {"stripe_customer_id": cid, "mrr_usd": round(amt, 2)} for cid, amt in top10
        ],
    }


# ── Reports log ────────────────────────────────────────────────────────────────


@router.get("/api/admin/reports")
async def admin_reports_log(
    limit: int = Query(80, ge=1, le=200),
    _admin: JWTUser = Depends(get_admin_user),
):
    rows: list[dict] = []
    for table, label in (
        ("advisor_reports", "advisor"),
        ("swarm_reports", "swarm"),
    ):
        try:
            r = (
                supabase.table(table)
                .select("id, created_at, advisor_id, user_id, is_paid")
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
            )
            for row in r.data or []:
                row = dict(row)
                row["source"] = label
                rows.append(row)
        except Exception as exc:
            logger.debug("admin.reports.table_skip", table=table, error=str(exc))
            continue
    rows.sort(
        key=lambda x: str(x.get("created_at") or ""),
        reverse=True,
    )
    return {"reports": rows[:limit]}


# ── System ───────────────────────────────────────────────────────────────────


def _swarm_row_successful(row: dict) -> bool:
    h = row.get("headline")
    if not h or not str(h).strip():
        return False
    trace = row.get("agent_trace")
    if isinstance(trace, list):
        for step in trace:
            if isinstance(step, dict):
                st = str(step.get("status") or "").lower()
                if st in ("error", "failed"):
                    return False
    return True


def _swarm_agent_success_7d() -> dict[str, Any]:
    since = (
        datetime.datetime.now(datetime.UTC) - datetime.timedelta(days=7)
    ).isoformat()
    try:
        r = (
            supabase.table("swarm_reports")
            .select("headline, agent_trace")
            .gte("created_at", since)
            .limit(2500)
            .execute()
        )
        rows = [dict(x) for x in (r.data or [])]
    except Exception as exc:
        logger.debug("admin.system.swarm_success_query", error=str(exc))
        return {"sample_size": 0, "success_rate_pct": None}
    ok = sum(1 for row in rows if _swarm_row_successful(row))
    n = len(rows)
    return {
        "sample_size": n,
        "success_rate_pct": round(ok / n * 100.0, 1) if n else None,
    }


def _analytics_error_hint_24h() -> dict[str, Any]:
    """Heuristic: fraction of recent analytics event names that look like failures."""
    since = (
        datetime.datetime.now(datetime.UTC) - datetime.timedelta(hours=24)
    ).isoformat()
    try:
        r = (
            supabase.table("analytics_events")
            .select("event")
            .gte("created_at", since)
            .limit(4000)
            .execute()
        )
        events = [str((e or {}).get("event") or "") for e in (r.data or [])]
    except Exception as exc:
        logger.debug("admin.system.analytics_events", error=str(exc))
        return {"sample_size": 0, "error_rate_pct": None}
    n = len(events)
    if not n:
        return {"sample_size": 0, "error_rate_pct": None}
    err = 0
    for ev in events:
        el = ev.lower()
        if any(x in el for x in ("error", "fail", "exception", "denied")):
            err += 1
    return {
        "sample_size": n,
        "error_rate_pct": round(err / n * 100.0, 2),
    }


@router.get("/api/admin/system")
async def admin_system(_admin: JWTUser = Depends(get_admin_user)):
    redis_ok: bool | None = None
    if settings.REDIS_URL:
        try:
            import redis as redis_lib

            r = redis_lib.from_url(settings.REDIS_URL, socket_connect_timeout=1.0)
            redis_ok = bool(r.ping())
        except Exception as exc:
            logger.debug("admin.system.redis_ping", error=str(exc))
            redis_ok = False
    else:
        redis_ok = None

    supabase_ok = False
    try:
        supabase.table("user_profiles").select("id").limit(1).execute()
        supabase_ok = True
    except Exception as exc:
        logger.debug("admin.system.supabase_ping", error=str(exc))
        supabase_ok = False

    last_swarm = None
    try:
        r = (
            supabase.table("swarm_reports")
            .select("created_at")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if r.data:
            last_swarm = r.data[0].get("created_at")
    except Exception as exc:
        logger.debug("admin.system.last_swarm", error=str(exc))

    http_stats = http_stats_last_hours(24.0)
    swarm_stats = _swarm_agent_success_7d()
    analytics_stats = _analytics_error_hint_24h()

    try:
        active_jobs = await market_cache.count_active_swarm_jobs()
    except Exception as exc:
        logger.debug("admin.system.active_swarm_jobs", error=str(exc))
        active_jobs = 0

    return {
        "backend": {"status": "ok", "environment": settings.ENVIRONMENT},
        "supabase_connected": supabase_ok,
        "redis": redis_ok,
        "last_swarm_report_at": last_swarm,
        "agent_success_rate_7d": swarm_stats["success_rate_pct"],
        "agent_success_sample_size_7d": swarm_stats["sample_size"],
        "analytics_error_hint_rate_24h_pct": analytics_stats["error_rate_pct"],
        "analytics_events_sample_24h": analytics_stats["sample_size"],
        "http_error_rate_24h_pct": http_stats["error_rate_pct"],
        "http_request_sample_count_24h": http_stats["sample_count"],
        "active_swarm_jobs": active_jobs,
        "latency_p50_ms": http_stats["p50_ms"],
        "latency_p95_ms": http_stats["p95_ms"],
        "latency_p99_ms": http_stats["p99_ms"],
        "note": (
            "Latency and HTTP 5xx rate are from this API process only (in-memory ring buffer). "
            "Agent success uses swarm_reports rows from the last 7 days (headline + agent_trace). "
            "Analytics rate is a name-based heuristic on analytics_events."
        ),
    }


@router.post("/api/admin/api-keys/{key_id}/revoke")
async def revoke_api_key_admin(
    key_id: str,
    _admin: JWTUser = Depends(get_admin_user),
):
    try:
        supabase.table("api_keys").update(
            {
                "is_active": False,
                "revoked_at": datetime.datetime.now(datetime.UTC).isoformat(),
            }
        ).eq("id", key_id).execute()
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc
    return {"ok": True, "key_id": key_id}


class RateLimitBody(BaseModel):
    rate_limit_daily: int = Field(..., ge=1, le=1_000_000)


@router.patch("/api/admin/api-keys/{key_id}/rate-limit")
async def set_api_key_rate_limit(
    key_id: str,
    body: RateLimitBody,
    _admin: JWTUser = Depends(get_admin_user),
):
    try:
        supabase.table("api_keys").update(
            {"rate_limit_per_day": body.rate_limit_daily}
        ).eq("id", key_id).execute()
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc
    return {"ok": True, "key_id": key_id, "rate_limit_per_day": body.rate_limit_daily}


class IssueKeyBody(BaseModel):
    partner_id: str
    name: str = "admin-issued"


@router.post("/api/admin/api-keys/issue")
async def issue_api_key_admin(
    body: IssueKeyBody,
    _admin: JWTUser = Depends(get_admin_user),
):
    raw_key = f"nf_{secrets.token_urlsafe(32)}"
    key_hash = _hash_key(raw_key)
    prefix = raw_key[:14] if len(raw_key) >= 14 else raw_key
    try:
        ins = (
            supabase.table("api_keys")
            .insert(
                {
                    "user_id": body.partner_id,
                    "key_hash": key_hash,
                    "key_prefix": prefix,
                    "name": body.name,
                    "plan": "enterprise",
                    "is_active": True,
                    "rate_limit_per_day": 100000,
                }
            )
            .execute()
        )
        record = ins.data[0] if ins.data else {}
    except Exception as exc:
        raise HTTPException(500, f"Failed to create key: {exc}") from exc
    return {
        "ok": True,
        "key": raw_key,
        "key_id": record.get("id"),
        "warning": "Store this key securely — it will not be shown again.",
    }
