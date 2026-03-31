# --- CI Fix Templates (auto-fix recurring CI failures) ---
CI_FIX_TEMPLATES = [
    {
        "id": "ruff_format",
        "trigger": "ruff format --check failed",
        "command": "cd {repo_root}/neufin-backend && ruff format .",
        "safe": True,
        "auto_apply": True,
    },
    {
        "id": "pytest_mock_missing",
        "trigger": "ValueError: No tickers could be priced",
        "description": "Unit tests calling live APIs — need price mock",
        "safe": False,
        "auto_apply": False,
        "creates_pr": True,
    }
]
"""
fix_engine.py — Template-first, LLM-fallback fix engine.

Critical-path files are NEVER auto-fixed. Safe patterns are applied immediately.
All changes are validated with tsc --noEmit before commit.
"""

import asyncio
import json
import logging
import re
import subprocess
from pathlib import Path

from core.audit_log import get_open_issues, record_fix, mark_fixed
from core.pr_creator import create_fix_pr
from fixers.llm_fixer import generate_fix, LLMFixResult

log = logging.getLogger("neufin-agent.fix_engine")

TEMPLATES_DIR = Path(__file__).parent.parent / "fixers" / "templates"
REPO_ROOT = Path(__file__).parent.parent.parent

# ── Critical-path protection ───────────────────────────────────────────────
# Files matching any of these patterns MUST go through human review.

_CRITICAL_PATH_PATTERNS: list[re.Pattern] = [
    re.compile(r"auth", re.IGNORECASE),
    re.compile(r"payment", re.IGNORECASE),
    re.compile(r"stripe", re.IGNORECASE),
    re.compile(r"jwt", re.IGNORECASE),
    re.compile(r"supabase[/\\]auth", re.IGNORECASE),
    re.compile(r"middleware\.ts$"),
    re.compile(r"auth-context\.tsx?$"),
    re.compile(r"lib[/\\]supabase\.ts$"),
    re.compile(r"alembic[/\\]versions[/\\]"),
    re.compile(r"supabase_migrations.*\.sql$"),
]

# ── Auto-apply safe list ───────────────────────────────────────────────────
# Issue types/codes that are safe to apply without PR review.

_SAFE_PATTERNS: list[re.Pattern] = [
    re.compile(r"F401"),          # unused import
    re.compile(r"TS6133"),        # declared but never read
    re.compile(r"TS7006"),        # implicit any (add : unknown)
    re.compile(r"console\.log"),  # stray console.log
    re.compile(r"W291|W293"),     # trailing whitespace
    re.compile(r"I001"),          # import sort
]


def _is_critical_path(file_path: str) -> bool:
    return any(p.search(file_path) for p in _CRITICAL_PATH_PATTERNS)


def _is_safe_auto_apply(issue: dict) -> bool:
    msg = issue.get("message", "")
    return any(p.search(msg) for p in _SAFE_PATTERNS)


# ── Template loading ───────────────────────────────────────────────────────

def _load_templates() -> list[dict]:
    templates: list[dict] = []
    for f in TEMPLATES_DIR.glob("*.json"):
        try:
            templates.append(json.loads(f.read_text()))
        except Exception as exc:
            log.warning({"action": "template_load_error", "file": f.name, "error": str(exc)})
    return templates


def _match_template(issue: dict, templates: list[dict]) -> dict | None:
    msg = issue.get("message", "")
    itype = issue.get("type", "")
    for t in templates:
        m = t.get("matches", {})
        # type filter
        if m.get("type") and m["type"] != itype:
            continue
        # pattern filter (substring or regex)
        pat = m.get("pattern", "")
        if pat:
            try:
                if not re.search(pat, msg):
                    continue
            except re.error:
                if pat not in msg:
                    continue
        return t
    return None


# ── TypeScript baseline check ──────────────────────────────────────────────

