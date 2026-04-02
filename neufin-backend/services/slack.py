"""
services/slack.py — Lightweight async Slack webhook notifier.

Usage:
    from services.slack import notify_alerts, notify_dev

    await notify_alerts(":rotating_light: *CRITICAL* — Stripe signature validation failed")

Sends fire-and-forget HTTP POST to the configured Slack webhook URLs.
All errors are swallowed so notification failures never crash the caller.
"""

from __future__ import annotations

import structlog
import httpx

from core.config import settings

logger = structlog.get_logger("neufin.slack")


async def _post(webhook_url: str | None, text: str) -> None:
    if not webhook_url:
        return
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(webhook_url, json={"text": text})
            if resp.status_code not in (200, 204):
                logger.warning("slack.post_failed", status=resp.status_code, text_snippet=text[:80])
    except Exception as exc:
        logger.warning("slack.post_error", error=str(exc), text_snippet=text[:80])


async def notify_alerts(text: str) -> None:
    """Post to #neufin-alerts."""
    await _post(settings.SLACK_WEBHOOK_NEUFIN_ALERTS, text)


async def notify_dev(text: str) -> None:
    """Post to #neufin-dev."""
    await _post(settings.SLACK_WEBHOOK_NEUFIN_DEV, text)


async def notify_ctech(text: str) -> None:
    """Post to #ctech-command."""
    await _post(settings.SLACK_WEBHOOK_CTECH_COMMAND, text)
