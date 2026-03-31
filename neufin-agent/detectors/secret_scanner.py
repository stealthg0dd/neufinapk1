import re
from pathlib import Path

try:
    from detectors import Issue
except ImportError:
    class Issue:  # pragma: no cover - fallback for standalone self-test
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)


REPO_ROOT = Path(__file__).parent.parent.parent

# Build patterns via concatenation so literal secrets are never present verbatim
# in this source file (prevents the scanner from flagging itself).
PATTERN_SPECS: list[tuple[str, tuple[str, ...], str]] = [
    (
        "Anthropic API key",
        (r"sk-ant-api", r"03-[A-Za-z0-9_\-]{20,}"),
        "Rotate the exposed Anthropic key and load it from environment variables.",
    ),
    (
        "Stripe live secret key",
        (r"sk_", r"live_[A-Za-z0-9]{20,}"),
        "Rotate the Stripe live key and remove it from source control.",
    ),
    (
        "Stripe test secret key",
        (r"sk_", r"test_[A-Za-z0-9]{20,}"),
        "Move Stripe test keys into local-only env files and secrets manager.",
    ),
    (
        "Google API key",
        (r"AI", r"zaSy[A-Za-z0-9_\-]{30,}"),
        "Regenerate the Google API key and restrict it by domain/IP.",
    ),
    (
        "Hardcoded JWT token",
        (r"ey", r"J[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}"),
        "Never hardcode JWTs in code; issue tokens at runtime only.",
    ),
    (
        "GitHub personal access token",
        (r"gh", r"p_[A-Za-z0-9]{36}"),
        "Revoke the leaked GitHub token and create a scoped replacement.",
    ),
]

SECRET_PATTERNS: list[tuple[re.Pattern, str, str]] = [
    (re.compile("".join(parts)), label, suggested_fix)
    for label, parts, suggested_fix in PATTERN_SPECS
]

SKIP_DIRS = {
    ".git",
    ".next",
    "node_modules",
    "__pycache__",
    ".venv",
    "venv",
    "build",
    "dist",
    ".expo",
    "android",
    "ios",
}

SKIP_EXTENSIONS = {
    ".lock",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".ico",
    ".svg",
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
    ".aab",
    ".apk",
    ".db",
    ".bin",
    ".exe",
    ".zip",
    ".tar",
    ".gz",
}

SKIP_FILENAMES = {
    ".env",
    ".env.local",
    ".env.example",
    ".env.production",
    ".env.development",
    ".env.staging",
    ".env.test",
    "secret_scanner.py",
}


async def scan() -> list[Issue]:
    issues: list[Issue] = []
    for repo in ("neufin-backend", "neufin-web", "neufin-mobile", "neufin-agent"):
        repo_dir = REPO_ROOT / repo
        if not repo_dir.exists():
            continue
        for path in repo_dir.rglob("*"):
            if path.is_dir():
                continue
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

    for pattern, label, suggested_fix in SECRET_PATTERNS:
        for match in pattern.finditer(content):
            line = content[: match.start()].count("\n") + 1
            issues.append(
                Issue(
                    severity="critical",
                    type="secret",
                    file=str(path.relative_to(REPO_ROOT)),
                    line=line,
                    message=f"{label} detected in source code.",
                    suggested_fix=suggested_fix,
                    auto_fixable=False,
                    requires_human=True,
                    repo=repo,
                )
            )


def self_test() -> None:
    """Ensure scanner regex does not match its own source."""
    src = Path(__file__).read_text(encoding="utf-8", errors="ignore")
    for pattern, label, _fix in SECRET_PATTERNS:
        if pattern.search(src):
            raise AssertionError(f"Self-test failed: pattern '{label}' matched in secret_scanner.py.")
    print("[Self-test] secret_scanner.py: PASS")


if __name__ == "__main__":
    self_test()
