import asyncio
import re
import os
from pathlib import Path

from detectors import Issue

# Standardized REPO_ROOT for Railway
REPO_ROOT = Path(os.getenv("REPO_ROOT", "/app/repo_to_scan"))

# (error_code, severity, auto_fixable)
TS_SEVERITY: dict[str, tuple[str, bool]] = {
    "TS2339": ("high", False),  # Property 'x' does not exist on type
    "TS2304": ("high", False),  # Cannot find name 'x'
    "TS2345": ("high", False),  # Argument of type 'x' is not assignable
    "TS2322": ("high", False),  # Type 'x' is not assignable to type 'y'
    "TS7006": ("medium", True),  # Parameter 'x' implicitly has an 'any' type
    "TS7005": ("medium", True),  # Variable 'x' implicitly has an 'any' type
    "TS6133": ("low", True),  # 'x' is declared but its value is never read
    "TS2531": ("medium", False),  # Object is possibly 'null'
    "TS2532": ("medium", False),  # Object is possibly 'undefined'
}

# Lines like: src/file.ts(42,10): error TS2339: Property 'x' does not exist
_LINE_RE = re.compile(r"^(.+?)\((\d+),\d+\): error (TS\d+): (.+)$", re.MULTILINE)


async def scan() -> list[Issue]:
    web_dir = REPO_ROOT / "neufin-web"
    if not web_dir.exists():
        return []

    proc = await asyncio.create_subprocess_shell(
        "npx --yes tsc --noEmit --pretty false 2>&1",
        cwd=str(web_dir),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    stdout, _ = await proc.communicate()
    output = stdout.decode(errors="replace")

    issues: list[Issue] = []
    for match in _LINE_RE.finditer(output):
        file_path_raw, line_str, error_code, message = match.groups()
        sev, auto = TS_SEVERITY.get(error_code, ("medium", False))

        # Make path relative to monorepo root
        try:
            rel = str(Path(file_path_raw).relative_to(REPO_ROOT))
        except ValueError:
            rel = file_path_raw.strip()

        issues.append(
            Issue(
                severity=sev,
                type="type_error",
                file=rel,
                line=int(line_str),
                message=f"{error_code}: {message.strip()}",
                suggested_fix=(
                    "Add explicit type annotation" if auto else "Resolve type mismatch"
                ),
                auto_fixable=auto,
                requires_human=not auto,
                repo="neufin-web",
            )
        )
    return issues
