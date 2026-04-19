"""GitHub Copilot — org metrics API (requires org + billing:copilot / read:org scopes)."""

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
    ModelBreakdownRow,
    SyncMethod,
    SyncStatus,
    UsageSummary,
)

logger = structlog.get_logger(__name__)

GITHUB_API = "https://api.github.com"


def _utc_iso() -> str:
    return datetime.datetime.now(datetime.UTC).isoformat()


def _org_slug() -> str | None:
    v = getattr(settings, "OPS_GITHUB_COPILOT_ORG", None)
    if v and str(v).strip():
        return str(v).strip()
    return None


class GitHubCopilotConnector(BaseConnector):
    connector_id = "github_copilot"

    async def fetch(self) -> ConnectorPayload:
        token = settings.OPS_GITHUB_TOKEN
        org = _org_slug()
        if not token or not org:
            return self._skipped(
                "Set OPS_GITHUB_TOKEN and OPS_GITHUB_COPILOT_ORG for Copilot metrics."
            )

        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        err: str | None = None
        models: list[ModelBreakdownRow] = []
        extra: dict[str, Any] = {}
        usage_summary: UsageSummary | None = None

        end = datetime.datetime.now(datetime.UTC).date()
        start = end - datetime.timedelta(days=28)

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                r = await client.get(
                    f"{GITHUB_API}/orgs/{org}/copilot/metrics",
                    headers=headers,
                    params={
                        "since": start.isoformat(),
                        "until": end.isoformat(),
                        "per_page": 100,
                    },
                )
                extra["http_status"] = r.status_code
                if r.status_code == 200:
                    raw = r.json()
                    rows = raw
                    if isinstance(raw, dict):
                        rows = raw.get("metrics") or raw.get("data") or []
                    if isinstance(rows, list):
                        total_active = 0
                        total_engaged = 0
                        for row in rows:
                            total_active += int(row.get("total_active_users") or 0)
                            total_engaged += int(row.get("total_engaged_users") or 0)
                            ide = row.get("copilot_ide_code_completions") or {}
                            for lang, block in (ide.get("languages") or {}).items():
                                if isinstance(block, dict):
                                    models.append(
                                        ModelBreakdownRow(
                                            model=f"copilot:{lang}",
                                            requests=int(
                                                block.get("total_engaged_users") or 0
                                            ),
                                        )
                                    )
                        usage_summary = UsageSummary(
                            period_start=start.isoformat(),
                            period_end=end.isoformat(),
                            raw={
                                "org": org,
                                "rows": len(rows),
                                "total_active_users_sample": total_active,
                                "total_engaged_users_sample": total_engaged,
                            },
                        )
                else:
                    extra["body"] = r.text[:400]
                    # Fallback: billing seats count only
                    s = await client.get(
                        f"{GITHUB_API}/orgs/{org}/copilot/billing",
                        headers=headers,
                    )
                    extra["billing_http_status"] = s.status_code
                    if s.status_code == 200:
                        bj = s.json()
                        extra["billing"] = bj
                        usage_summary = UsageSummary(
                            raw={"seat_breakdown": bj},
                        )
        except Exception as exc:
            err = str(exc)
            logger.warning("github_copilot.fetch_failed", error=err)

        health = (
            ConnectorHealth.OK if usage_summary or models else ConnectorHealth.PARTIAL
        )
        if err:
            health = ConnectorHealth.FAILED

        return ConnectorPayload(
            connector_id=self.connector_id,
            sync_status=SyncStatus(
                connector_id=self.connector_id,
                health=health,
                sync_method=SyncMethod.DIRECT_API,
                last_attempt_at=_utc_iso(),
                last_success_at=_utc_iso() if health == ConnectorHealth.OK else None,
                error_message=err,
                confidence=0.75 if usage_summary else 0.4,
                notes=(
                    "GET /orgs/{org}/copilot/metrics — requires org Copilot Metrics policy. "
                    "Falls back to /copilot/billing when metrics unavailable."
                ),
            ),
            usage_summary=usage_summary,
            model_breakdown=models,
            extra=extra,
        )
