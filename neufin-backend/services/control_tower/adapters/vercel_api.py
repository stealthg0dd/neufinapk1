"""Vercel — REST deployments + optional project metadata."""

from __future__ import annotations

import datetime
from typing import Any

import httpx
import structlog

from core.config import settings
from services.control_tower.base import BaseConnector
from services.control_tower.types import (
    ConnectorHealth,
    ConnectorPayload,
    DeploymentRecord,
    ErrorSummaryItem,
    SyncMethod,
    SyncStatus,
)

logger = structlog.get_logger(__name__)

VERCEL_API = "https://api.vercel.com"


def _utc_iso() -> str:
    return datetime.datetime.now(datetime.UTC).isoformat()


class VercelConnector(BaseConnector):
    connector_id = "vercel"

    async def fetch(self) -> ConnectorPayload:
        tok = settings.OPS_VERCEL_TOKEN
        pid = settings.OPS_VERCEL_PROJECT_ID
        team = settings.OPS_VERCEL_TEAM_ID
        if not tok or not pid:
            return self._skipped(
                "Set OPS_VERCEL_TOKEN and OPS_VERCEL_PROJECT_ID (OPS_VERCEL_TEAM_ID if team scope)."
            )

        q = f"projectId={pid}&limit=12"
        if team:
            q += f"&teamId={team}"
        headers = {"Authorization": f"Bearer {tok}"}
        deployments: list[DeploymentRecord] = []
        errors: list[ErrorSummaryItem] = []
        extra: dict[str, Any] = {}
        err: str | None = None

        try:
            async with httpx.AsyncClient(timeout=25.0) as client:
                r = await client.get(
                    f"{VERCEL_API}/v6/deployments?{q}",
                    headers=headers,
                )
                extra["deployments_http"] = r.status_code
                if r.status_code == 200:
                    dep = (r.json() or {}).get("deployments") or []
                    for d in dep:
                        st = str(d.get("state") or "")
                        meta = d.get("meta") or {}
                        gh_sha = meta.get("githubCommitSha") or meta.get(
                            "githubCommitRef"
                        )
                        building_at = d.get("buildingAt")
                        ready_at = d.get("ready")
                        dur_ms = None
                        if isinstance(building_at, int | float) and isinstance(
                            ready_at, int | float
                        ):
                            dur_ms = max(0, int(ready_at - building_at))
                        rec = DeploymentRecord(
                            provider="vercel",
                            id=d.get("uid"),
                            status=st,
                            url=d.get("url"),
                            created_at=d.get("createdAt"),
                            target=d.get("target"),
                            environment=d.get("target") or "preview",
                            commit_sha=str(gh_sha)[:40] if gh_sha else None,
                            building_at=str(building_at) if building_at else None,
                            ready_at=str(ready_at) if ready_at else None,
                            duration_ms=dur_ms,
                            build_error_hint=d.get("errorMessage"),
                        )
                        deployments.append(rec)
                        if st in ("ERROR", "FAILED", "CANCELED"):
                            errors.append(
                                ErrorSummaryItem(
                                    source="vercel",
                                    severity="error",
                                    title=f"Deployment {st}",
                                    environment=str(d.get("target") or ""),
                                    detail=d.get("uid"),
                                )
                            )
                else:
                    extra["deployments_body"] = r.text[:400]
                    err = f"deployments {r.status_code}"

                pr = await client.get(
                    f"{VERCEL_API}/v9/projects/{pid}",
                    headers=headers,
                    params={"teamId": team} if team else {},
                )
                extra["project_http"] = pr.status_code
                if pr.status_code == 200:
                    extra["project"] = {
                        "name": (pr.json() or {}).get("name"),
                        "framework": (pr.json() or {}).get("framework"),
                    }
        except Exception as exc:
            err = str(exc)
            logger.warning("vercel_connector.fetch_failed", error=err)

        health = ConnectorHealth.OK if deployments else ConnectorHealth.PARTIAL
        if err and not deployments:
            health = ConnectorHealth.FAILED

        return ConnectorPayload(
            connector_id=self.connector_id,
            sync_status=SyncStatus(
                connector_id=self.connector_id,
                health=health,
                sync_method=SyncMethod.DIRECT_API,
                last_attempt_at=_utc_iso(),
                last_success_at=_utc_iso() if deployments else None,
                error_message=err,
                confidence=0.82 if deployments else 0.3,
                notes="v6/deployments + v9/projects/{id}. Runtime logs are not queried here.",
            ),
            deployments=deployments,
            error_summary=errors,
            extra=extra,
        )
