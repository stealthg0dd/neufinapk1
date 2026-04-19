"""
NeuFin Admin Control Tower — aggregated observability for ops (admin JWT only).

Design:
- Normalized Pydantic-friendly dicts for AI usage accounts, GitHub, deploys, errors.
- Adapters are explicit about sync method; nothing is fake-automated.
- Optional external calls: GitHub REST, OpenAI billing (best-effort), Vercel, Railway.
- Manual / import overrides via OPS_CONTROL_TOWER_MANUAL_JSON (JSON object).
"""

from __future__ import annotations

import datetime
import json
import os
import time
from typing import Any

import httpx
import structlog
from pydantic import BaseModel, Field

from core.config import settings
from services.request_metrics import http_stats_last_hours

logger = structlog.get_logger(__name__)

_CACHE: dict[str, Any] | None = None
_CACHE_AT: float = 0.0
_CACHE_TTL = 60.0


class SyncSourceType:
    DIRECT_API = "direct_api"
    EXPORT_IMPORT = "export_import"
    MANUAL_OVERRIDE = "manual_override"
    DASHBOARD_PLACEHOLDER = "dashboard_placeholder"


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


# ── AI usage account (normalized) ─────────────────────────────────────────────


class AIUsageAccount(BaseModel):
    provider_name: str
    account_name: str
    workspace_or_org: str | None = None
    model_name: str | None = None
    billing_cycle_start: str | None = None
    billing_cycle_end: str | None = None
    quota_type: str = "unknown"
    quota_limit: float | None = None
    quota_used: float | None = None
    quota_remaining: float | None = None
    cost_to_date_usd: float | None = None
    estimated_runway_days: float | None = None
    refresh_source: str
    last_synced_at: str | None = None
    sync_confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="1.0 = verified API read; 0 = manual stub",
    )
    notes: str | None = None


def _manual_accounts_from_env() -> list[AIUsageAccount]:
    """Optional OPS_CONTROL_TOWER_MANUAL_JSON key `ai_accounts` list."""
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


async def _openai_billing_probe(api_key: str) -> list[AIUsageAccount] | None:
    """
    Best-effort: OpenAI billing subscription endpoint (may 403 on restricted keys).
    Returns None if not usable — callers should not treat as failure.
    """
    url = "https://api.openai.com/v1/dashboard/billing/subscription"
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(
                url,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
            )
    except Exception as exc:
        logger.debug("ops_control_tower.openai_billing_net", error=str(exc))
        return None
    if r.status_code != 200:
        logger.debug(
            "ops_control_tower.openai_billing_status",
            status=r.status_code,
        )
        return None
    try:
        body = r.json()
    except Exception:
        return None
    hard_limit = body.get("hard_limit_usd")
    plan = body.get("plan") or {}
    title = str(plan.get("title") or "openai_org")
    return [
        AIUsageAccount(
            provider_name="openai",
            account_name=title,
            workspace_or_org=str(body.get("id") or "primary"),
            model_name=None,
            billing_cycle_start=None,
            billing_cycle_end=None,
            quota_type="billing_account",
            quota_limit=float(hard_limit) if hard_limit is not None else None,
            quota_used=None,
            quota_remaining=None,
            cost_to_date_usd=None,
            estimated_runway_days=None,
            refresh_source=SyncSourceType.DIRECT_API,
            last_synced_at=_utcnow_iso(),
            sync_confidence=0.85,
            notes="Subscription object from OpenAI billing API (limits; not per-model spend).",
        )
    ]


def _anthropic_placeholder() -> AIUsageAccount:
    return AIUsageAccount(
        provider_name="anthropic",
        account_name="primary",
        workspace_or_org=None,
        model_name=None,
        billing_cycle_start=None,
        billing_cycle_end=None,
        quota_type="usage_api_not_wired",
        quota_limit=None,
        quota_used=None,
        quota_remaining=None,
        cost_to_date_usd=None,
        estimated_runway_days=None,
        refresh_source=SyncSourceType.DASHBOARD_PLACEHOLDER,
        last_synced_at=_utcnow_iso(),
        sync_confidence=0.0,
        notes=(
            "Anthropic usage is not pulled automatically in this build. "
            "Export from console.anthropic.com or add OPS_CONTROL_TOWER_MANUAL_JSON."
        ),
    )


def _cursor_copilot_placeholders() -> list[AIUsageAccount]:
    return [
        AIUsageAccount(
            provider_name="cursor",
            account_name="team_pool",
            quota_type="manual_or_import",
            refresh_source=SyncSourceType.MANUAL_OVERRIDE,
            last_synced_at=_utcnow_iso(),
            sync_confidence=0.0,
            notes="Cursor billing has no public usage API here — paste usage into manual JSON.",
        ),
        AIUsageAccount(
            provider_name="github_copilot",
            account_name="org_seat",
            quota_type="aggregated",
            refresh_source=SyncSourceType.DASHBOARD_PLACEHOLDER,
            last_synced_at=_utcnow_iso(),
            sync_confidence=0.0,
            notes="Copilot: use GitHub billing export or manual JSON until an API is configured.",
        ),
    ]


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


