import asyncio
import json
import logging
import os
from datetime import datetime, UTC
from pathlib import Path

import sentry_sdk

from core.audit_log import (
    upsert_issues,
    begin_scan_run,
    complete_scan_run,
    compute_health_score,
    get_recently_resolved,
)
from core.notifier import notify_scan_complete, notify_critical, notify_high
from core.supabase_persistence import write_findings, write_scan_run
from core.github_issues import process_findings as gh_process_findings, close_resolved_issues
from core.router_sync import post_scan_results
import detectors.typescript_check as typescript_check
import detectors.python_check as python_check
import detectors.auth_detector as auth_detector
import detectors.secret_scanner as secret_scanner
import detectors.mock_data_detector as mock_data_detector
import detectors.api_drift_detector as api_drift_detector

log = logging.getLogger("neufin-agent.scanner")

# ── Dynamic Path Resolution (Railway Fix) ──────────────────────────────────
# We prioritize the REPO_ROOT set during the git clone in main.py.
# Defaulting to /app/repo_to_scan for the production container environment.
REPO_ROOT = Path(os.getenv("REPO_ROOT", "/app/repo_to_scan"))
REPOS = ("neufin-backend", "neufin-web", "neufin-mobile")


def _publish_scan_issues_to_sentry(issues: list[dict]) -> int:
    """Emit HIGH/CRITICAL scanner issues as Sentry events via SDK (no Sentry API scopes required)."""
    if not os.getenv("SENTRY_DSN"):
        return 0

    limit = int(os.getenv("SENTRY_SCAN_ISSUE_LIMIT", "121"))
    sent = 0
    for issue in issues[:limit]:
        sev = issue.get("severity", "medium")
        if sev not in ("critical", "high"):
            continue

        repo = issue.get("repo", "")
        if repo == "neufin-backend":
            project_tag = "python-fastapi"
        elif repo == "neufin-web":
            project_tag = "neufin-web"
        else:
            continue

        try:
            with sentry_sdk.push_scope() as scope:
                scope.set_tag("source", "scanner")
                scope.set_tag("repo", repo)
                scope.set_tag("project", project_tag)
                scope.set_tag("severity", sev)
                scope.set_tag("issue_type", issue.get("type", "unknown"))
                scope.set_extra("file", issue.get("file", ""))
                scope.set_extra("line", issue.get("line", 0))
                scope.set_extra("suggested_fix", issue.get("suggested_fix", ""))
                scope.fingerprint = [
                    "neufin-scan-issue",
                    issue.get("repo", "unknown"),
                    issue.get("type", "unknown"),
                    issue.get("file", "unknown"),
                    str(issue.get("line", 0)),
                ]
                sentry_sdk.capture_message(issue.get("message", "Scanner issue"), level="error")
            sent += 1
        except Exception as exc:
            log.error({"action": "sentry_issue_publish_error", "error": str(exc)})
    return sent


async def run_all_detectors() -> dict:
    # Safety check: if the repo isn't there, we can't scan.
    if not REPO_ROOT.exists():
        log.error({"action": "scan_aborted", "reason": f"Directory {REPO_ROOT} not found"})
        return {"error": "Repository root not found", "path": str(REPO_ROOT)}

    started_at = datetime.now(UTC).isoformat()
    run_id = await begin_scan_run()
    log.info({"action": "detectors_start", "run_id": run_id, "scanning_path": str(REPO_ROOT)})

    # Gather results from all specialized detectors
    results = await asyncio.gather(
        typescript_check.scan(),
        python_check.scan(),
        auth_detector.scan(),
        secret_scanner.scan(),
        mock_data_detector.scan(),
        api_drift_detector.scan(),
        return_exceptions=True,
    )

    detector_names = [
        "typescript",
        "python",
        "auth",
        "secrets",
        "mock",
        "api",
    ]
    issues: list[dict] = []
    for i, r in enumerate(results):
        if isinstance(r, Exception):
            log.error({"action": "detector_fail", "detector": detector_names[i], "error": str(r)})
        else:
            issues.extend([i.to_dict() if hasattr(i, 'to_dict') else i for i in r])

    counts = {
        sev: sum(1 for i in issues if i.get("severity") == sev)
        for sev in ("critical", "high", "medium", "low")
    }

    # Use audit-log-aware score (with bonuses)
    scores: dict[str, int] = {}
    for repo in REPOS:
        scores[repo] = await compute_health_score(issues, repo)

    report = {
        "generated_at": datetime.now(UTC).isoformat(),
        "run_id": run_id,
        "scores": scores,
        "issue_count": counts,
        "issues": issues,
    }

    # Save the report to the agent's local storage (sibling to core/)
    report_path = Path(__file__).parent.parent / "health_report.json"
    try:
        report_path.write_text(json.dumps(report, indent=2))
        log.info({"action": "report_written", "issues": len(issues), "run_id": run_id})
    except Exception as e:
        log.error({"action": "report_write_failed", "error": str(e)})

    # Persistence and Notifications
    await upsert_issues(issues)
    await complete_scan_run(run_id, scores, counts)

    # ── Supabase persistence ───────────────────────────────────────────────
    completed_at = datetime.now(UTC).isoformat()
    await write_findings(run_id, issues)
    await write_scan_run(run_id, started_at, completed_at, counts)

    # ── Router-system sync ─────────────────────────────────────────────────
    await post_scan_results(report)

    # ── GitHub Issues: open for new CRITICAL/HIGH, close resolved ─────────
    await gh_process_findings(issues)
    recently_resolved = await get_recently_resolved(started_at)
    if recently_resolved:
        await close_resolved_issues(recently_resolved)

    # Sentry integration: publish scanner findings directly via SDK
    published = _publish_scan_issues_to_sentry(issues)
    log.info({"action": "sentry_scan_sync_complete", "published_issues": published})

    # ── Slack: CRITICAL → alerts+command, HIGH → dev ───────────────────────
    for issue in issues:
        sev = issue.get("severity")
        if sev == "critical":
            await notify_critical(issue)
        elif sev == "high":
            await notify_high(issue)

    await notify_scan_complete(report)
    return report