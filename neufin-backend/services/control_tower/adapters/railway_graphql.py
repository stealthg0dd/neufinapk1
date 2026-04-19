"""Railway — GraphQL API (deployments per service, project-scoped)."""

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

RAILWAY_GQL = "https://backboard.railway.app/graphql/v2"


def _utc_iso() -> str:
    return datetime.datetime.now(datetime.UTC).isoformat()


PROJECT_QUERY = """
query ControlTowerProject($id: String!) {
  project(id: $id) {
    id
    name
    services {
      edges {
        node {
          id
          name
          deployments(first: 12) {
            edges {
              node {
                id
                status
                createdAt
                staticUrl
              }
            }
          }
        }
      }
    }
  }
}
"""


class RailwayConnector(BaseConnector):
    connector_id = "railway"

    async def fetch(self) -> ConnectorPayload:
        token = settings.OPS_RAILWAY_TOKEN
        pid = getattr(settings, "OPS_RAILWAY_PROJECT_ID", None)
        if not token:
            return self._skipped("OPS_RAILWAY_TOKEN not set.")
        if not pid:
            return self._skipped(
                "OPS_RAILWAY_PROJECT_ID not set — required to query deployments."
            )

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        deployments: list[DeploymentRecord] = []
        errors: list[ErrorSummaryItem] = []
        extra: dict[str, Any] = {}
        err: str | None = None

        try:
            async with httpx.AsyncClient(timeout=35.0) as client:
                r = await client.post(
                    RAILWAY_GQL,
                    headers=headers,
                    json={
                        "query": PROJECT_QUERY,
                        "variables": {"id": pid},
                    },
                )
                extra["http_status"] = r.status_code
                if r.status_code != 200:
                    extra["body"] = r.text[:500]
                    err = f"HTTP {r.status_code}"
                else:
                    data = r.json()
                    extra["errors"] = data.get("errors")
                    if data.get("errors"):
                        err = str(data["errors"])[:300]
                    proj = (data.get("data") or {}).get("project") or {}
                    extra["project_name"] = proj.get("name")
                    for se in proj.get("services", {}).get("edges") or []:
                        svc = se.get("node") or {}
                        sname = str(svc.get("name") or "service")
                        for de in svc.get("deployments", {}).get("edges") or []:
                            d = de.get("node") or {}
                            st = str(d.get("status") or "").upper()
                            dep = DeploymentRecord(
                                provider="railway",
                                id=str(d.get("id")),
                                service_name=sname,
                                status=st,
                                url=d.get("staticUrl"),
                                created_at=d.get("createdAt"),
                            )
                            deployments.append(dep)
                            if st in ("FAILED", "CRASHED", "REMOVED", "ERROR"):
                                errors.append(
                                    ErrorSummaryItem(
                                        source="railway",
                                        severity="error",
                                        title=f"Deploy {st}",
                                        service=sname,
                                        detail=d.get("id"),
                                    )
                                )
        except Exception as exc:
            err = str(exc)
            logger.warning("railway_connector.fetch_failed", error=err)

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
                confidence=0.8 if deployments else 0.25,
                notes="GraphQL project → services → deployments. Token must allow project read.",
            ),
            deployments=deployments,
            error_summary=errors,
            extra=extra,
        )
