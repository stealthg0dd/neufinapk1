"""
runtime_monitor.py — aggregates live errors from Sentry, Railway, Vercel, and mobile.

Webhook endpoints:
  POST /webhooks/sentry   — Sentry issue alerts
  POST /webhooks/mobile   — Expo/Sentry mobile crash reports

Polled by APScheduler (wired in main.py):
  check_railway_health()  — every 5 min
  check_vercel_analytics() — every 60 min
"""

import logging
import os
import uuid
from datetime import datetime, UTC, timedelta

import aiosqlite
import httpx
from fastapi import APIRouter, Request

from core.audit_log import DB_PATH, upsert_issues
from core.notifier import notify_critical
from detectors import Issue

log = logging.getLogger("neufin-agent.runtime_monitor")
router = APIRouter(prefix="/webhooks", tags=["webhooks"])

RAILWAY_HEALTH_URL = os.getenv(
    "RAILWAY_HEALTH_URL",
    "https://neufin101-production.up.railway.app/health",
)
VERCEL_TOKEN = os.getenv("VERCEL_TOKEN", "")
VERCEL_PROJECT_ID = os.getenv("VERCEL_PROJECT_ID", "")

# Track consecutive Railway failures in-process (reset on restart, acceptable)
_railway_consecutive_failures: int = 0

# Sentry poll health state (in-memory for lightweight observability)
_sentry_poll_health: dict[str, object] = {
    "status": "never_run",
    "last_poll_at": None,
    "last_success_at": None,
    "last_ingested_count": 0,
    "projects_checked": 0,
    "last_error": "",
}

# ── DB schema ─────────────────────────────────────────────────────────────

CREATE_RUNTIME_EVENTS = """
CREATE TABLE IF NOT EXISTS runtime_events (
    id          TEXT PRIMARY KEY,
    source      TEXT,          -- sentry | railway | vercel | mobile
    severity    TEXT,
    message     TEXT,
    stack_trace TEXT,
    user_id     TEXT,
    environment TEXT,
    occurred_at TEXT,
    resolved_at TEXT,
    fix_applied INTEGER DEFAULT 0
);
"""


async def init_runtime_db() -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(CREATE_RUNTIME_EVENTS)
        await db.commit()


async def _store_event(
    source: str,
    severity: str,
    message: str,
    stack_trace: str = "",
    user_id: str = "",
    environment: str = "production",
) -> str:
    event_id = str(uuid.uuid4())
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT INTO runtime_events
                (id, source, severity, message, stack_trace, user_id, environment, occurred_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event_id,
                source,
                severity,
                message,
                stack_trace,
                user_id,
                environment,
                datetime.now(UTC).isoformat(),
            ),
        )
        await db.commit()
    return event_id


# ── Exception-type → severity mapping ────────────────────────────────────

_EXCEPTION_SEVERITY: dict[str, str] = {
    "AuthException": "critical",
    "AuthError": "critical",
    "PaymentException": "critical",
    "StripeException": "critical",
    "TypeError": "high",
    "NullPointerError": "high",
    "AttributeError": "high",
    "KeyError": "high",
    "NetworkError": "medium",
    "TimeoutError": "medium",
    "ConnectionError": "medium",
    "404": "low",
    "422": "low",
    "NotFoundError": "low",
}

_SENTRY_LEVEL_SEVERITY: dict[str, str] = {
    "fatal": "critical",
    "error": "high",
    "warning": "medium",
    "info": "low",
    "debug": "low",
}


def _classify_sentry(event: dict) -> str:
    """Derive severity from exception type first, fall back to Sentry level."""
    exc_type = (
        event.get("exception", {})
        .get("values", [{}])[0]
        .get("type", "")
    )
    for pattern, sev in _EXCEPTION_SEVERITY.items():
        if pattern.lower() in exc_type.lower():
            return sev
    return _SENTRY_LEVEL_SEVERITY.get(event.get("level", "error"), "high")


def _extract_stack(event: dict) -> str:
    frames = (
        event.get("exception", {})
        .get("values", [{}])[0]
        .get("stacktrace", {})
        .get("frames", [])
    )
    if not frames:
        frames = event.get("stacktrace", {}).get("frames", [])
    return "\n".join(
        f"{f.get('filename', '?')}:{f.get('lineno', '?')} in {f.get('function', '?')}"
        for f in frames[-5:]  # top 5 frames
    )


