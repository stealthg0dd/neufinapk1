"""
services/celery_app.py — Celery application instance for Neufin background workers.

Current tasks
-------------
None scheduled yet.  This module provides the Celery infrastructure so the
ai-worker container starts cleanly.  As long-running operations (e.g. full
swarm analysis triggered from mobile) are moved off the synchronous
request/response cycle, their task functions will be registered here.

Module path note
----------------
This project uses a flat layout (main.py + services/ + routers/ at /app root),
NOT the app/core/... package structure.  The correct invocation is therefore:

    celery -A services.celery_app worker --loglevel=info --queues=swarm,default

Usage inside the container (PYTHONPATH=/app is set by Dockerfile):
    celery -A services.celery_app worker --loglevel=info
    celery -A services.celery_app inspect active
    celery -A services.celery_app flower   (requires pip install flower)
"""

from __future__ import annotations

import os

from celery import Celery
from dotenv import load_dotenv

load_dotenv()

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "neufin",
    broker=REDIS_URL,
    backend=REDIS_URL,
    # Register task modules here as they are created:
    # e.g. include=["services.tasks.swarm", "services.tasks.reports"]
    include=[],
)

celery_app.conf.update(
    # Serialisation
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    # Timezone
    timezone="UTC",
    enable_utc=True,
    # Worker behaviour — LLM calls are heavy; process one task at a time.
    worker_prefetch_multiplier=1,
    task_acks_late=True,  # re-queue if the worker crashes mid-task
    task_reject_on_worker_lost=True,
    # Startup — retry broker connection on startup instead of crashing immediately.
    broker_connection_retry_on_startup=True,
    # Result expiry — keep results for 1 hour.
    result_expires=3600,
)

# Alias so `celery -A services.celery_app` resolves the app instance correctly.
app = celery_app
