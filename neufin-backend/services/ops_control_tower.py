"""
NeuFin Admin Control Tower — aggregated observability for ops (admin JWT only).

Uses modular connectors (services.control_tower) + optional repo intelligence.
"""

from __future__ import annotations

import datetime
import json
import os
import time
from typing import Any

import structlog

from core.config import settings
from services.control_tower import store as ct_store
from services.control_tower.accounts import AIUsageAccount, SyncSourceType
from services.control_tower.orchestrator import run_connector_pipeline
from services.ops_unified_summary import build_unified_observability_async
from services.repo_intel.orchestrator import build_repo_intelligence_snapshot
from services.request_metrics import http_stats_last_hours

# Re-export for callers that imported from here
__all__ = [
    "AIUsageAccount",
    "SyncSourceType",
    "build_control_tower_snapshot",
    "get_control_tower_snapshot_cached",
    "refresh_control_tower_snapshot",
]

logger = structlog.get_logger(__name__)

_CACHE: dict[str, Any] | None = None
_CACHE_AT: float = 0.0
_CACHE_TTL = 60.0


def _utcnow_iso() -> str:
    return datetime.datetime.now(datetime.UTC).isoformat()


def _safe_json_loads(raw: str | None) -> dict[str, Any] | None:
    if not raw or not str(raw).strip():
        return None
    try:
        return json.loads(raw)
    except Exception as exc:
        logger.warning("ops_control_tower.manual_json_invalid", error=str(exc))
        return None


def _manual_accounts_from_env() -> list[AIUsageAccount]:
    raw = (
        settings.OPS_CONTROL_TOWER_MANUAL_JSON
        or os.getenv("OPS_CONTROL_TOWER_MANUAL_JSON")
        or ""
    ).strip()
    data = _safe_json_loads(raw)
    if not data:
        return []
    rows = data.get("ai_accounts") or data.get("accounts")
    if not isinstance(rows, list):
        return []
    out: list[AIUsageAccount] = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        try:
            out.append(AIUsageAccount.model_validate(r))
        except Exception as exc:
            logger.debug("ops_control_tower.ai_account_skip", error=str(exc))
    return out


def _anthropic_placeholder() -> AIUsageAccount:
    return AIUsageAccount(
        provider_name="anthropic",
        account_name="primary",
        quota_type="usage_api_not_wired",
        refresh_source=SyncSourceType.DASHBOARD_PLACEHOLDER,
        last_synced_at=_utcnow_iso(),
        sync_confidence=0.0,
        notes=(
            "No Anthropic Admin API key — set OPS_ANTHROPIC_ADMIN_API_KEY or manual JSON."
        ),
    )


def _cursor_placeholder() -> AIUsageAccount:
    return AIUsageAccount(
        provider_name="cursor",
        account_name="team_pool",
        quota_type="manual_or_import",
        refresh_source=SyncSourceType.MANUAL_OVERRIDE,
        last_synced_at=_utcnow_iso(),
        sync_confidence=0.0,
        notes="Cursor: add cursor_accounts to OPS_CONTROL_TOWER_MANUAL_JSON for spend rows.",
    )


def _copilot_placeholder() -> AIUsageAccount:
    return AIUsageAccount(
        provider_name="github_copilot",
        account_name="org_seat",
        quota_type="aggregated",
        refresh_source=SyncSourceType.DASHBOARD_PLACEHOLDER,
        last_synced_at=_utcnow_iso(),
        sync_confidence=0.0,
        notes="Copilot: set OPS_GITHUB_COPILOT_ORG + token with Copilot metrics access.",
    )


def _aggregate_ai_metrics(accounts: list[AIUsageAccount]) -> dict[str, Any]:
    by_provider: dict[str, float] = {}
    by_model: dict[str, float] = {}
    for a in accounts:
        c = a.cost_to_date_usd or 0.0
        if c and c > 0:
            by_provider[a.provider_name] = by_provider.get(a.provider_name, 0.0) + c
            if a.model_name:
                by_model[a.model_name] = by_model.get(a.model_name, 0.0) + c
    burn = sorted(
        [{"model": k, "cost_usd": v} for k, v in by_model.items()],
        key=lambda x: -x["cost_usd"],
    )[:12]
    return {
        "total_cost_usd_by_provider": by_provider,
        "total_cost_usd_by_model": by_model,
        "top_models_by_spend": burn,
    }


def _build_alerts(accounts: list[AIUsageAccount]) -> list[dict[str, Any]]:
    alerts: list[dict[str, Any]] = []
    for a in accounts:
        if a.quota_limit and a.quota_used is not None and a.quota_limit > 0:
            pct = (a.quota_used / a.quota_limit) * 100.0
            if pct >= 85:
                alerts.append(
                    {
                        "severity": "warning",
                        "type": "quota_nearing_exhaustion",
                        "message": f"{a.provider_name}/{a.account_name} at {pct:.0f}% of quota",
                        "provider": a.provider_name,
                    }
                )
    return alerts