# ── GitHub ────────────────────────────────────────────────────────────────────


async def _github_repo_intel(token: str, repo: str) -> dict[str, Any] | None:
    owner, _, name = repo.partition("/")
    if not name:
        return None
    base = "https://api.github.com"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            r = await client.get(f"{base}/repos/{owner}/{name}", headers=headers)
            if r.status_code != 200:
                return {
                    "ok": False,
                    "status": r.status_code,
                    "source_type": SyncSourceType.DIRECT_API,
                    "sync_confidence": 0.0,
                    "error": r.text[:200],
                }
            repo_json = r.json()
            lang_r = await client.get(
                f"{base}/repos/{owner}/{name}/languages", headers=headers
            )
            langs: dict[str, int] = {}
            if lang_r.status_code == 200:
                langs = {str(k): int(v) for k, v in (lang_r.json() or {}).items()}
            part_r = await client.get(
                f"{base}/repos/{owner}/{name}/stats/participation", headers=headers
            )
            weeks: list[int] = []
            if part_r.status_code == 200:
                pj = part_r.json() or {}
                weeks = list(pj.get("all") or [])[-12:]
            open_prs = None
            pr_r = await client.get(
                f"{base}/repos/{owner}/{name}/pulls?state=open&per_page=1",
                headers=headers,
            )
            if pr_r.status_code == 200:
                link = pr_r.headers.get("link") or ""
                if 'rel="last"' in link:
                    import re

                    m = re.search(r"page=(\d+)>; rel=\"last\"", link)
                    if m:
                        open_prs = int(m.group(1))
                elif isinstance(pr_r.json(), list):
                    open_prs = len(pr_r.json())
            total_bytes = sum(langs.values()) if langs else None
            return {
                "ok": True,
                "source_type": SyncSourceType.DIRECT_API,
                "sync_confidence": 0.9,
                "last_synced_at": _utcnow_iso(),
                "repository": repo,
                "description": repo_json.get("description"),
                "default_branch": repo_json.get("default_branch"),
                "stars": repo_json.get("stargazers_count"),
                "forks": repo_json.get("forks_count"),
                "open_issues": repo_json.get("open_issues_count"),
                "open_pull_requests_hint": open_prs,
                "size_kb": repo_json.get("size"),
                "pushed_at": repo_json.get("pushed_at"),
                "languages_bytes": langs,
                "languages_total_bytes": total_bytes,
                "commit_activity_last_12_weeks": weeks,
                "notes": (
                    "LOC by language from /languages (bytes, not lines). "
                    "Open PR count from Link header when paginated; may be null."
                ),
            }
    except Exception as exc:
        logger.warning("ops_control_tower.github_error", error=str(exc))
        return {
            "ok": False,
            "source_type": SyncSourceType.DIRECT_API,
            "sync_confidence": 0.0,
            "error": str(exc),
        }


# ── Deployments (best-effort) ─────────────────────────────────────────────────


async def _vercel_deployments_hint() -> dict[str, Any]:
    tok = settings.OPS_VERCEL_TOKEN
    pid = settings.OPS_VERCEL_PROJECT_ID
    team = settings.OPS_VERCEL_TEAM_ID
    if not tok or not pid:
        return {
            "configured": False,
            "source_type": SyncSourceType.MANUAL_OVERRIDE,
            "notes": "Set OPS_VERCEL_TOKEN and OPS_VERCEL_PROJECT_ID (and OPS_VERCEL_TEAM_ID if on team scope).",
        }
    q = f"projectId={pid}&limit=5"
    if team:
        q += f"&teamId={team}"
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(
                f"https://api.vercel.com/v6/deployments?{q}",
                headers={"Authorization": f"Bearer {tok}"},
            )
        if r.status_code != 200:
            return {
                "configured": True,
                "ok": False,
                "status": r.status_code,
                "source_type": SyncSourceType.DIRECT_API,
                "body": r.text[:300],
            }
        data = r.json()
        dep = data.get("deployments") or []
        items = []
        for d in dep[:8]:
            items.append(
                {
                    "id": d.get("uid"),
                    "url": d.get("url"),
                    "state": d.get("state"),
                    "created": d.get("createdAt"),
                    "target": d.get("target"),
                }
            )
        return {
            "configured": True,
            "ok": True,
            "source_type": SyncSourceType.DIRECT_API,
            "sync_confidence": 0.8,
            "last_synced_at": _utcnow_iso(),
            "deployments": items,
        }
    except Exception as exc:
        return {
            "configured": True,
            "ok": False,
            "error": str(exc),
            "source_type": SyncSourceType.DIRECT_API,
        }


def _railway_placeholder() -> dict[str, Any]:
    if not settings.OPS_RAILWAY_TOKEN:
        return {
            "configured": False,
            "source_type": SyncSourceType.MANUAL_OVERRIDE,
            "notes": "Railway GraphQL not wired. Set OPS_RAILWAY_TOKEN for future automation.",
        }
    return {
        "configured": True,
        "source_type": SyncSourceType.DASHBOARD_PLACEHOLDER,
        "sync_confidence": 0.0,
        "notes": "Token present; per-service deploy feed not implemented in this slice — use Railway UI or extend adapter.",
    }


