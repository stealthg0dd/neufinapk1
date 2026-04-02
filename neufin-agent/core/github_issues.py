"""
github_issues.py — Auto-creates and closes GitHub Issues for scanner findings.

Public API:
  process_findings(findings)            Create GH Issues for CRITICAL/HIGH (dedup by title)
  close_resolved_issues(findings)       Close matching open issues for resolved findings
"""

import asyncio
import logging
from datetime import datetime, UTC

from github import Github
from github.GithubException import GithubException, UnknownObjectException

from core.config import settings

log = logging.getLogger("neufin-agent.github_issues")

_REPO_NAME = settings.GITHUB_REPO  # e.g. "stealthg0dd/neufinapk1"

# Labels that must exist before creating issues
_BASE_LABELS = ["neufin-agent", "automated"]
_SEVERITY_LABELS = ["critical", "high", "medium", "low"]
_LABEL_COLORS: dict[str, str] = {
    "neufin-agent": "0075ca",
    "automated":    "e4e669",
    "critical":     "d93f0b",
    "high":         "e99695",
    "medium":       "f9d0c4",
    "low":          "c2e0c6",
}


def _gh_repo():
    return Github(settings.GITHUB_TOKEN).get_repo(_REPO_NAME)


def _ensure_labels(repo) -> None:
    """Create required labels if they don't already exist."""
    try:
        existing = {lbl.name for lbl in repo.get_labels()}
    except Exception as exc:
        log.warning({"action": "gh_labels_fetch_error", "error": str(exc)})
        return

    for name in [*_BASE_LABELS, *_SEVERITY_LABELS]:
        if name not in existing:
            try:
                repo.create_label(name, _LABEL_COLORS.get(name, "ededed"))
                log.info({"action": "gh_label_created", "label": name})
            except GithubException as exc:
                if exc.status != 422:  # 422 = already exists (race)
                    log.warning({"action": "gh_label_create_failed", "label": name, "error": str(exc)})


def _issue_title(finding: dict) -> str:
    severity = finding.get("severity", "unknown").upper()
    category = finding.get("type", "unknown")
    message = (finding.get("message") or "")[:80].rstrip()
    return f"[neufin-agent] {severity}: {category} — {message}"


def _issue_body(finding: dict) -> str:
    sentry_line = ""
    sentry_url = finding.get("sentry_url") or ""
    if sentry_url:
        sentry_line = f"\n**Sentry event:** {sentry_url}\n"

    return (
        f"## {finding.get('severity','?').upper()} — {finding.get('type','?')}\n\n"
        f"**Detected by:** neufin-agent (automated scanner)  \n"
        f"**Detected at:** `{finding.get('detected_at') or datetime.now(UTC).isoformat()}`  \n"
        f"**Finding ID:** `{finding.get('id', 'N/A')}`\n\n"
        f"---\n\n"
        f"### Location\n"
        f"- **Repo:** `{finding.get('repo', 'N/A')}`\n"
        f"- **File:** `{finding.get('file', 'N/A')}` (line {finding.get('line', 0)})\n\n"
        f"### Description\n"
        f"{finding.get('message', 'No message')}\n\n"
        f"### Suggested Fix\n"
        f"{finding.get('suggested_fix', 'No suggestion available')}\n"
        f"{sentry_line}\n"
        f"---\n"
        f"*Auto-created by neufin-agent. Close this issue once the fix is verified.*"
    )


def _find_open_issue(repo, title: str):
    """Return the first open neufin-agent issue matching the exact title, or None."""
    try:
        for issue in repo.get_issues(state="open", labels=["neufin-agent"]):
            if issue.title == title:
                return issue
    except Exception as exc:
        log.warning({"action": "gh_issue_search_error", "error": str(exc)})
    return None


def _process_findings_sync(findings: list[dict]) -> None:
    try:
        repo = _gh_repo()
        _ensure_labels(repo)
    except Exception as exc:
        log.error({"action": "gh_repo_access_error", "error": str(exc)})
        return

    for finding in findings:
        title = _issue_title(finding)
        existing = _find_open_issue(repo, title)
        if existing:
            log.info({"action": "gh_issue_duplicate_skipped",
                      "title": title, "issue_number": existing.number})
            continue

        severity = finding.get("severity", "high")
        labels = ["neufin-agent", "automated", severity]
        try:
            issue = repo.create_issue(
                title=title,
                body=_issue_body(finding),
                labels=labels,
            )
            log.info({"action": "gh_issue_created", "number": issue.number, "title": title})
        except GithubException as exc:
            log.error({"action": "gh_issue_create_failed", "title": title, "error": str(exc)})


def _close_resolved_sync(resolved_findings: list[dict]) -> None:
    try:
        repo = _gh_repo()
    except Exception as exc:
        log.error({"action": "gh_repo_access_error", "error": str(exc)})
        return

    for finding in resolved_findings:
        title = _issue_title(finding)
        issue = _find_open_issue(repo, title)
        if not issue:
            continue
        try:
            issue.create_comment(
                f"✅ **Auto-resolved** by neufin-agent.  \n"
                f"Finding `{finding.get('id', 'unknown')}` was marked as resolved at "
                f"`{datetime.now(UTC).isoformat()}`.  \n"
                f"Resolution: `{finding.get('resolution', 'auto_fixed')}`"
            )
            issue.edit(state="closed")
            log.info({"action": "gh_issue_closed", "number": issue.number, "title": title})
        except GithubException as exc:
            log.error({"action": "gh_issue_close_failed",
                       "number": issue.number, "error": str(exc)})


async def process_findings(findings: list[dict]) -> None:
    """Create GitHub Issues for CRITICAL/HIGH findings (dedup by title)."""
    high_crit = [f for f in findings if f.get("severity") in ("critical", "high")]
    if not high_crit:
        return
    try:
        await asyncio.to_thread(_process_findings_sync, high_crit)
    except Exception as exc:
        log.error({"action": "github_issues_process_error", "error": str(exc)})


async def close_resolved_issues(resolved_findings: list[dict]) -> None:
    """Close GitHub Issues for findings that have been resolved."""
    if not resolved_findings:
        return
    try:
        await asyncio.to_thread(_close_resolved_sync, resolved_findings)
    except Exception as exc:
        log.error({"action": "github_issues_close_error", "error": str(exc)})
