"""
Revenue Stats Router — Stripe + Supabase revenue analytics
-----------------------------------------------------------
All endpoints require advisor role.

GET /api/revenue/stats → aggregated revenue, subscriber, and funnel stats
"""

import asyncio
import calendar
import datetime

import stripe
import structlog
from fastapi import APIRouter, Depends, HTTPException

from core.config import settings
from database import supabase
from services.auth_dependency import get_current_user
from services.jwt_auth import JWTUser

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="", tags=["revenue"])

stripe.api_key = settings.STRIPE_SECRET_KEY


# ── Role guard (same logic as admin router) ────────────────────────────────────


def _require_advisor_role(user: JWTUser) -> None:
    """Raise HTTP 403 if the user does not have role='advisor' in user_profiles."""
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
        logger.warning("revenue.role_check_failed", user_id=user.id, error=str(exc))
        raise HTTPException(403, "Could not verify advisor role.") from exc

    if profile.get("role") != "advisor":
        raise HTTPException(403, "Advisor role required.")


# ── Stripe helpers ─────────────────────────────────────────────────────────────


def _month_unix_range(year: int, month: int) -> tuple[int, int]:
    """Return (start_unix, end_unix) for the given calendar month (inclusive)."""
    start = datetime.datetime(year, month, 1, tzinfo=datetime.UTC)
    last_day = calendar.monthrange(year, month)[1]
    end = datetime.datetime(year, month, last_day, 23, 59, 59, tzinfo=datetime.UTC)
    return int(start.timestamp()), int(end.timestamp())


def _stripe_revenue_for_month(year: int, month: int) -> float:
    """Sum succeeded PaymentIntent amounts (in USD) for the given month."""
    if not settings.STRIPE_SECRET_KEY:
        return 0.0
    gte, lte = _month_unix_range(year, month)
    total_cents = 0
    try:
        has_more = True
        starting_after = None
        while has_more:
            kwargs: dict = {
                "created": {"gte": gte, "lte": lte},
                "limit": 100,
            }
            if starting_after:
                kwargs["starting_after"] = starting_after
            page = stripe.PaymentIntent.list(**kwargs)
            for pi in page.data:
                if pi.get("status") == "succeeded":
                    total_cents += pi.get("amount", 0)
            has_more = page.has_more
            if has_more and page.data:
                starting_after = page.data[-1].id
    except stripe.StripeError as exc:
        logger.warning("revenue.stripe_fetch_failed", error=str(exc))
    return round(total_cents / 100.0, 2)


# ── Endpoint ───────────────────────────────────────────────────────────────────


@router.get("/api/revenue/stats")
async def revenue_stats(user: JWTUser = Depends(get_current_user)):
    """
    Aggregated revenue + subscriber + funnel stats for the ops dashboard.
    Requires advisor role.
    """
    _require_advisor_role(user)

    now = datetime.datetime.now(datetime.UTC)
    this_year, this_month = now.year, now.month

    # Last month
    if this_month == 1:
        last_year, last_month = this_year - 1, 12
    else:
        last_year, last_month = this_year, this_month - 1

    # ── Stripe revenue (blocking calls moved to thread pool) ──────────────────
    revenue_this, revenue_last = await asyncio.gather(
        asyncio.to_thread(_stripe_revenue_for_month, this_year, this_month),
        asyncio.to_thread(_stripe_revenue_for_month, last_year, last_month),
    )

    # ── Subscriber counts ─────────────────────────────────────────────────────
    active_count = trial_count = expired_count = 0
    try:
        profiles_result = (
            supabase.table("user_profiles")
            .select("subscription_status")
            .execute()
        )
        for row in profiles_result.data or []:
            status = row.get("subscription_status", "")
            if status == "active":
                active_count += 1
            elif status == "trial":
                trial_count += 1
            else:
                expired_count += 1
    except Exception as exc:
        logger.warning("revenue.subscriber_counts_failed", error=str(exc))

    # ── Recent purchases ──────────────────────────────────────────────────────
    recent_purchases = []
    try:
        reports_result = (
            supabase.table("advisor_reports")
            .select("advisor_id, created_at, plan_type, amount_usd")
            .eq("is_paid", True)
            .order("created_at", desc=True)
            .limit(20)
            .execute()
        )
        advisor_ids = list({
            r["advisor_id"] for r in (reports_result.data or []) if r.get("advisor_id")
        })

        # Bulk-fetch emails for those advisors
        email_map: dict[str, str] = {}
        if advisor_ids:
            try:
                email_result = (
                    supabase.table("user_profiles")
                    .select("id, email")
                    .in_("id", advisor_ids)
                    .execute()
                )
                for row in email_result.data or []:
                    email_map[row["id"]] = row.get("email") or ""
            except Exception as exc:
                logger.warning("revenue.email_lookup_failed", error=str(exc))

        for r in reports_result.data or []:
            aid = r.get("advisor_id") or ""
            recent_purchases.append(
                {
                    "user_id": aid,
                    "email": email_map.get(aid, ""),
                    "plan_type": r.get("plan_type") or "single",
                    "amount_usd": float(r.get("amount_usd") or 29.0),
                    "purchased_at": r.get("created_at") or "",
                }
            )
    except Exception as exc:
        logger.warning("revenue.recent_purchases_failed", error=str(exc))

    # ── Funnel counts (this calendar month) ──────────────────────────────────
    start_of_month_iso = datetime.datetime(this_year, this_month, 1, tzinfo=datetime.UTC).isoformat()

    signups = dna_scores_count = swarm_runs = purchases = 0

    try:
        r = (
            supabase.table("user_profiles")
            .select("id", count="exact")
            .gte("created_at", start_of_month_iso)
            .execute()
        )
        signups = r.count or len(r.data or [])
    except Exception as exc:
        logger.warning("revenue.funnel.signups_failed", error=str(exc))

    try:
        r = (
            supabase.table("dna_scores")
            .select("id", count="exact")
            .gte("created_at", start_of_month_iso)
            .execute()
        )
        dna_scores_count = r.count or len(r.data or [])
    except Exception as exc:
        logger.warning("revenue.funnel.dna_scores_failed", error=str(exc))

    try:
        r = (
            supabase.table("analytics_events")
            .select("id", count="exact")
            .eq("event_name", "swarm_run")
            .gte("created_at", start_of_month_iso)
            .execute()
        )
        swarm_runs = r.count or len(r.data or [])
    except Exception as exc:
        logger.warning("revenue.funnel.swarm_runs_failed", error=str(exc))

    try:
        r = (
            supabase.table("advisor_reports")
            .select("id", count="exact")
            .eq("is_paid", True)
            .gte("created_at", start_of_month_iso)
            .execute()
        )
        purchases = r.count or len(r.data or [])
    except Exception as exc:
        logger.warning("revenue.funnel.purchases_failed", error=str(exc))

    return {
        "revenue_this_month_usd": revenue_this,
        "revenue_last_month_usd": revenue_last,
        "active_subscribers": active_count,
        "trial_users": trial_count,
        "expired_users": expired_count,
        "recent_purchases": recent_purchases,
        "funnel": {
            "signups": signups,
            "dna_scores": dna_scores_count,
            "swarm_runs": swarm_runs,
            "purchases": purchases,
        },
    }
