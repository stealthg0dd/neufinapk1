import re
from pathlib import Path

# Assuming Issue is imported from a sibling or parent module
from detectors import Issue

REPO_ROOT = Path(__file__).parent.parent.parent

# We obfuscate the regex strings using concatenation so the scanner 
# does not detect these literals as actual keys during a self-scan.
SECRET_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"sk-ant-api" + r"03-[A-Za-z0-9_\-]{20,}"), "Anthropic API key"),
    (re.compile(r"sk_live" + r"_[A-Za-z0-9]{20,}"), "Stripe live secret key"),
    (re.compile(r"sk_test" + r"_[A-Za-z0-9]{20,}"), "Stripe test secret key"),
    (re.compile(r"AIza" + r"Sy[A-Za-z0-9_\-]{30,}"), "Google API key"),
    (re.compile(r"eyJhbGci" + r"OiJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}"), "Hardcoded JWT token"),
    (re.compile(r"ghp" + r"_[A-Za-z0-9]{36}"), "GitHub personal access token"),
    (re.compile(r"(?<![A-Z0-9_])[A-Z0-9]{40,}(?![A-Z0-9_])"), "Possible hardcoded secret (40+ uppercase chars)"),
]

SKIP_DIRS = {
    ".git", ".next", "node_modules", "__pycache__", ".venv", "venv",
    "build", "dist", ".expo", "android", "ios", "neufin-agent", # Added agent to skip to prevent self-recursion
}
SKIP_EXTENSIONS = {
    ".lock", ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg",
    ".woff", ".woff2", ".ttf", ".eot", ".aab", ".apk", ".db",
    ".bin", ".exe", ".zip", ".tar", ".gz",
}
SKIP_FILENAMES = {
    ".env", ".env.local", ".env.example", ".env.production",
    ".env.development", ".env.staging", ".env.test",
    "secret_scanner.py", # Explicitly skip the scanner itself
}


async def scan() -> list[Issue]:
    issues: list[Issue] = []
    # Targeted scan directories
    for repo in ("neufin-backend", "neufin-web", "neufin-mobile"):
        repo_dir = REPO_ROOT / repo
        if not repo_dir.exists():
            continue
        for path in repo_dir.rglob("*"):
            if path.is_dir():
                continue
            # Skip logic
            if any(s in path.parts for s in SKIP_DIRS):
                continue
            if path.suffix.lower() in SKIP_EXTENSIONS:
                continue
            if path.name in SKIP_FILENAMES:
                continue
            _scan_file(path, repo, issues)
    return issues


def _scan_file(path: Path, repo: str, issues: list[Issue]) -> None:
    try:
        content = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return

    for pattern, label in SECRET_PATTERNS:
        for match in pattern.finditer(content):
            # Calculate line number
            line = content[: match.start()].count("\n") + 1
            
            # Security: Ensure we don't accidentally log the real secret
            issues.append(
                Issue(
                    severity="critical",
                    type="secret",
                    file=str(path.relative_to(REPO_ROOT)),
                    line=line,
                    message=f"{label} detected — remove immediately and rotate",
                    suggested_fix="Move to .env / Railway secret and reference via os.getenv() or process.env",
                    auto_fixable=False,
                    requires_human=True,
                    repo=repo,
                )
            )