import asyncio
import json
import logging
import os
from datetime import datetime, UTC
from pathlib import Path

from core.audit_log import (
    upsert_issues,
    begin_scan_run,
    complete_scan_run,
    compute_health_score,
)
from core.notifier import notify_scan_complete, notify_critical
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


async def run_all_detectors() -> dict:
    # Safety check: if the repo isn't there, we can't scan.
    if not REPO_ROOT.exists():
        log.error({"action": "scan_aborted", "reason": f"Directory {REPO_ROOT} not found"})
        return {"error": "Repository root not found", "path": str(REPO_ROOT)}

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

    issues: list[dict] = []
    for r in results:
        if isinstance(r, Exception):
            # This captures the Errno 2 if a specific detector has a hardcoded path
            log.error({"action": "detector_error", "error": str(r)})
        else:
            # Ensure we are dealing with a list of issue objects
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

    for issue in issues:
        if issue.get("severity") == "critical":
            await notify_critical(issue)

    await notify_scan_complete(report)
    return report