# ── Sentry webhook ─────────────────────────────────────────────────────────

@router.post("/sentry")
async def receive_sentry_event(request: Request) -> dict:
    try:
        payload = await request.json()
    except Exception:
        return {"status": "ignored", "reason": "invalid json"}

    # Sentry sends two shapes:
    #   Issue Alert: {action, data: {issue: {...}}}
    #   Error Alert: {action, data: {event: {...}}}
    #   Legacy:      raw event dict
    data_block = payload.get("data", {})
    event = data_block.get("event") or data_block.get("issue") or payload.get("event") or payload

    severity = _classify_sentry(event)
    title    = event.get("title", event.get("message", "Unknown error"))
    culprit  = event.get("culprit", "unknown")
    project  = event.get("project", event.get("project_slug", payload.get("project", "unknown")))
    environment = event.get("environment", "production")
    user_id  = (
        event.get("user", {}).get("id", "")
        or event.get("user", {}).get("email", "")
    )

    # Sentry issue-level fields (present in Issue Alert payloads)
    sentry_url    = event.get("permalink", event.get("url", ""))
    occurrences   = int(event.get("count", event.get("times_seen", 1)) or 1)
    affected_users= int(event.get("userCount", event.get("users_seen", 0)) or 0)

    # File + line from innermost frame
    frames = (
        event.get("exception", {})
        .get("values", [{}])[0]
        .get("stacktrace", {})
        .get("frames", [])
    ) or event.get("stacktrace", {}).get("frames", [])
    top = frames[-1] if frames else {}
    file_path  = top.get("filename", culprit)
    line       = top.get("lineno", 0)
    stack_trace = _extract_stack(event)

    # Upgrade severity if many users are affected
    if affected_users >= 10 and severity not in ("critical",):
        severity = "critical"
    elif affected_users >= 3 and severity == "medium":
        severity = "high"

    suggested_fix = (
        f"Sentry: {culprit} — {occurrences} occurrences, {affected_users} users affected. "
        f"Investigate in Sentry dashboard; check recent deploys."
    )

    issue = Issue(
        severity=severity,
        type="runtime_error",
        file=file_path,
        line=int(line),
        message=f"[sentry] {title}",
        suggested_fix=suggested_fix,
        auto_fixable=False,
        requires_human=severity in ("critical", "high"),
        repo=project,
        source="sentry",
        sentry_url=sentry_url,
        occurrences=occurrences,
        affected_users=affected_users,
    )

    await upsert_issues([issue.to_dict()])
    await _store_event("sentry", severity, title, stack_trace, user_id, environment)

    if severity in ("critical", "high"):
        await notify_critical(issue.to_dict())

    # Trigger targeted file scan for critical runtime errors
    if severity == "critical" and file_path and file_path != "unknown":
        import asyncio as _aio
        from pathlib import Path as _Path
        import detectors.secret_scanner as _secret
        repo_root = _Path(os.getenv("REPO_ROOT", "/app/repo_to_scan"))
        abs_path = repo_root / file_path
        if abs_path.exists():
            raw: list = []
            _secret._scan_file(abs_path, project, raw)
            if raw:
                await upsert_issues([i.to_dict() if hasattr(i, "to_dict") else i for i in raw])

    log.info({
        "action": "sentry_ingested",
        "severity": severity,
        "file": file_path,
        "project": project,
        "env": environment,
        "occurrences": occurrences,
        "affected_users": affected_users,
    })
    return {"status": "ok", "issue_id": issue.id, "severity": severity}


# ── Mobile crash webhook ───────────────────────────────────────────────────

