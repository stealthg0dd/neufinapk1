import re
import os
from pathlib import Path

from detectors import Issue

# Standardized REPO_ROOT for Railway
REPO_ROOT = Path(os.getenv("REPO_ROOT", "/app/repo_to_scan"))

# Each entry: (compiled_regex, message, severity, suggested_fix, auto_fixable, requires_human)
PATTERNS: list[tuple[re.Pattern, str, str, str, bool, bool]] = [
    (
        re.compile(r"localStorage\.getItem\s*\("),
        "localStorage.getItem usage — auth state may diverge from server-side middleware",
        "critical",
        "Replace with cookie-based session via supabase.auth.getSession()",
        False,
        True,
    ),
    (
        re.compile(
            r"useEffect\s*\(\s*\(\s*\)\s*=>.*?router\.(push|replace)\s*\(['\"].*?login",
            re.DOTALL,
        ),
        "useEffect redirect to /login conflicts with Next.js middleware auth guard",
        "high",
        "Remove client-side redirect; rely on middleware.ts for route protection",
        False,
        False,
    ),
    (
        re.compile(r"createClient\s*\(\s*process\.env"),
        "Supabase client instantiated inline — causes multiple GoTrue instances",
        "medium",
        "Import singleton from lib/supabase/client.ts instead",
        True,
        False,
    ),
    (
        re.compile(r"onAuthStateChange"),
        None,  # presence is GOOD — absence triggers the issue (handled separately)
        "high",
        "Add supabase.auth.onAuthStateChange() handler to sync session state",
        False,
        False,
    ),
]

SKIP_DIRS = {
    ".git",
    ".next",
    "node_modules",
    "__pycache__",
    ".venv",
    "build",
    "dist",
    ".expo",
    "android",
    "ios",
    ".gradle",
}


async def scan() -> list[Issue]:
    web_dir = REPO_ROOT / "neufin-web"
    if not web_dir.exists():
        return []

    issues: list[Issue] = []
    auth_handler_files: set[str] = set()

    for ext in ("*.ts", "*.tsx"):
        for path in web_dir.rglob(ext):
            if any(s in path.parts for s in SKIP_DIRS):
                continue
            _scan_file(path, issues, auth_handler_files)

    # Check for AuthProvider-like files that are missing onAuthStateChange
    auth_provider_files = [
        p
        for p in web_dir.rglob("*.tsx")
        if "auth" in p.name.lower() or "provider" in p.name.lower()
        if not any(s in p.parts for s in SKIP_DIRS)
    ]
    for path in auth_provider_files:
        if str(path) not in auth_handler_files:
            try:
                content = path.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            if "supabase" in content.lower() and "onAuthStateChange" not in content:
                issues.append(
                    Issue(
                        severity="high",
                        type="auth_bug",
                        file=str(path.relative_to(REPO_ROOT)),
                        line=1,
                        message="Auth component missing onAuthStateChange handler — session may not stay in sync",
                        suggested_fix="Add supabase.auth.onAuthStateChange() to sync session state on mount",
                        auto_fixable=False,
                        requires_human=False,
                        repo="neufin-web",
                    )
                )

    return issues


def _scan_file(path: Path, issues: list[Issue], auth_handler_files: set[str]) -> None:
    try:
        content = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return

    if "onAuthStateChange" in content:
        auth_handler_files.add(str(path))

    for pattern, message, severity, fix, auto, human in PATTERNS:
        if message is None:
            continue  # skip the sentinel (absence check done above)
        for match in pattern.finditer(content):
            line = content[: match.start()].count("\n") + 1
            issues.append(
                Issue(
                    severity=severity,
                    type="auth_bug",
                    file=str(path.relative_to(REPO_ROOT)),
                    line=line,
                    message=message,
                    suggested_fix=fix,
                    auto_fixable=auto,
                    requires_human=human,
                    repo="neufin-web",
                )
            )
