"""Anthropic — Admin Usage & Cost API (requires sk-ant-admin… key)."""

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

ANTHROPIC_API = "https://api.anthropic.com"


def _utc_iso() -> str:
    return datetime.datetime.now(datetime.UTC).isoformat()


def _admin_key() -> str | None:
    return getattr(settings, "OPS_ANTHROPIC_ADMIN_API_KEY", None) or None


class AnthropicAdminConnector(BaseConnector):
    connector_id = "anthropic"

    async def fetch(self) -> ConnectorPayload:
        key = _admin_key()
        if not key:
            return self._skipped(
                "OPS_ANTHROPIC_ADMIN_API_KEY not set — Admin Usage/Cost API requires an admin key."
            )

        headers = {
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }
        end = datetime.datetime.now(datetime.UTC)
        start = end - datetime.timedelta(days=7)
        params_usage = [
            ("starting_at", start.strftime("%Y-%m-%dT00:00:00Z")),
            ("ending_at", end.strftime("%Y-%m-%dT23:59:59Z")),
            ("bucket_width", "1d"),
            ("group_by", "model"),
        ]
        models: list[ModelBreakdownRow] = []
        usage_summary: UsageSummary | None = None
        extra: dict[str, Any] = {}
        err: str | None = None

        try:
            async with httpx.AsyncClient(timeout=35.0) as client:
                u_r = await client.get(
                    f"{ANTHROPIC_API}/v1/organizations/usage_report/messages",
                    headers=headers,
                    params=params_usage,
                )
                extra["usage_http_status"] = u_r.status_code
                if u_r.status_code == 200:
                    uj = u_r.json()
                    extra["usage_keys"] = list(uj.keys())[:16]
                    buckets = uj.get("data") or []
                    by_model: dict[str, dict[str, float]] = {}
                    for b in buckets:
                        for row in b.get("results") or []:
                            m = str(row.get("model") or "unknown")
                            by_model.setdefault(m, {"in": 0.0, "out": 0.0})
                            by_model[m]["in"] += float(
                                row.get("uncached_input_tokens")
                                or row.get("input_tokens")
                                or 0
                            )
                            by_model[m]["out"] += float(row.get("output_tokens") or 0)
                    for m, t in by_model.items():
                        models.append(
                            ModelBreakdownRow(
                                model=m,
                                input_tokens=int(t["in"]),
                                output_tokens=int(t["out"]),
                            )
                        )
                    usage_summary = UsageSummary(
                        period_start=params_usage[0][1],
                        period_end=params_usage[1][1],
                        total_input_tokens=int(
                            sum(x.input_tokens or 0 for x in models)
                        ),
                        total_output_tokens=int(
                            sum(x.output_tokens or 0 for x in models)
                        ),
                        raw=uj,
                    )
                else:
                    extra["usage_body"] = u_r.text[:400]

                c_start = (end - datetime.timedelta(days=30)).strftime(
                    "%Y-%m-%dT00:00:00Z"
                )
                c_end = end.strftime("%Y-%m-%dT23:59:59Z")
                c_r = await client.get(
                    f"{ANTHROPIC_API}/v1/organizations/cost_report",
                    headers=headers,
                    params=[
                        ("starting_at", c_start),
                        ("ending_at", c_end),
                        ("group_by", "model"),
                    ],
                )
                extra["cost_http_status"] = c_r.status_code
                if c_r.status_code == 200:
                    cj = c_r.json()
                    extra["cost_keys"] = list(cj.keys())[:12]
                    extra["cost_report_sample"] = str(cj)[:800]
                else:
                    extra["cost_body"] = c_r.text[:400]

        except Exception as exc:
            err = str(exc)
            logger.warning("anthropic_connector.fetch_failed", error=err)

        health = (
            ConnectorHealth.OK if models or usage_summary else ConnectorHealth.PARTIAL
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
                confidence=0.88 if models else 0.35,
                notes=(
                    "Anthropic Admin API (usage_report + cost_report). "
                    "Requires org admin key; response shapes vary slightly by account tier."
                ),
            ),
            usage_summary=usage_summary,
            model_breakdown=models,
            extra=extra,
        )
