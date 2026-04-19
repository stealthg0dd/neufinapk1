"""Run all connectors and merge into legacy snapshot-friendly structures."""

from __future__ import annotations

import datetime
from typing import Any

import structlog

from services.control_tower.accounts import AIUsageAccount, SyncSourceType
from services.control_tower.adapters import ALL_CONNECTORS
from services.control_tower.types import ConnectorHealth, ConnectorPayload, SyncStatus

logger = structlog.get_logger(__name__)


def _utc_iso() -> str:
    return datetime.datetime.now(datetime.UTC).isoformat()


def _sync_method_to_source(sm: str) -> str:
    m = {
        "direct_api": SyncSourceType.DIRECT_API,
        "export_import": SyncSourceType.EXPORT_IMPORT,
        "manual_override": SyncSourceType.MANUAL_OVERRIDE,
        "dashboard_placeholder": SyncSourceType.DASHBOARD_PLACEHOLDER,
    }
    return m.get(sm, SyncSourceType.DASHBOARD_PLACEHOLDER)


def payload_to_accounts(payload: ConnectorPayload) -> list[AIUsageAccount]:
    """Flatten connector payload into normalized AIUsageAccount rows."""
    out: list[AIUsageAccount] = []
    ss = payload.sync_status
    src = _sync_method_to_source(ss.sync_method.value)

    model_costs = [m for m in payload.model_breakdown if m.cost_usd and m.cost_usd > 0]

    if payload.usage_summary:
        u = payload.usage_summary
        # Avoid double-counting provider totals when per-model costs are present.
        agg_cost = None if model_costs and u.total_cost_usd else u.total_cost_usd
        out.append(
            AIUsageAccount(
                provider_name=payload.connector_id,
                account_name="aggregate",
                billing_cycle_start=u.period_start,
                billing_cycle_end=u.period_end,
                quota_type="usage_summary",
                cost_to_date_usd=agg_cost,
                quota_used=(
                    float(u.total_input_tokens or 0) + float(u.total_output_tokens or 0)
                    if (u.total_input_tokens or u.total_output_tokens)
                    else None
                ),
                refresh_source=src,
                last_synced_at=ss.last_attempt_at or _utc_iso(),
                sync_confidence=ss.confidence,
                notes=ss.notes,
            )
        )

    for row in payload.model_breakdown:
        out.append(
            AIUsageAccount(
                provider_name=payload.connector_id,
                account_name="model",
                model_name=row.model,
                quota_type="model",
                cost_to_date_usd=row.cost_usd,
                quota_used=(
                    float(row.input_tokens or 0) + float(row.output_tokens or 0)
                    if (row.input_tokens or row.output_tokens)
                    else None
                ),
                refresh_source=src,
                last_synced_at=ss.last_attempt_at or _utc_iso(),
                sync_confidence=ss.confidence,
                notes=None,
            )
        )

    if payload.quota:
        q = payload.quota
        out.append(
            AIUsageAccount(
                provider_name=payload.connector_id,
                account_name="quota",
                quota_type=q.quota_type,
                quota_limit=q.limit,
                quota_used=q.used,
                quota_remaining=q.remaining,
                refresh_source=src,
                last_synced_at=_utc_iso(),
                sync_confidence=ss.confidence,
            )
        )

    if not out and payload.sync_status.notes:
        out.append(
            AIUsageAccount(
                provider_name=payload.connector_id,
                account_name="status",
                quota_type="connector_status",
                refresh_source=src,
                last_synced_at=ss.last_attempt_at,
                sync_confidence=ss.confidence,
                notes=ss.notes or ss.error_message,
            )
        )

    return out


def _serialize_status(ss: SyncStatus) -> dict[str, Any]:
    return {
        "connector_id": ss.connector_id,
        "health": ss.health.value,
        "sync_method": ss.sync_method.value,
        "last_attempt_at": ss.last_attempt_at,
        "last_success_at": ss.last_success_at,
        "error_message": ss.error_message,
        "confidence": ss.confidence,
        "notes": ss.notes,
    }


async def run_connector_pipeline() -> dict[str, Any]:
    """Execute every connector; return merged dict for ops snapshot."""
    connector_results: dict[str, Any] = {}
    accounts: list[AIUsageAccount] = []
    vercel_deployments: list[dict[str, Any]] = []
    railway_deployments: list[dict[str, Any]] = []
    connector_errors: list[dict[str, Any]] = []

    for cls in ALL_CONNECTORS:
        inst = cls()
        try:
            payload = await inst.fetch()
        except Exception as exc:
            logger.warning(
                "connector.fetch_exception", connector=cls.__name__, error=str(exc)
            )
            payload = ConnectorPayload(
                connector_id=getattr(inst, "connector_id", cls.__name__),
                sync_status=SyncStatus(
                    connector_id=getattr(inst, "connector_id", "unknown"),
                    health=ConnectorHealth.FAILED,
                    last_attempt_at=_utc_iso(),
                    error_message=str(exc),
                ),
            )
        cid = payload.connector_id
        connector_results[cid] = {
            "sync_status": _serialize_status(payload.sync_status),
            "usage_summary": (
                payload.usage_summary.model_dump() if payload.usage_summary else None
            ),
            "billing_cycle": (
                payload.billing_cycle.model_dump() if payload.billing_cycle else None
            ),
            "quota": payload.quota.model_dump() if payload.quota else None,
            "model_breakdown": [m.model_dump() for m in payload.model_breakdown],
            "deployments": [d.model_dump() for d in payload.deployments],
            "error_summary": [e.model_dump() for e in payload.error_summary],
            "extra": payload.extra,
        }
        accounts.extend(payload_to_accounts(payload))

        for d in payload.deployments:
            dd = d.model_dump()
            if d.provider == "vercel":
                vercel_deployments.append(dd)
            elif d.provider == "railway":
                railway_deployments.append(dd)

        for e in payload.error_summary:
            connector_errors.append(e.model_dump())

    return {
        "connector_payloads": connector_results,
        "ai_accounts_from_connectors": accounts,
        "vercel_deployments_flat": vercel_deployments,
        "railway_deployments_flat": railway_deployments,
        "connector_errors": connector_errors,
    }
