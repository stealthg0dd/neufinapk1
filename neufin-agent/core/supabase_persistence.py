"""
supabase_persistence.py — Persists scan findings and scan run metadata to Supabase.

Uses the Supabase REST (PostgREST) API directly via httpx — no extra SDK required.

Tables (must be pre-created in Supabase dashboard / migrations):
  infra_health_snapshots  — one row per finding per scan run
  scan_runs               — one row per scan run (summary)

infra_health_snapshots schema:
  id          text PRIMARY KEY
  repo_id     text NOT NULL
  scan_run_id text NOT NULL
  severity    text NOT NULL
  category    text NOT NULL
  message     text
  detected_at timestamptz
  resolved    boolean DEFAULT false

scan_runs schema:
  scan_run_id     text PRIMARY KEY
  started_at      timestamptz NOT NULL
  completed_at    timestamptz
  total_findings  int DEFAULT 0
  critical_count  int DEFAULT 0
  high_count      int DEFAULT 0
  medium_count    int DEFAULT 0
  low_count       int DEFAULT 0
"""

import logging
import uuid
from datetime import datetime, UTC

import httpx

from core.config import settings

log = logging.getLogger("neufin-agent.supabase")

_BASE = settings.SUPABASE_URL.rstrip("/")
_KEY = settings.SUPABASE_SERVICE_KEY

# PostgREST headers; "resolution=merge-duplicates" performs an upsert on conflict
_HEADERS = {
    "apikey": _KEY,
    "Authorization": f"Bearer {_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=minimal",
}


async def _upsert(table: str, rows: list[dict]) -> None:
    """Upsert a list of rows into a Supabase table via the REST API."""
    if not rows:
        return
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                f"{_BASE}/rest/v1/{table}",
                json=rows,
                headers=_HEADERS,
            )
            if r.status_code not in (200, 201):
                log.warning(
                    {
                        "action": "supabase_upsert_warn",
                        "table": table,
                        "status": r.status_code,
                        "body": r.text[:300],
                    }
                )
            else:
                log.info(
                    {"action": "supabase_upsert_ok", "table": table, "rows": len(rows)}
                )
    except Exception as exc:
        log.error(
            {"action": "supabase_upsert_error", "table": table, "error": str(exc)}
        )


async def write_findings(scan_run_id: str, findings: list[dict]) -> None:
    """Write one row per finding to infra_health_snapshots."""
    now = datetime.now(UTC).isoformat()
    rows = [
        {
            "id": f.get("id") or str(uuid.uuid4()),
            "repo_id": f.get("repo", "unknown"),
            "scan_run_id": scan_run_id,
            "severity": f.get("severity", "medium"),
            "category": f.get("type", "unknown"),
            "message": (f.get("message") or "")[:2000],
            "detected_at": f.get("detected_at") or now,
            "resolved": False,
        }
        for f in findings
    ]
    await _upsert("infra_health_snapshots", rows)


async def write_scan_run(
    scan_run_id: str,
    started_at: str,
    completed_at: str,
    counts: dict,
) -> None:
    """Write a scan run summary row to the scan_runs table."""
    await _upsert(
        "scan_runs",
        [
            {
                "scan_run_id": scan_run_id,
                "started_at": started_at,
                "completed_at": completed_at,
                "total_findings": sum(counts.values()),
                "critical_count": counts.get("critical", 0),
                "high_count": counts.get("high", 0),
                "medium_count": counts.get("medium", 0),
                "low_count": counts.get("low", 0),
            }
        ],
    )


async def mark_finding_resolved(finding_id: str) -> None:
    """Patch a single row in infra_health_snapshots to resolved=True."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.patch(
                f"{_BASE}/rest/v1/infra_health_snapshots",
                json={"resolved": True},
                params={"id": f"eq.{finding_id}"},
                headers={**_HEADERS, "Prefer": "return=minimal"},
            )
            if r.status_code not in (200, 204):
                log.warning(
                    {
                        "action": "supabase_resolve_warn",
                        "id": finding_id,
                        "status": r.status_code,
                    }
                )
            else:
                log.info({"action": "supabase_finding_resolved", "id": finding_id})
    except Exception as exc:
        log.error(
            {"action": "supabase_resolve_error", "id": finding_id, "error": str(exc)}
        )