@router.post("/mobile")
async def receive_mobile_crash(request: Request) -> dict:
    try:
        payload = await request.json()
    except Exception:
        return {"status": "ignored", "reason": "invalid json"}

    crash_free_rate: float | None = payload.get("crash_free_sessions")
    session_count: int = payload.get("total_sessions", 0)
    message: str = payload.get("message", "Mobile crash reported")
    stack_trace: str = payload.get("stacktrace", "")
    user_id: str = payload.get("user_id", "")
    environment: str = payload.get("environment", "production")

    # Determine severity from crash-free rate if provided
    severity = "high"
    if crash_free_rate is not None:
        if crash_free_rate < 0.90:
            severity = "critical"
            message = (
                f"Crash-free session rate CRITICAL: {crash_free_rate:.1%} "
                f"({session_count} sessions)"
            )
        elif crash_free_rate < 0.95:
            severity = "high"
            message = (
                f"Crash-free session rate LOW: {crash_free_rate:.1%} "
                f"({session_count} sessions)"
            )
        else:
            severity = "low"

    issue = Issue(
        severity=severity,
        type="runtime_error",
        file=payload.get("file", "neufin-mobile/App.tsx"),
        line=payload.get("line", 0),
        message=f"[mobile] {message}",
        suggested_fix="Check EAS crash dashboard; review recent OTA update",
        auto_fixable=False,
        requires_human=severity in ("critical", "high"),
        repo="neufin-mobile",
    )

    await upsert_issues([issue.to_dict()])
    await _store_event("mobile", severity, message, stack_trace, user_id, environment)

    if severity in ("critical", "high"):
        await notify_critical(issue.to_dict())

    log.info({"action": "mobile_crash_ingested", "severity": severity, "crash_free": crash_free_rate})
    return {"status": "ok", "issue_id": issue.id, "severity": severity}


# ── Sentry REST API poller ────────────────────────────────────────────────

async def poll_sentry_issues() -> list[dict]:
    """Fetch unresolved Sentry issues every 5 min and merge into agent DB."""
    _sentry_poll_health["last_poll_at"] = datetime.now(UTC).isoformat()
    sentry_auth_token = os.getenv("SENTRY_AUTH_TOKEN", "")
    sentry_org = os.getenv("SENTRY_ORG", "")
    sentry_projects: dict[str, str] = {
        "neufin-backend": os.getenv("SENTRY_PROJECT_neufin_backend") or os.getenv("SENTRY_PROJECT_BACKEND", ""),
        "neufin-web": os.getenv("SENTRY_PROJECT_neufin_web") or os.getenv("SENTRY_PROJECT_WEB", ""),
    }

    if not sentry_auth_token or not sentry_org:
        _sentry_poll_health["status"] = "skipped"
        _sentry_poll_health["last_error"] = "SENTRY_AUTH_TOKEN or SENTRY_ORG not set"
        _sentry_poll_health["last_ingested_count"] = 0
        log.debug({"action": "sentry_poll_skip", "reason": "SENTRY_AUTH_TOKEN or SENTRY_ORG not set"})
        return []

    headers = {"Authorization": f"Bearer {sentry_auth_token}"}
    new_issues: list[dict] = []

    projects_checked = 0
    for repo, project in sentry_projects.items():
        if not project:
            continue
        projects_checked += 1
        url = f"https://sentry.io/api/0/projects/{sentry_org}/{project}/issues/"
        params = {"query": "is:unresolved", "limit": 25, "sort": "date"}
        try:
            async with httpx.AsyncClient(timeout=15.0, headers=headers) as client:
                resp = await client.get(url, params=params)
            if resp.status_code == 401:
                log.warning({"action": "sentry_poll_auth_fail", "project": project})
                continue
            resp.raise_for_status()
            sentry_items = resp.json()
        except Exception as e:
            _sentry_poll_health["status"] = "error"
            _sentry_poll_health["last_error"] = str(e)
            log.error({"action": "sentry_poll_error", "project": project, "error": str(e)})
            continue

        for si in sentry_items:
            level_map = {"fatal": "critical", "error": "high", "warning": "medium", "info": "low", "debug": "low"}
            severity = level_map.get(si.get("level", "error"), "high")

            # Extract file from metadata (what Sentry stores as the crash location)
            meta     = si.get("metadata", {})
            file_path = meta.get("filename", si.get("culprit", "unknown"))
            line_no   = meta.get("lineno", 0)

            occurrences    = int(si.get("count", 1) or 1)
            affected_users = int(si.get("userCount", 0) or 0)
            sentry_url     = si.get("permalink", "")
            sentry_id      = f"sentry_{si['id']}"

            # Upgrade severity if user impact is high
            if affected_users >= 10 and severity != "critical":
                severity = "critical"
            elif affected_users >= 3 and severity == "medium":
                severity = "high"

            issue = Issue(
                id=sentry_id,
                severity=severity,
                type="runtime_error",
                file=file_path,
                line=int(line_no),
                message=f"[sentry] {si.get('title', 'Runtime error')}",
                suggested_fix=(
                    f"Sentry: {si.get('culprit', 'see stacktrace')} — "
                    f"{occurrences} occurrences, {affected_users} users affected."
                ),
                auto_fixable=False,
                requires_human=True,
                repo=repo,
                source="sentry",
                sentry_url=sentry_url,
                occurrences=occurrences,
                affected_users=affected_users,
            )
            new_issues.append(issue.to_dict())

    if new_issues:
        await upsert_issues(new_issues)
        critical = [i for i in new_issues if i["severity"] == "critical" and i.get("affected_users", 0) > 0]
        for iss in critical:
            await notify_critical(iss)

    log.info({
        "action": "sentry_poll_complete",
        "ingested": len(new_issues),
        "projects": [p for p in sentry_projects.values() if p],
    })
    _sentry_poll_health["status"] = "ok"
    _sentry_poll_health["last_success_at"] = datetime.now(UTC).isoformat()
    _sentry_poll_health["last_ingested_count"] = len(new_issues)
    _sentry_poll_health["projects_checked"] = projects_checked
    _sentry_poll_health["last_error"] = ""
    return new_issues


