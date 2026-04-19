"""
Unified deployment + incident layer for admin (not a SIEM — operational summary only).
"""

from __future__ import annotations

import datetime
import hashlib
import json
import os
from typing import Any

import httpx
import structlog
from pydantic import BaseModel

from core.config import settings
from services.request_metrics import http_stats_last_hours

logger = structlog.get_logger(__name__)

STALE_SECONDS = 2 * 3600
FAILED_DEPLOY_LOOKBACK_DAYS = 7


class UnifiedIncident(BaseModel):
    source: str
    severity: str = "info"
    service: str | None = None
    environment: str | None = None
    title: str
    fingerprint: str
    first_seen: str | None = None
    last_seen: str | None = None
    count: int | None = 1
    latest_message: str | None = None
    status: str = "open"
    remediation_link: str | None = None
    route_or_module: str | None = None


class UnifiedDeploymentView(BaseModel):
    platform: str
    deployment_id: str | None = None
    status: str | None = None
    environment: str | None = None
    commit_sha: str | None = None
    created_at: str | None = None
    duration_ms: int | None = None
    build_error_hint: str | None = None
    runtime_error_count_24h: int | None = None
    rollback_candidate: bool = False
    url: str | None = None
    service_name: str | None = None
    logs_summary: str = (
        "Logs not fetched in this summary — open provider UI for full logs."
    )
    related_route: str | None = None


class SourceFreshness(BaseModel):
    source: str
    last_success_at: str | None = None
    last_attempt_at: str | None = None
    stale: bool = False
    ingest_error: str | None = None


def _vercel_url(url: str | None) -> str | None:
    if not url:
        return None
    s = str(url)
    if s.startswith("http"):
        return s
    return f"https://{s}"


def _fp(source: str, title: str, service: str | None) -> str:
    raw = f"{source}|{title}|{service or ''}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def _parse_ts(s: str | None) -> datetime.datetime | None:
    if not s:
        return None
    try:
        return datetime.datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def _within_days(ts: str | None, days: int) -> bool:
    dt = _parse_ts(ts)
    if not dt:
        return False
    now = datetime.datetime.now(datetime.UTC)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.UTC)
    return (now - dt).days <= days


def _deployment_to_view(
    d: dict[str, Any], platform: str, *, is_latest: bool
) -> UnifiedDeploymentView:
    st = str(d.get("status") or "").upper()
    env = str(d.get("environment") or d.get("target") or "")
    failed = st in ("ERROR", "FAILED", "CANCELED", "CRASHED")
    rollback = bool(is_latest and failed)
    return UnifiedDeploymentView(
        platform=platform,
        deployment_id=d.get("id"),
        status=d.get("status"),
        environment=env or None,
        commit_sha=d.get("commit_sha"),
        created_at=d.get("created_at"),
        duration_ms=d.get("duration_ms"),
        build_error_hint=d.get("build_error_hint") or d.get("error_message"),
        runtime_error_count_24h=None,
        rollback_candidate=rollback,
        url=d.get("url"),
        service_name=d.get("service_name"),
    )


async def _sentry_issues() -> list[UnifiedIncident]:
    tok = getattr(settings, "OPS_SENTRY_AUTH_TOKEN", None)
    org = getattr(settings, "OPS_SENTRY_ORG", None)
    proj = getattr(settings, "OPS_SENTRY_PROJECT", None)
    if not tok or not org or not proj:
        return []
    url = f"https://sentry.io/api/0/projects/{org}/{proj}/issues/"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(
                url,
                headers={"Authorization": f"Bearer {tok}"},
                params={"query": "is:unresolved", "limit": "8"},
            )
        if r.status_code != 200:
            logger.debug("sentry.issues_http", status=r.status_code)
            return []
        rows = r.json()
        if not isinstance(rows, list):
            return []
        out: list[UnifiedIncident] = []
        for row in rows:
            title = str(row.get("title") or "Sentry issue")
            cid = str(row.get("id") or "")
            out.append(
                UnifiedIncident(
                    source="sentry",
                    severity=str(row.get("level") or "error"),
                    service=proj,
                    environment=None,
                    title=title,
                    fingerprint=_fp("sentry", title, cid),
                    first_seen=row.get("firstSeen"),
                    last_seen=row.get("lastSeen"),
                    count=int(row.get("count") or 1),
                    latest_message=row.get("culprit"),
                    status="open",
                    remediation_link=(
                        f"https://sentry.io/issues/{row.get('id')}/"
                        if row.get("id")
                        else None
                    ),
                )
            )
        return out
    except Exception as exc:
        logger.warning("sentry.fetch_failed", error=str(exc))
        return []


