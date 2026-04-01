import re
import os
from pathlib import Path

from detectors import Issue

# Standardized REPO_ROOT for Railway
REPO_ROOT = Path(os.getenv("REPO_ROOT", "/app/repo_to_scan"))

SKIP_DIRS = {".git", ".next", "node_modules", "__pycache__", ".venv", "build", "dist", ".expo"}

# (compiled_pattern, message)
CHECKS: list[tuple[re.Pattern, str]] = [
    (
        re.compile(r"\b(DEMO_|MOCK_|SAMPLE_|FALLBACK_)\w+\b"),
        "Mock/demo variable in production code",
    ),
    (
        re.compile(r'["\'](?:AAPL|NVDA|TSLA|MSFT|GOOGL|AMZN|META|NFLX|SPY|QQQ)["\']'),
        "Hardcoded ticker symbol — breaks with real portfolio data",
    ),
    (
        re.compile(r'["\'][a-zA-Z0-9._%+\-]+@(?:example|test|demo|fake)\.[a-zA-Z]{2,}["\']'),
        "Hardcoded test/demo email address",
    ),
    (
        re.compile(
            r'["\'][0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}["\']',
            re.IGNORECASE,
        ),
        "Hardcoded UUID — likely a test user/portfolio ID in production code",
    ),
    (
        re.compile(r"\b(?:user_id|userId)\s*[=:]\s*[\"'][a-zA-Z0-9_\-]{8,}[\"']"),
        "Hardcoded user ID literal",
    ),
]


async def scan() -> list[Issue]:
    issues: list[Issue] = []
    for repo in ("neufin-web", "neufin-mobile"):
        repo_dir = REPO_ROOT / repo
        if not repo_dir.exists():
            continue
        for ext in ("*.ts", "*.tsx", "*.js", "*.jsx"):
            for path in repo_dir.rglob(ext):
                if any(s in path.parts for s in SKIP_DIRS):
                    continue
                if _is_test_file(path):
                    continue
                _scan_file(path, repo, issues)
    return issues


def _is_test_file(path: Path) -> bool:
    name = path.name.lower()
    parts_lower = {p.lower() for p in path.parts}
    return (
        "test" in parts_lower
        or "spec" in parts_lower
        or "__tests__" in parts_lower
        or name.endswith(".test.ts")
        or name.endswith(".test.tsx")
        or name.endswith(".spec.ts")
        or name.endswith(".spec.tsx")
    )


def _scan_file(path: Path, repo: str, issues: list[Issue]) -> None:
    try:
        content = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return

    for pattern, message in CHECKS:
        for match in pattern.finditer(content):
            line = content[: match.start()].count("\n") + 1
            snippet = match.group()[:60]
            issues.append(
                Issue(
                    severity="high",
                    type="mock_data",
                    file=str(path.relative_to(REPO_ROOT)),
                    line=line,
                    message=f"{message}: {snippet}",
                    suggested_fix="Replace with dynamic value from API response or user context",
                    auto_fixable=False,
                    requires_human=True,
                    repo=repo,
                )
            )