def get_sentry_poll_health() -> dict:
    """Return last Sentry poll health snapshot for dashboard/API visibility."""
    return {
        **_sentry_poll_health,
        "configured": bool(os.getenv("SENTRY_DSN") and os.getenv("SENTRY_AUTH_TOKEN") and os.getenv("SENTRY_ORG")),
        "generated_at": datetime.now(UTC).isoformat(),
    }


# ── Railway health poller ──────────────────────────────────────────────────

async def check_railway_health() -> None:
    global _railway_consecutive_failures
    start = datetime.now(UTC)

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(RAILWAY_HEALTH_URL)
        elapsed = (datetime.now(UTC) - start).total_seconds()
        resp.raise_for_status()

        _railway_consecutive_failures = 0  # reset on success

        severity: str | None = None
        if elapsed > 5.0:
            severity = "critical"
        elif elapsed > 2.0:
            severity = "medium"

        if severity:
            issue = Issue(
                severity=severity,
                type="performance",
                file="neufin-backend/main.py",
                line=0,
                message=f"Railway health check slow: {elapsed:.2f}s (threshold: 2s)",
                suggested_fix="Profile slow startup path; check Railway resource limits",
                auto_fixable=False,
                requires_human=severity == "critical",
                repo="neufin-backend",
            )
            await upsert_issues([issue.to_dict()])
            await _store_event("railway", severity, issue.message)
            if severity == "critical":
                await notify_critical(issue.to_dict())

        log.info({"action": "railway_health_ok", "elapsed_s": round(elapsed, 3)})

    except Exception as e:
        _railway_consecutive_failures += 1
        log.error({
            "action": "railway_health_fail",
            "consecutive": _railway_consecutive_failures,
            "error": str(e),
        })

        issue = Issue(
            severity="critical" if _railway_consecutive_failures >= 3 else "high",
            type="runtime_error",
            file="neufin-backend/main.py",
            line=0,
            message=(
                f"Railway backend unreachable — {_railway_consecutive_failures} consecutive failure(s): {e}"
            ),
            suggested_fix="Check Railway dashboard; verify deployment is healthy",
            auto_fixable=False,
            requires_human=True,
            repo="neufin-backend",
        )
        await upsert_issues([issue.to_dict()])
        await _store_event("railway", issue.severity, issue.message)
        await notify_critical(issue.to_dict())


# ── Vercel analytics poller ────────────────────────────────────────────────

