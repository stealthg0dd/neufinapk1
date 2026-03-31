import asyncio
import json
import logging
import os
from pathlib import Path

from detectors import Issue

# Standardized REPO_ROOT for Railway
REPO_ROOT = Path(os.getenv("REPO_ROOT", str(Path(__file__).parent.parent.parent)))
log = logging.getLogger("neufin-agent.python_check")

# ruff codes that can be auto-fixed
RUFF_AUTO_FIX = {"E501", "F401", "F811", "W291", "W293", "W292", "I001", "UP"}

# ruff codes → severity
def _ruff_severity(code: str) -> str:
    if code.startswith("S"):
        return "high"   # bandit-style security via ruff
    if code.startswith("F"):
        return "medium"
    return "low"


async def _run_ruff() -> list[Issue]:
    backend = REPO_ROOT / "neufin-backend"
    proc = await asyncio.create_subprocess_exec(
        "ruff", "check", str(backend), "--output-format=json",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    try:
        results = json.loads(stdout.decode(errors="replace"))
    except json.JSONDecodeError:
        return []

    issues: list[Issue] = []
    for r in results:
        code: str = r.get("code") or ""
        auto = any(code.startswith(prefix) for prefix in RUFF_AUTO_FIX)
        sev = _ruff_severity(code)
        try:
            rel = str(Path(r["filename"]).relative_to(REPO_ROOT))
        except (ValueError, KeyError):
            rel = r.get("filename", "unknown")

        issues.append(
            Issue(
                severity=sev,
                type="type_error",
                file=rel,
                line=r.get("location", {}).get("row", 0),
                message=f"{code}: {r.get('message', '')}",
                suggested_fix="ruff check --fix" if auto else "Manual fix required",
                auto_fixable=auto,
                requires_human=False,
                repo="neufin-backend",
            )
        )
    return issues


async def _run_bandit() -> list[Issue]:
    backend = REPO_ROOT / "neufin-backend"
    proc = await asyncio.create_subprocess_exec(
        "bandit", "-r", str(backend), "-f", "json",
        "-x", str(backend / "tests"),
        "--quiet",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    try:
        data = json.loads(stdout.decode(errors="replace"))
    except json.JSONDecodeError:
        return []

    sev_map = {"HIGH": "critical", "MEDIUM": "high", "LOW": "medium"}
    issues: list[Issue] = []
    for r in data.get("results", []):
        sev = sev_map.get(r.get("issue_severity", "LOW"), "medium")
        try:
            rel = str(Path(r["filename"]).relative_to(REPO_ROOT))
        except (ValueError, KeyError):
            rel = r.get("filename", "unknown")

        issues.append(
            Issue(
                severity=sev,
                type="auth_bug" if "auth" in r.get("issue_text", "").lower() else "type_error",
                file=rel,
                line=r.get("line_number", 0),
                message=f"B{r.get('test_id', '???')}: {r.get('issue_text', '')}",
                suggested_fix=r.get("more_info", "Review security issue"),
                auto_fixable=False,
                requires_human=sev in ("critical", "high"),
                repo="neufin-backend",
            )
        )
    return issues


async def scan() -> list[Issue]:
    ruff_issues, bandit_issues = await asyncio.gather(
        _run_ruff(), _run_bandit(), return_exceptions=False
    )
    return ruff_issues + bandit_issues  # type: ignore[operator]
