"""
Usage Tracker
-------------
Monthly usage counters per user stored in Supabase `usage_tracking` table.
Supports DNA analyses, swarm analyses, and API calls.

Table schema (see supabase_migrations_v9.sql):
  usage_tracking (
    user_id        TEXT NOT NULL,
    month_year     TEXT NOT NULL,   -- e.g. "2026-04"
    dna_analyses   INT  DEFAULT 0,
    swarm_analyses INT  DEFAULT 0,
    api_calls      INT  DEFAULT 0,
    PRIMARY KEY (user_id, month_year)
  )
"""

import datetime

import structlog

from database import supabase

logger = structlog.get_logger(__name__)


def _current_month() -> str:
    return datetime.datetime.utcnow().strftime("%Y-%m")


def _get_usage_row(user_id: str, month_year: str) -> dict:
    try:
        result = (
            supabase.table("usage_tracking")
            .select("dna_analyses, swarm_analyses, api_calls")
            .eq("user_id", user_id)
            .eq("month_year", month_year)
            .limit(1)
            .execute()
        )
        if result.data:
            return result.data[0]
    except Exception as e:
        logger.warning("usage_tracker.get_failed", user_id=user_id, error=str(e))
    return {"dna_analyses": 0, "swarm_analyses": 0, "api_calls": 0}


def _increment_field(user_id: str, field: str) -> int:
    month_year = _current_month()
    row = _get_usage_row(user_id, month_year)
    new_val = (row.get(field) or 0) + 1
    try:
        supabase.table("usage_tracking").upsert(
            {
                "user_id": user_id,
                "month_year": month_year,
                "dna_analyses": row.get("dna_analyses") or 0,
                "swarm_analyses": row.get("swarm_analyses") or 0,
                "api_calls": row.get("api_calls") or 0,
                field: new_val,
            },
            on_conflict="user_id,month_year",
        ).execute()
    except Exception as e:
        logger.warning(
            "usage_tracker.increment_failed", user_id=user_id, field=field, error=str(e)
        )
    return new_val


def track_dna_analysis(user_id: str) -> int:
    """Increment DNA analysis counter. Returns new monthly count."""
    return _increment_field(user_id, "dna_analyses")


def track_swarm_analysis(user_id: str) -> int:
    """Increment swarm analysis counter. Returns new monthly count."""
    return _increment_field(user_id, "swarm_analyses")


def track_api_call(user_id: str) -> int:
    """Increment API call counter. Returns new monthly count."""
    return _increment_field(user_id, "api_calls")


def check_dna_limit(user_id: str, limit: int) -> dict:
    """
    Check if user has reached their monthly DNA analysis limit.

    Args:
        user_id: the user's UUID
        limit:   max allowed per month (-1 = unlimited)

    Returns:
        {"allowed": bool, "used": int, "limit": int}
    """
    if limit == -1:
        return {"allowed": True, "used": 0, "limit": -1}

    month_year = _current_month()
    row = _get_usage_row(user_id, month_year)
    used = row.get("dna_analyses") or 0
    return {
        "allowed": used < limit,
        "used": used,
        "limit": limit,
    }


def check_swarm_limit(user_id: str, limit: int) -> dict:
    """Check if user has reached their monthly swarm analysis limit."""
    if limit == -1:
        return {"allowed": True, "used": 0, "limit": -1}

    month_year = _current_month()
    row = _get_usage_row(user_id, month_year)
    used = row.get("swarm_analyses") or 0
    return {
        "allowed": used < limit,
        "used": used,
        "limit": limit,
    }


def get_monthly_usage(user_id: str) -> dict:
    """Return all usage counts for the current month."""
    month_year = _current_month()
    row = _get_usage_row(user_id, month_year)
    return {
        "month_year": month_year,
        "dna_analyses": row.get("dna_analyses") or 0,
        "swarm_analyses": row.get("swarm_analyses") or 0,
        "api_calls": row.get("api_calls") or 0,
    }