async def check_vercel_analytics() -> None:
    if not VERCEL_TOKEN or not VERCEL_PROJECT_ID:
        log.warning({"action": "vercel_skip", "reason": "VERCEL_TOKEN or VERCEL_PROJECT_ID not set"})
        return

    headers = {"Authorization": f"Bearer {VERCEL_TOKEN}"}
    now = datetime.now(UTC)
    since = int((now - timedelta(hours=1)).timestamp() * 1000)
    until = int(now.timestamp() * 1000)

    try:
        async with httpx.AsyncClient(headers=headers, timeout=15.0) as client:
            # Web Vitals
            vitals_resp = await client.get(
                "https://vercel.com/api/web-vitals/timeseries",
                params={
                    "projectId": VERCEL_PROJECT_ID,
                    "from": since,
                    "to": until,
                },
            )
            # Error rate
            errors_resp = await client.get(
                f"https://vercel.com/api/v1/projects/{VERCEL_PROJECT_ID}/analytics",
                params={"from": since, "to": until, "metrics": "error_rate"},
            )
    except Exception as e:
        log.error({"action": "vercel_poll_error", "error": str(e)})
        return

    issues: list[Issue] = []

    # Parse Web Vitals
    if vitals_resp.status_code == 200:
        try:
            vitals = vitals_resp.json()
            lcp = vitals.get("lcp", {}).get("p75")
            if lcp and lcp > 3000:
                issues.append(Issue(
                    severity="medium",
                    type="performance",
                    file="neufin-web/app/layout.tsx",
                    line=0,
                    message=f"LCP p75 = {lcp}ms — exceeds 3s threshold",
                    suggested_fix="Audit largest contentful element; add <Image priority> or preload hint",
                    auto_fixable=False,
                    requires_human=False,
                    repo="neufin-web",
                ))
        except Exception:
            pass

    # Parse error rate
    if errors_resp.status_code == 200:
        try:
            data = errors_resp.json()
            error_rate = data.get("error_rate", 0.0)
            if error_rate > 0.05:
                sev = "critical"
            elif error_rate > 0.02:
                sev = "high"
            else:
                sev = None

            if sev:
                issues.append(Issue(
                    severity=sev,
                    type="runtime_error",
                    file="neufin-web",
                    line=0,
                    message=f"Vercel error rate {error_rate:.1%} — above threshold",
                    suggested_fix="Check Vercel Function logs for 5xx pattern",
                    auto_fixable=False,
                    requires_human=sev == "critical",
                    repo="neufin-web",
                ))
        except Exception:
            pass

    if issues:
        issue_dicts = [i.to_dict() for i in issues]
        await upsert_issues(issue_dicts)
        for issue_dict in issue_dicts:
            await _store_event("vercel", issue_dict["severity"], issue_dict["message"])
            if issue_dict["severity"] in ("critical", "high"):
                await notify_critical(issue_dict)

    log.info({"action": "vercel_poll_complete", "new_issues": len(issues)})


# ── Runtime summary endpoint ───────────────────────────────────────────────

async def get_runtime_summary(hours: int = 24) -> dict:
    """Return error counts by severity for the last N hours, with trend."""
    since = (datetime.now(UTC) - timedelta(hours=hours)).isoformat()

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row

        # Count by severity in window
        cursor = await db.execute(
            """
            SELECT severity, COUNT(*) as count
            FROM runtime_events
            WHERE occurred_at >= ?
            GROUP BY severity
            """,
            (since,),
        )
        rows = await cursor.fetchall()
        counts = {r["severity"]: r["count"] for r in rows}

        # Count by source
        cursor = await db.execute(
            """
            SELECT source, COUNT(*) as count
            FROM runtime_events
            WHERE occurred_at >= ?
            GROUP BY source
            """,
            (since,),
        )
        rows = await cursor.fetchall()
        by_source = {r["source"]: r["count"] for r in rows}

        # Trend: compare first half vs second half of window
        midpoint = (datetime.now(UTC) - timedelta(hours=hours / 2)).isoformat()
        cursor = await db.execute(
            "SELECT COUNT(*) as n FROM runtime_events WHERE occurred_at < ? AND occurred_at >= ?",
            (midpoint, since),
        )
        first_half = (await cursor.fetchone())["n"]
        cursor = await db.execute(
            "SELECT COUNT(*) as n FROM runtime_events WHERE occurred_at >= ?",
            (midpoint,),
        )
        second_half = (await cursor.fetchone())["n"]

    trend = "stable"
    if second_half > first_half * 1.2:
        trend = "rising"
    elif second_half < first_half * 0.8:
        trend = "falling"

    return {
        "window_hours": hours,
        "by_severity": counts,
        "by_source": by_source,
        "total": sum(counts.values()),
        "trend": trend,
        "generated_at": datetime.now(UTC).isoformat(),
    }
