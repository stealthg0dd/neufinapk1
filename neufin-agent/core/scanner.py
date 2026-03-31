import asyncio
import json
import logging
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

REPO_ROOT = Path(__file__).parent.parent.parent
REPOS = ("neufin-backend", "neufin-web", "neufin-mobile")


async def run_all_detectors() -> dict:
    run_id = await begin_scan_run()
    log.info({"action": "detectors_start", "run_id": run_id})

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
            log.error({"action": "detector_error", "error": str(r)})
        else:
            issues.extend([i.to_dict() for i in r])

    counts = {
        sev: sum(1 for i in issues if i["severity"] == sev)
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

    report_path = Path(__file__).parent.parent / "health_report.json"
    report_path.write_text(json.dumps(report, indent=2))
    log.info({"action": "report_written", "issues": len(issues), "run_id": run_id})

    await upsert_issues(issues)
    await complete_scan_run(run_id, scores, counts)

    for issue in issues:
        if issue["severity"] == "critical":
            await notify_critical(issue)

    await notify_scan_complete(report)
    return report