# ── Errors / system (reuse in-process metrics) ────────────────────────────────


def _error_unified_panel() -> dict[str, Any]:
    http_stats = http_stats_last_hours(24.0)
    return {
        "api_process_24h": {
            "http_5xx_rate_pct": http_stats.get("error_rate_pct"),
            "http_sample_count": http_stats.get("sample_count"),
            "p50_ms": http_stats.get("p50_ms"),
            "p95_ms": http_stats.get("p95_ms"),
            "source": "in_process_ring_buffer",
        },
        "external_connectors": [
            {
                "name": "sentry",
                "status": "not_queried",
                "source_type": SyncSourceType.MANUAL_OVERRIDE,
                "notes": "Wire Sentry API or embed issue counts in OPS_CONTROL_TOWER_MANUAL_JSON.",
            },
            {
                "name": "posthog",
                "status": "not_queried",
                "source_type": SyncSourceType.MANUAL_OVERRIDE,
                "notes": "Use PostHog project API for error trends.",
            },
            {
                "name": "stripe_webhooks",
                "status": "not_queried",
                "source_type": SyncSourceType.MANUAL_OVERRIDE,
                "notes": "Surface Stripe Dashboard webhook delivery failures.",
            },
        ],
        "top_recurring_messages": [],
    }


def _integrations_matrix() -> list[dict[str, Any]]:
    return [
        {
            "id": "openai",
            "automation": "partial" if settings.OPENAI_KEY else "none",
            "detail": "Billing subscription probe when OPENAI_KEY is set.",
        },
        {
            "id": "anthropic",
            "automation": "none",
            "detail": "No usage pull in this build.",
        },
        {
            "id": "github",
            "automation": "full" if settings.OPS_GITHUB_TOKEN else "none",
            "detail": "REST repo + languages + participation when token set.",
        },
        {
            "id": "vercel",
            "automation": "partial" if settings.OPS_VERCEL_TOKEN else "none",
        },
        {
            "id": "railway",
            "automation": "none",
        },
    ]


def _audit_stub() -> list[dict[str, Any]]:
    return [
        {
            "at": _utcnow_iso(),
            "event": "control_tower_snapshot",
            "message": "In-memory TTL cache; no persistent audit log yet.",
        }
    ]


async def build_control_tower_snapshot() -> dict[str, Any]:
    accounts: list[AIUsageAccount] = []
    accounts.extend(_manual_accounts_from_env())

    okey = settings.OPENAI_KEY
    if okey:
        oa = await _openai_billing_probe(okey)
        if oa:
            accounts.extend(oa)
    if not any(a.provider_name == "anthropic" for a in accounts):
        accounts.append(_anthropic_placeholder())
    accounts.extend(_cursor_copilot_placeholders())

    ai_metrics = _aggregate_ai_metrics(accounts)
    alerts = _build_alerts(accounts)

    gh: dict[str, Any] | None = None
    if settings.OPS_GITHUB_TOKEN and settings.OPS_GITHUB_REPO:
        gh = await _github_repo_intel(
            settings.OPS_GITHUB_TOKEN, settings.OPS_GITHUB_REPO.strip()
        )

    vercel = await _vercel_deployments_hint()
    railway = _railway_placeholder()
    errors = _error_unified_panel()

    manual_merge = _safe_json_loads(
        (
            settings.OPS_CONTROL_TOWER_MANUAL_JSON
            or os.getenv("OPS_CONTROL_TOWER_MANUAL_JSON")
            or ""
        ).strip()
    )
    snapshot: dict[str, Any] = {
        "generated_at": _utcnow_iso(),
        "cache_ttl_seconds": int(_CACHE_TTL),
        "ai_usage": {
            "accounts": [a.model_dump() for a in accounts],
            **ai_metrics,
        },
        "github": gh,
        "deployments": {"vercel": vercel, "railway": railway},
        "errors": errors,
        "integrations": _integrations_matrix(),
        "alerts": alerts,
        "audit_sync_logs": _audit_stub(),
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
            "Per-model spend and multi-account Claude/Cursor/Copilot require manual JSON or future billing APIs. "
            "Vercel/Railway surfaces are feature-flagged via env. Error panel uses in-process HTTP stats only unless extended."
        ),
    }
    if manual_merge:
        snapshot["manual_overrides_merged"] = True
        for k, v in manual_merge.items():
            if k in snapshot and isinstance(snapshot[k], dict) and isinstance(v, dict):
                snapshot[k] = {**snapshot[k], **v}
            else:
                snapshot[k] = v
    return snapshot


async def get_control_tower_snapshot_cached() -> dict[str, Any]:
    global _CACHE, _CACHE_AT
    now = time.monotonic()
    if _CACHE is not None and (now - _CACHE_AT) < _CACHE_TTL:
        return {**_CACHE, "cache_hit": True}
    snap = await build_control_tower_snapshot()
    _CACHE = snap
    _CACHE_AT = now
    return {**snap, "cache_hit": False}