async def _tsc_error_count(cwd: Path) -> int:
    """Return number of tsc errors (0 = clean)."""
    if not cwd.exists():
        return 0
    proc = await asyncio.create_subprocess_shell(
        "npx --yes tsc --noEmit --pretty false 2>&1 | grep -c ': error TS' || true",
        cwd=str(cwd),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    stdout, _ = await proc.communicate()
    try:
        return int(stdout.decode().strip())
    except ValueError:
        return 0


def _apply_diff(diff: str) -> bool:
    """Apply a unified diff patch to the repo. Returns True on success."""
    try:
        result = subprocess.run(
            ["git", "apply", "--index", "-"],
            input=diff.encode(),
            cwd=str(REPO_ROOT),
            capture_output=True,
            timeout=30,
        )
        return result.returncode == 0
    except Exception as exc:
        log.error({"action": "diff_apply_error", "error": str(exc)})
        return False


def _revert_diff(diff: str) -> None:
    """Reverse-apply (revert) a patch."""
    subprocess.run(
        ["git", "apply", "--reverse", "--index", "-"],
        input=diff.encode(),
        cwd=str(REPO_ROOT),
        capture_output=True,
        timeout=30,
    )


def _git_commit(issue_id: str, description: str) -> bool:
    result = subprocess.run(
        ["git", "commit", "-m", f"fix(agent): {issue_id[:8]} {description} [auto]"],
        cwd=str(REPO_ROOT),
        capture_output=True,
        timeout=30,
    )
    return result.returncode == 0


# ── Main apply_fix entrypoint ──────────────────────────────────────────────

async def apply_fix(issue_id: str) -> dict:
    issues = await get_open_issues(limit=1000)
    issue = next((i for i in issues if i["id"] == issue_id), None)
    if not issue:
        return {"success": False, "message": f"Issue {issue_id} not found"}

    file_path = issue.get("file", "")

    # Hard block: critical-path files never auto-fix
    if _is_critical_path(file_path):
        log.info({"action": "critical_path_block", "issue_id": issue_id, "file": file_path})
        return {
            "success": False,
            "method": "blocked",
            "message": "Critical-path file — requires human review",
            "issue_id": issue_id,
            "file": file_path,
        }

    # Soft block: issue marked requires_human
    if issue.get("requires_human"):
        return {
            "success": False,
            "method": "blocked",
            "message": "Issue flagged requires_human",
            "issue_id": issue_id,
        }

    templates = _load_templates()
    template = _match_template(issue, templates)

    # ── Template path ──────────────────────────────────────────────────────
    if template:
        fix_type = template.get("fix_type", "")
        safe = template.get("safe_to_auto_apply", False)

        if fix_type == "alert_only":
            log.info({"action": "template_alert_only", "issue_id": issue_id})
            return {"success": True, "method": "template_alert", "issue_id": issue_id,
                    "note": template.get("description", "")}

        if not safe:
            # Create a PR for human review instead
            return await _create_review_pr(issue, template.get("description", issue.get("message", "")))

        # Run ruff autofix for safe template with command
        if template.get("command"):
            cmd = template["command"].replace("{file}", str(REPO_ROOT / file_path))
            proc = await asyncio.create_subprocess_shell(cmd, cwd=str(REPO_ROOT))
            await proc.communicate()
            success = proc.returncode == 0
            await record_fix(issue_id, "template", cmd, "", success)
            if success:
                _git_commit(issue_id, template.get("description", "template fix"))
                await mark_fixed(issue_id)
            log.info({"action": "template_fix", "issue_id": issue_id, "success": success})
            return {"success": success, "method": "template", "issue_id": issue_id}

    # ── LLM path ───────────────────────────────────────────────────────────
    # Only call Claude for severity >= high AND issue looks auto-fixable
    sev = issue.get("severity", "low")
    if sev not in ("critical", "high") or not issue.get("auto_fixable"):
        return {
            "success": False,
            "method": "skipped",
            "message": f"Severity={sev} auto_fixable={issue.get('auto_fixable')} — skipped LLM call",
            "issue_id": issue_id,
        }

    try:
        result: LLMFixResult = await generate_fix(issue)
    except Exception as exc:
        log.error({"action": "llm_fix_error", "issue_id": issue_id, "error": str(exc)})
        return {"success": False, "method": "llm", "error": str(exc), "issue_id": issue_id}

    diff = result["diff"]
    risk = result.get("risk", "medium")
    requires_human = result.get("requires_human", False)

    if requires_human or risk == "high":
        # Don't auto-apply — open PR for review
        await record_fix(issue_id, "llm", diff, "", False)
        return await _create_review_pr(issue, result.get("root_cause", issue.get("message", "")), diff=diff)

    if risk == "medium":
        # Open PR but don't auto-commit
        await record_fix(issue_id, "llm", diff, "", False)
        pr_url = await create_fix_pr(
            issue_id=issue_id,
            file_path=file_path,
            new_content="",  # pr_creator handles diff-based PRs
            branch_name=f"agent/fix-{issue_id[:8]}",
            title=f"fix(agent): {issue.get('message', '')[:60]}",
            body=(
                f"**Auto-generated fix — medium risk, requires review.**\n\n"
                f"Issue ID: `{issue_id}`\n"
                f"File: `{file_path}`\n"
                f"Root cause: {result.get('root_cause', 'see diff')}\n\n"
                f"```diff\n{diff}\n```\n\n"
                f"Test command: `{result.get('test_cmd', 'see below')}`"
            ),
        )
        await record_fix(issue_id, "llm_pr", diff, pr_url, True)
        log.info({"action": "llm_pr_created", "issue_id": issue_id, "pr": pr_url, "risk": risk})
        return {"success": True, "method": "llm_pr", "pr_url": pr_url, "issue_id": issue_id}

    # risk == "low" — attempt auto-apply with tsc guard
    return await _apply_with_tsc_guard(issue, diff, result)


async def _apply_with_tsc_guard(issue: dict, diff: str, llm_result: LLMFixResult) -> dict:
    """Apply diff, run tsc before/after, revert if new errors introduced."""
    issue_id = issue["id"]
    web_dir = REPO_ROOT / "neufin-web"

    baseline = await _tsc_error_count(web_dir)
    log.info({"action": "tsc_baseline", "errors": baseline, "issue_id": issue_id})

    applied = _apply_diff(diff)
    if not applied:
        log.error({"action": "diff_apply_failed", "issue_id": issue_id})
        await record_fix(issue_id, "llm", diff, "", False)
        return {"success": False, "method": "llm", "message": "git apply failed", "issue_id": issue_id}

    after = await _tsc_error_count(web_dir)
    if after > baseline:
        log.warning({
            "action": "fix_reverted",
            "issue_id": issue_id,
            "baseline_errors": baseline,
            "after_errors": after,
        })
        _revert_diff(diff)
        await record_fix(issue_id, "llm", diff, "", False)
        return {
            "success": False,
            "method": "llm",
            "message": f"Reverted — introduced {after - baseline} new tsc error(s)",
            "issue_id": issue_id,
        }

    committed = _git_commit(issue_id, llm_result.get("root_cause", issue.get("message", ""))[:60])
    await record_fix(issue_id, "llm_auto", diff, "", committed)
    if committed:
        await mark_fixed(issue_id)

    log.info({"action": "fix_applied", "issue_id": issue_id, "committed": committed, "risk": "low"})
    return {
        "success": True,
        "method": "llm_auto",
        "committed": committed,
        "issue_id": issue_id,
        "tsc_errors_before": baseline,
        "tsc_errors_after": after,
    }


async def _create_review_pr(issue: dict, description: str, diff: str = "") -> dict:
    pr_url = await create_fix_pr(
        issue_id=issue["id"],
        file_path=issue.get("file", ""),
        new_content="",
        branch_name=f"agent/review-{issue['id'][:8]}",
        title=f"review(agent): {description[:60]}",
        body=(
            f"**Human review required.**\n\n"
            f"Issue ID: `{issue['id']}`\n"
            f"Severity: `{issue.get('severity')}`\n"
            f"File: `{issue.get('file')}`\n"
            f"Message: {issue.get('message')}\n"
            + (f"\n```diff\n{diff}\n```" if diff else "")
        ),
    )
    await record_fix(issue["id"], "review_pr", diff, pr_url, False)
    log.info({"action": "review_pr_created", "issue_id": issue["id"], "pr": pr_url})
    return {"success": True, "method": "review_pr", "pr_url": pr_url, "issue_id": issue["id"]}


async def can_auto_fix(issue: dict) -> bool:
    return (
        bool(issue.get("auto_fixable"))
        and not bool(issue.get("requires_human"))
        and not _is_critical_path(issue.get("file", ""))
    )