def _error_unified_panel(connector_errors: list[dict[str, Any]]) -> dict[str, Any]:
    http_stats = http_stats_last_hours(24.0)
    return {
        "api_process_24h": {
            "http_5xx_rate_pct": http_stats.get("error_rate_pct"),
            "http_sample_count": http_stats.get("sample_count"),
            "p50_ms": http_stats.get("p50_ms"),
            "p95_ms": http_stats.get("p95_ms"),
            "source": "in_process_ring_buffer",
        },
        "connector_errors": connector_errors,
        "external_connectors": [
            {
                "name": "sentry",
                "status": "not_queried",
                "source_type": SyncSourceType.MANUAL_OVERRIDE,
                "notes": "Wire Sentry API or embed in OPS_CONTROL_TOWER_MANUAL_JSON.",
            },
            {
                "name": "posthog",
                "status": "not_queried",
                "source_type": SyncSourceType.MANUAL_OVERRIDE,
            },
        ],
        "top_recurring_messages": [],
    }


def _integrations_matrix() -> list[dict[str, Any]]:
    return [
        {
            "id": "openai",
            "automation": "partial" if settings.OPENAI_KEY else "none",
            "detail": "OpenAIConnector: billing usage + org completions when permitted.",
        },
        {
            "id": "anthropic",
            "automation": (
                "full"
                if getattr(settings, "OPS_ANTHROPIC_ADMIN_API_KEY", None)
                else "none"
            ),
            "detail": "Admin Usage/Cost API when OPS_ANTHROPIC_ADMIN_API_KEY set.",
        },
        {
            "id": "github",
            "automation": "full" if settings.OPS_GITHUB_TOKEN else "none",
            "detail": "Extended REST + repo intelligence.",
        },
        {
            "id": "github_copilot",
            "automation": (
                "partial"
                if settings.OPS_GITHUB_TOKEN
                and getattr(settings, "OPS_GITHUB_COPILOT_ORG", None)
                else "none"
            ),
            "detail": "GET /orgs/{org}/copilot/metrics",
        },
        {
            "id": "cursor",
            "automation": "partial",
            "detail": "Manual JSON cursor_accounts — no public API.",
        },
        {
            "id": "vercel",
            "automation": (
                "partial"
                if settings.OPS_VERCEL_TOKEN and settings.OPS_VERCEL_PROJECT_ID
                else "none"
            ),
        },
        {
            "id": "railway",
            "automation": (
                "partial"
                if settings.OPS_RAILWAY_TOKEN
                and getattr(settings, "OPS_RAILWAY_PROJECT_ID", None)
                else "none"
            ),
            "detail": "GraphQL project deployments.",
        },
    ]


def _audit_entries(persisted: bool) -> list[dict[str, Any]]:
    return [
        {
            "at": _utcnow_iso(),
            "event": "control_tower_snapshot",
            "message": (
                "Snapshot persisted to OPS_CONTROL_TOWER_DATA_DIR"
                if persisted
                else "In-memory TTL cache; use POST refresh to persist."
            ),
        }
    ]


def _merge_deployments(pipe: dict[str, Any]) -> dict[str, Any]:
    cp = pipe["connector_payloads"]
    vercel_ex = (cp.get("vercel") or {}).get("extra") or {}
    railway_ex = (cp.get("railway") or {}).get("extra") or {}
    return {
        "vercel": {
            "configured": bool(
                settings.OPS_VERCEL_TOKEN and settings.OPS_VERCEL_PROJECT_ID
            ),
            "ok": bool(pipe["vercel_deployments_flat"]),
            "source_type": SyncSourceType.DIRECT_API,
            "sync_confidence": 0.82 if pipe["vercel_deployments_flat"] else 0.0,
            "last_synced_at": _utcnow_iso(),
            "deployments": pipe["vercel_deployments_flat"],
            "project_meta": vercel_ex.get("project"),
            **{k: v for k, v in vercel_ex.items() if k != "project"},
        },
        "railway": {
            "configured": bool(
                settings.OPS_RAILWAY_TOKEN
                and getattr(settings, "OPS_RAILWAY_PROJECT_ID", None)
            ),
            "ok": bool(pipe["railway_deployments_flat"]),
            "source_type": SyncSourceType.DIRECT_API,
            "sync_confidence": 0.8 if pipe["railway_deployments_flat"] else 0.0,
            "last_synced_at": _utcnow_iso(),
            "deployments": pipe["railway_deployments_flat"],
            "graphql_meta": railway_ex,
        },
    }


