"""
routers/alerts.py — Push-notification alert subscriptions + macro-shift delivery.

Endpoints
---------
POST /api/alerts/register     Register an Expo push token + portfolio symbols
GET  /api/alerts/recent       Fetch the last N macro-shift alerts
POST /api/alerts/test         Send a test notification to a specific token (dev use)

Push notifications are delivered via the Expo Push API:
  https://exp.host/--/api/v2/push/send

Macro-shift detection is triggered by the Strategist Agent (agent_swarm.py) via
the helper `notify_macro_shift()` exported from this module.
"""

from __future__ import annotations

import datetime

import requests as _requests
import structlog
from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel, field_validator

from database import get_supabase_client

router = APIRouter(prefix="/api/alerts", tags=["alerts"])

logger = structlog.get_logger("neufin.alerts")

_EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
_MAX_BATCH = 100  # Expo recommends ≤ 100 messages per request


# ══════════════════════════════════════════════════════════════════════════════
# Pydantic models
# ══════════════════════════════════════════════════════════════════════════════


class RegisterRequest(BaseModel):
    expo_push_token: str
    symbols: list[str]
    user_label: str | None = "Mobile User"

    @field_validator("symbols", mode="before")
    @classmethod
    def upper_symbols(cls, v):
        return [s.upper() for s in v]

    @field_validator("expo_push_token", mode="before")
    @classmethod
    def validate_token(cls, v):
        if not v.startswith(("ExponentPushToken[", "ExpoPushToken[")):
            raise ValueError("Invalid Expo push token format.")
        return v


class TestPushRequest(BaseModel):
    expo_push_token: str
    message: str | None = "Neufin Swarm: test alert ✓"


# ══════════════════════════════════════════════════════════════════════════════
# Routes
# ══════════════════════════════════════════════════════════════════════════════


@router.post("/register", status_code=201)
async def register_push_token(req: RegisterRequest):
    """
    Upsert a push token + symbol list into `push_alert_subscriptions`.
    On conflict (same token), update symbols and user_label.
    """
    sb = get_supabase_client()
    sb.table("push_alert_subscriptions").upsert(
        {
            "expo_push_token": req.expo_push_token,
            "symbols": req.symbols,
            "user_label": req.user_label,
            "updated_at": datetime.datetime.utcnow().isoformat(),
        },
        on_conflict="expo_push_token",
    ).execute()
    return {"status": "subscribed", "symbols": req.symbols}


@router.get("/recent")
async def get_recent_alerts(limit: int = 20):
    """Return the last *limit* macro-shift alert records."""
    sb = get_supabase_client()
    rows = (
        sb.table("macro_shift_alerts")
        .select("*")
        .order("created_at", desc=True)
        .limit(min(limit, 100))
        .execute()
    )
    return rows.data or []


@router.post("/test")
async def test_push(req: TestPushRequest, bg: BackgroundTasks):
    """Send a single test push notification. Dev use only."""
    bg.add_task(
        _send_expo_messages,
        [
            {
                "to": req.expo_push_token,
                "title": "Neufin Test",
                "body": req.message,
                "data": {},
            }
        ],
    )
    return {"status": "queued"}


# ══════════════════════════════════════════════════════════════════════════════
# Public helper — called by strategist_node when a regime shift is detected
# ══════════════════════════════════════════════════════════════════════════════


async def notify_macro_shift(
    regime: str,
    cpi_yoy: str,
    body_text: str,
    affected_symbols: list[str],
) -> None:
    """
    1. Persist the alert to `macro_shift_alerts`.
    2. Query `push_alert_subscriptions` for tokens whose `symbols` overlap
       with `affected_symbols`.
    3. Send Expo push messages in batches of 100.

    Called from agent_swarm.py strategist_node as a fire-and-forget background task.
    """
    try:
        sb = get_supabase_client()
        now = datetime.datetime.utcnow().isoformat()

        # Persist alert record
        alert_row = {
            "title": f"Regime Shift: {regime}",
            "body": body_text,
            "regime": regime,
            "cpi_yoy": cpi_yoy,
            "affected_symbols": affected_symbols,
            "created_at": now,
        }
        sb.table("macro_shift_alerts").insert(alert_row).execute()

        # Fetch all subscriptions
        subs = (
            sb.table("push_alert_subscriptions")
            .select("expo_push_token,symbols")
            .execute()
        )
        if not subs.data:
            return

        # Filter to subscribers who hold any affected symbol
        affected_set = {s.upper() for s in affected_symbols}
        tokens = [
            row["expo_push_token"]
            for row in subs.data
            if any(s.upper() in affected_set for s in (row.get("symbols") or []))
        ]

        if not tokens:
            logger.info("alerts.no_matching_subscribers", regime=regime)
            return

        messages = [
            {
                "to": token,
                "title": f"⚠ Swarm Alert: {regime}",
                "body": body_text[:200],
                "data": {
                    "regime": regime,
                    "cpi_yoy": cpi_yoy,
                    "symbols": affected_symbols,
                },
                "sound": "default",
                "channelId": "swarm-alerts",
            }
            for token in tokens
        ]

        await _send_expo_messages_async(messages)
        logger.info("alerts.push_sent", count=len(messages), regime=regime)

    except Exception as e:
        logger.warning("alerts.notify_macro_shift_failed", error=str(e))


# ══════════════════════════════════════════════════════════════════════════════
# Expo delivery helpers
# ══════════════════════════════════════════════════════════════════════════════


def _send_expo_messages(messages: list[dict]) -> None:
    """Synchronous batch send to Expo Push API (for BackgroundTasks)."""
    for i in range(0, len(messages), _MAX_BATCH):
        batch = messages[i : i + _MAX_BATCH]
        try:
            r = _requests.post(
                _EXPO_PUSH_URL,
                json=batch,
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "Accept-Encoding": "gzip, deflate",
                },
                timeout=10.0,
            )
            if not r.ok:
                logger.warning(
                    "alerts.expo_push_error", status=r.status_code, detail=r.text[:200]
                )
        except Exception as e:
            logger.warning("alerts.expo_push_request_failed", error=str(e))


async def _send_expo_messages_async(messages: list[dict]) -> None:
    """Async wrapper — runs the sync sender in a thread pool."""
    import asyncio

    await asyncio.to_thread(_send_expo_messages, messages)