async def build_unified_observability_async(
    *,
    connector_payloads: dict[str, Any],
    connector_errors_flat: list[dict[str, Any]],
    vercel_deployments: list[dict[str, Any]],
    railway_deployments: list[dict[str, Any]],
    generated_at: str,
    manual: dict[str, Any] | None,
) -> dict[str, Any]:
    http = http_stats_last_hours(24.0)
    incidents: list[UnifiedIncident] = []
    ingest_notes: list[str] = []

    # Connector / process errors
    for e in connector_errors_flat:
        title = str(
            e.get("title") or e.get("detail") or e.get("message") or "Connector error"
        )[:500]
        src = str(e.get("source") or "unknown")
        incidents.append(
            UnifiedIncident(
                source=src,
                severity=str(e.get("severity") or "error"),
                service=e.get("service"),
                environment=e.get("environment"),
                title=title,
                fingerprint=_fp(src, title, str(e.get("service"))),
                first_seen=e.get("first_seen") or generated_at,
                last_seen=e.get("last_seen") or generated_at,
                count=int(e.get("count") or 1),
                latest_message=e.get("detail"),
                status="open",
            )
        )

    # Failed deploys (last 7d) as incidents
    for d in vercel_deployments:
        st = str(d.get("status") or "").upper()
        if st in ("ERROR", "FAILED", "CANCELED") and _within_days(
            d.get("created_at"), FAILED_DEPLOY_LOOKBACK_DAYS
        ):
            title = f"Vercel deploy {st}"
            incidents.append(
                UnifiedIncident(
                    source="vercel",
                    severity="error",
                    service="vercel",
                    environment=str(d.get("environment") or ""),
                    title=title,
                    fingerprint=_fp("vercel", title, d.get("id")),
                    last_seen=d.get("created_at"),
                    latest_message=d.get("build_error_hint") or d.get("url"),
                    status="open",
                    remediation_link=_vercel_url(d.get("url")),
                )
            )

    for d in railway_deployments:
        st = str(d.get("status") or "").upper()
        if st in ("FAILED", "CRASHED", "ERROR") and _within_days(
            d.get("created_at"), FAILED_DEPLOY_LOOKBACK_DAYS
        ):
            title = f"Railway deploy {st}"
            incidents.append(
                UnifiedIncident(
                    source="railway",
                    severity="error",
                    service=d.get("service_name") or "railway",
                    environment="production",
                    title=title,
                    fingerprint=_fp("railway", title, d.get("id")),
                    last_seen=d.get("created_at"),
                    latest_message=d.get("id"),
                    status="open",
                )
            )

    # API process — synthetic if elevated 5xx
    er = http.get("error_rate_pct")
    if isinstance(er, int | float) and er >= 2.0:
        incidents.append(
            UnifiedIncident(
                source="neufin_api",
                severity="warning",
                service="fastapi",
                environment="in_process",
                title=f"Elevated HTTP 5xx rate ({er}%)",
                fingerprint=_fp("api", "5xx_rate", None),
                last_seen=generated_at,
                count=int(http.get("sample_count") or 0) or None,
                latest_message="Ring buffer over last 24h — not distributed tracing.",
                status="open",
            )
        )

    # Sentry
    try:
        sentry_rows = await _sentry_issues()
        incidents.extend(sentry_rows)
    except Exception as exc:
        ingest_notes.append(f"sentry: {exc}")

    # Manual / job failures from env JSON
    raw_manual = (
        settings.OPS_CONTROL_TOWER_MANUAL_JSON
        or os.getenv("OPS_CONTROL_TOWER_MANUAL_JSON")
        or ""
    ).strip()
    mj = manual or {}
    if not mj and raw_manual:
        try:
            mj = json.loads(raw_manual)
        except json.JSONDecodeError:
            mj = {}
    for row in mj.get("unified_incidents") or mj.get("job_failures") or []:
        if not isinstance(row, dict):
            continue
        try:
            incidents.append(UnifiedIncident.model_validate(row))
        except Exception:
            ingest_notes.append("skipped_invalid_unified_incident_row")

    # Aggregate recurring by fingerprint
    by_fp: dict[str, UnifiedIncident] = {}
    for inc in incidents:
        prev = by_fp.get(inc.fingerprint)
        if prev is None:
            by_fp[inc.fingerprint] = inc
        else:
            by_fp[inc.fingerprint] = prev.model_copy(
                update={
                    "count": (prev.count or 1) + (inc.count or 1),
                    "last_seen": max(
                        str(prev.last_seen or ""),
                        str(inc.last_seen or ""),
                    ),
                }
            )
    merged = list(by_fp.values())
    merged.sort(key=lambda x: -(x.count or 0))

    # Deployments per platform
    def latest_and_failed(
        rows: list[dict[str, Any]], plat: str
    ) -> tuple[UnifiedDeploymentView | None, list[UnifiedDeploymentView]]:
        if not rows:
            return None, []
        latest = _deployment_to_view(rows[0], plat, is_latest=True)
        failed = [
            _deployment_to_view(r, plat, is_latest=(i == 0))
            for i, r in enumerate(rows)
            if str(r.get("status") or "").upper()
            in ("ERROR", "FAILED", "CANCELED", "CRASHED")
            and _within_days(r.get("created_at"), FAILED_DEPLOY_LOOKBACK_DAYS)
        ]
        return latest, failed

    v_latest, v_fail = latest_and_failed(vercel_deployments, "vercel")
    r_latest, r_fail = latest_and_failed(railway_deployments, "railway")

    # Freshness / stale
    now_ts = datetime.datetime.now(datetime.UTC).timestamp()
    freshness: list[SourceFreshness] = []
    for cid, payload in connector_payloads.items():
        ss = (payload or {}).get("sync_status") or {}
        ls = ss.get("last_success_at")
        la = ss.get("last_attempt_at")
        stale = False
        if ls:
            p = _parse_ts(ls)
            if p and (now_ts - p.timestamp()) > STALE_SECONDS:
                stale = True
        freshness.append(
            SourceFreshness(
                source=cid,
                last_success_at=ls,
                last_attempt_at=la,
                stale=stale,
                ingest_error=ss.get("error_message"),
            )
        )

    env_breakdown: dict[str, int] = {}
    for inc in merged:
        e = inc.environment or "unknown"
        env_breakdown[e] = env_breakdown.get(e, 0) + (inc.count or 1)

    failing_services = sorted(
        {i.service for i in merged if i.severity in ("error", "fatal") and i.service}
    )

    return {
        "generated_at": generated_at,
        "disclaimer": (
            "Operational summary only — not a SIEM. Log drill-down requires provider consoles."
        ),
        "incidents": {
            "current": [i.model_dump() for i in merged[:40]],
            "failing_services": failing_services,
            "top_recurring": [i.model_dump() for i in merged[:15]],
            "environment_breakdown": env_breakdown,
        },
        "deployments": {
            "vercel": {
                "latest": v_latest.model_dump() if v_latest else None,
                "failed_last_7d": [x.model_dump() for x in v_fail[:20]],
            },
            "railway": {
                "latest": r_latest.model_dump() if r_latest else None,
                "failed_last_7d": [x.model_dump() for x in r_fail[:20]],
            },
        },
        "service_health": {
            "http_24h": http,
            "sources": [s.model_dump() for s in freshness],
            "ingest_notes": ingest_notes,
        },
    }