def _ensure_provider_stubs(accounts: list[AIUsageAccount]) -> None:
    prov = {a.provider_name for a in accounts}
    if "anthropic" not in prov:
        accounts.append(_anthropic_placeholder())
    if "cursor" not in prov:
        accounts.append(_cursor_placeholder())
    if "github_copilot" not in prov:
        accounts.append(_copilot_placeholder())


async def build_control_tower_snapshot(*, persist: bool = False) -> dict[str, Any]:
    ga = _utcnow_iso()
    accounts: list[AIUsageAccount] = []
    accounts.extend(_manual_accounts_from_env())

    pipe = await run_connector_pipeline()
    accounts.extend(pipe["ai_accounts_from_connectors"])
    _ensure_provider_stubs(accounts)

    ai_metrics = _aggregate_ai_metrics(accounts)
    alerts = _build_alerts(accounts)

    repo_intel = await build_repo_intelligence_snapshot()
    gh = repo_intel.get("github_extended")

    deployments = _merge_deployments(pipe)
    errors = _error_unified_panel(pipe["connector_errors"])

    manual_merge = _safe_json_loads(
        (
            settings.OPS_CONTROL_TOWER_MANUAL_JSON
            or os.getenv("OPS_CONTROL_TOWER_MANUAL_JSON")
            or ""
        ).strip()
    )

    unified_obs = await build_unified_observability_async(
        connector_payloads=pipe["connector_payloads"],
        connector_errors_flat=pipe["connector_errors"],
        vercel_deployments=pipe["vercel_deployments_flat"],
        railway_deployments=pipe["railway_deployments_flat"],
        generated_at=ga,
        manual=manual_merge,
    )

    snapshot: dict[str, Any] = {
        "generated_at": ga,
        "control_tower_version": 2,
        "cache_ttl_seconds": int(_CACHE_TTL),
        "ai_usage": {
            "accounts": [a.model_dump() for a in accounts],
            **ai_metrics,
        },
        "connectors": pipe["connector_payloads"],
        "github": gh,
        "repo_intelligence": repo_intel,
        "deployments": deployments,
        "errors": errors,
        "unified_observability": unified_obs,
        "integrations": _integrations_matrix(),
        "alerts": alerts,
        "audit_sync_logs": _audit_entries(persist),
        "last_persisted_snapshot": ct_store.load_last_snapshot(),
        "connector_sync_state": ct_store.load_sync_state(),
        "automation_summary": {
            "fully_automated": [
                x["id"] for x in _integrations_matrix() if x.get("automation") == "full"
            ],
            "partial": [
                x["id"]
                for x in _integrations_matrix()
                if x.get("automation") == "partial"
            ],
            "manual_or_placeholder": [
                x["id"]
                for x in _integrations_matrix()
                if x.get("automation") in ("none", None)
            ],
        },
        "limitations": (
            "OpenAI billing dashboards may 403 on restricted keys. Anthropic requires Admin API keys. "
            "Copilot metrics need org policy. Cursor has no public usage API. "
            "LOC scan runs only when OPS_REPO_INTEL_ROOT or monorepo root is available. "
            "Railway GraphQL requires project id + token with access."
        ),
    }

    if manual_merge:
        snapshot["manual_overrides_merged"] = True
        for k, v in manual_merge.items():
            if k in snapshot and isinstance(snapshot[k], dict) and isinstance(v, dict):
                snapshot[k] = {**snapshot[k], **v}
            else:
                snapshot[k] = v

    if persist:
        try:
            ct_store.persist_snapshot(snapshot)
            ct_store.persist_sync_state(
                {k: v.get("sync_status") for k, v in pipe["connector_payloads"].items()}
            )
        except Exception as exc:
            logger.warning("ops_control_tower.persist_failed", error=str(exc))

    return snapshot


async def refresh_control_tower_snapshot() -> dict[str, Any]:
    """Bypass TTL, rebuild, persist connector state + snapshot."""
    global _CACHE, _CACHE_AT
    snap = await build_control_tower_snapshot(persist=True)
    _CACHE = {k: v for k, v in snap.items() if k not in ("cache_hit",)}
    _CACHE_AT = time.monotonic()
    return {**snap, "cache_hit": False, "refreshed": True}


async def get_control_tower_snapshot_cached(
    *, force_refresh: bool = False
) -> dict[str, Any]:
    global _CACHE, _CACHE_AT
    if force_refresh:
        return await refresh_control_tower_snapshot()
    now = time.monotonic()
    if _CACHE is not None and (now - _CACHE_AT) < _CACHE_TTL:
        return {**_CACHE, "cache_hit": True}
    snap = await build_control_tower_snapshot(persist=False)
    _CACHE = snap
    _CACHE_AT = now
    return {**snap, "cache_hit": False}
