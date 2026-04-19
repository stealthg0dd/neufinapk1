"""Celery hook for scheduled control tower refresh (optional)."""

from __future__ import annotations

import asyncio

import structlog

from services.celery_app import celery_app

logger = structlog.get_logger(__name__)


@celery_app.task(name="neufin.control_tower_refresh")
def control_tower_refresh_task() -> dict:
    """Run async snapshot refresh in worker process."""
    from services.ops_control_tower import refresh_control_tower_snapshot

    try:
        return asyncio.run(refresh_control_tower_snapshot())
    except Exception as exc:
        logger.exception("control_tower.sync_task_failed", error=str(exc))
        raise
