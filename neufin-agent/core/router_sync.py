"""
router_sync.py — Syncs neufin-agent state with the ctech router-system.

Public API:
  register_agent()            POST /api/register on startup
  post_scan_results(report)   POST scan summary to /api/repos/neufin-backend/scans
  heartbeat_loop()            Runs forever; POSTs /api/heartbeat/neufin-agent every 60 s
"""

import asyncio
import logging
import os
from datetime import datetime, UTC

import httpx

from core.config import settings

log = logging.getLogger("neufin-agent.router_sync")

_ROUTER_URL = settings.AGENT_OS_URL.rstrip("/")
_API_KEY = settings.AGENT_OS_API_KEY
_HEADERS = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {_API_KEY}",
    "x-api-key": _API_KEY,
}
_VERSION: str = (
    os.getenv("GIT_COMMIT_SHA") or os.getenv("RAILWAY_GIT_COMMIT_SHA") or "unknown"
)


async def _post(path: str, payload: dict) -> dict:
    """POST to router-system; swallows exceptions so the agent never crashes."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                f"{_ROUTER_URL}{path}", json=payload, headers=_HEADERS
            )
            r.raise_for_status()
            return r.json() if r.content else {}
    except httpx.HTTPStatusError as exc:
        log.warning(
            {
                "action": "router_sync_http_error",
                "path": path,
                "status": exc.response.status_code,
                "body": exc.response.text[:200],
            }
        )
    except Exception as exc:
        log.warning({"action": "router_sync_error", "path": path, "error": str(exc)})
    return {}


def _health_url() -> str:
    """Build the public health URL using Railway env vars when available."""
    port = settings.AGENT_PORT
    base = os.getenv("RAILWAY_STATIC_URL") or os.getenv("RAILWAY_PUBLIC_DOMAIN")
    if base:
        return f"https://{base}/health"
    return f"http://localhost:{port}/health"


async def register_agent() -> None:
    """POST /api/register — called once on startup."""
    payload = {
        "repo_id": "neufin-agent",
        "health_url": _health_url(),
        "version": _VERSION,
        "environment": settings.ENVIRONMENT,
        "registered_at": datetime.now(UTC).isoformat(),
    }
    result = await _post("/api/register", payload)
    log.info(
        {
            "action": "agent_registered",
            "health_url": payload["health_url"],
            "result": result,
        }
    )


async def post_scan_results(report: dict) -> None:
    """POST scan summary to /api/repos/neufin-backend/scans after each run."""
    counts = report.get("issue_count", {})
    scores = report.get("scores", {})
    payload = {
        "scan_run_id": report.get("run_id"),
        "generated_at": report.get("generated_at"),
        "scores": scores,
        "total_findings": sum(counts.values()),
        "critical_count": counts.get("critical", 0),
        "high_count": counts.get("high", 0),
        "medium_count": counts.get("medium", 0),
        "low_count": counts.get("low", 0),
        "source": "neufin-agent",
        "version": _VERSION,
    }
    result = await _post("/api/repos/neufin-backend/scans", payload)
    log.info(
        {
            "action": "scan_results_posted",
            "run_id": report.get("run_id"),
            "result": result,
        }
    )


async def _heartbeat_once() -> None:
    payload = {
        "service": "neufin-agent",
        "status": "alive",
        "timestamp": datetime.now(UTC).isoformat(),
        "version": _VERSION,
        "health_url": _health_url(),
    }
    await _post("/api/heartbeat/neufin-agent", payload)


async def heartbeat_loop() -> None:
    """Runs as a long-lived asyncio task; POSTs a heartbeat every 60 seconds."""
    log.info({"action": "heartbeat_loop_start", "interval_seconds": 60})
    while True:
        try:
            await _heartbeat_once()
        except Exception as exc:
            # Should never reach here since _heartbeat_once swallows errors,
            # but guard anyway so the loop never exits.
            log.warning({"action": "heartbeat_unhandled_error", "error": str(exc)})
        await asyncio.sleep(60)
