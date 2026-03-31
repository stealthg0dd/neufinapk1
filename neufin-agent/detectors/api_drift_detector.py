import re
import os
from pathlib import Path

from detectors import Issue

# Standardized REPO_ROOT for Railway
REPO_ROOT = Path(os.getenv("REPO_ROOT", str(Path(__file__).parent.parent.parent)))

# FastAPI route decorators in backend
_ROUTER_ROUTE = re.compile(
    r'@(?:router|app)\.(get|post|put|delete|patch)\s*\(\s*["\']([^"\']+)["\']'
)

# Frontend API calls — fetch/axios with /api/ paths
_FETCH_CALL = re.compile(
    r"""(?:fetch|axios\.[a-z]+)\s*\(\s*(?:`[^`]*?(/api/[^`"'\s)]+)|["']([^"']*?/api/[^"'\s)]+)["'])"""
)
# Interpolated base URL: `${BASE_URL}/api/route`
_TEMPLATE_CALL = re.compile(
    r"""\$\{[^}]+\}\s*(`[^`]*?(/api/[^`"'\s)]+)|["']([^"']*?/api/[^"'\s)]+)["'])"""
)

SKIP_DIRS = {".git", ".next", "node_modules", "__pycache__", ".venv", "build", "dist", ".expo"}


async def scan() -> list[Issue]:
    backend_endpoints = _extract_backend_endpoints()
    frontend_calls = _extract_frontend_calls()

    issues: list[Issue] = []

    # Frontend calls an endpoint with no matching backend route
    for call_path, (file_path, line) in frontend_calls.items():
        normalized = _normalize(call_path)
        if not any(_matches(normalized, ep) for ep in backend_endpoints):
            issues.append(
                Issue(
                    severity="high",
                    type="api_drift",
                    file=file_path,
                    line=line,
                    message=f"Frontend calls `{call_path}` — no matching backend endpoint",
                    suggested_fix="Add backend route or correct the frontend URL",
                    auto_fixable=False,
                    requires_human=True,
                    repo="neufin-web",
                )
            )

    # Backend endpoint never called by any frontend
    for ep in backend_endpoints:
        if not any(_matches(_normalize(c), ep) for c in frontend_calls):
            issues.append(
                Issue(
                    severity="low",
                    type="api_drift",
                    file="neufin-backend",
                    line=0,
                    message=f"Backend endpoint `{ep}` has no known frontend caller",
                    suggested_fix="Verify endpoint is still needed or document internal usage",
                    auto_fixable=False,
                    requires_human=False,
                    repo="neufin-backend",
                )
            )

    return issues


def _extract_backend_endpoints() -> set[str]:
    endpoints: set[str] = set()
    backend = REPO_ROOT / "neufin-backend"

    files = [backend / "main.py"]
    routers_dir = backend / "routers"
    if routers_dir.exists():
        files.extend(routers_dir.glob("*.py"))

    for py_file in files:
        if not py_file.exists():
            continue
        try:
            content = py_file.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for match in _ROUTER_ROUTE.finditer(content):
            endpoints.add(match.group(2))

    return endpoints


def _extract_frontend_calls() -> dict[str, tuple[str, int]]:
    calls: dict[str, tuple[str, int]] = {}

    for repo_dir_name in ("neufin-web", "neufin-mobile"):
        repo_dir = REPO_ROOT / repo_dir_name
        if not repo_dir.exists():
            continue
        for ext in ("*.ts", "*.tsx", "*.js", "*.jsx"):
            for path in repo_dir.rglob(ext):
                if any(s in path.parts for s in SKIP_DIRS):
                    continue
                try:
                    content = path.read_text(encoding="utf-8", errors="ignore")
                except OSError:
                    continue
                for pattern in (_FETCH_CALL, _TEMPLATE_CALL):
                    for match in pattern.finditer(content):
                        # Pick the first non-None group that contains /api/
                        call_path = next(
                            (g for g in match.groups() if g and "/api/" in g), None
                        )
                        if call_path:
                            line = content[: match.start()].count("\n") + 1
                            calls[call_path] = (str(path.relative_to(REPO_ROOT)), line)
    return calls


def _normalize(path: str) -> str:
    """Strip base URL, query params, trailing slash."""
    path = re.sub(r"^https?://[^/]+", "", path)
    path = path.split("?")[0].rstrip("/")
    return path


def _matches(frontend_call: str, backend_endpoint: str) -> bool:
    """Match frontend call against a backend endpoint, treating {param} as wildcard."""
    ep_pattern = re.sub(r"\{[^}]+\}", "[^/]+", re.escape(backend_endpoint))
    return bool(re.fullmatch(ep_pattern, frontend_call))
