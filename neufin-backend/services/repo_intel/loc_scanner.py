"""
Lines-of-code scan with directory exclusions (no node_modules, build outputs, etc.).

Expensive — only runs when OPS_REPO_INTEL_ROOT points at an existing tree,
or inferred monorepo root for local dev.
"""

from __future__ import annotations

import os
from collections import defaultdict
from pathlib import Path
from typing import Any

import structlog

from core.config import settings

logger = structlog.get_logger(__name__)

SKIP_DIR_NAMES = frozenset(
    {
        ".git",
        ".hg",
        "node_modules",
        "__pycache__",
        ".pytest_cache",
        ".mypy_cache",
        ".ruff_cache",
        ".next",
        "dist",
        "build",
        ".turbo",
        "coverage",
        "htmlcov",
        ".venv",
        "venv",
        "env",
        ".tox",
        "Pods",
        "DerivedData",
        "target",
        ".gradle",
        "vendor",
    }
)

SKIP_FILE_SUFFIXES = frozenset(
    {
        ".png",
        ".jpg",
        ".jpeg",
        ".gif",
        ".webp",
        ".ico",
        ".pdf",
        ".zip",
        ".tar",
        ".gz",
        ".woff",
        ".woff2",
        ".ttf",
        ".eot",
        ".mp4",
        ".mov",
        ".lock",  # lockfiles excluded from LOC
        ".min.js",
        ".min.css",
    }
)

EXT_LANG: dict[str, str] = {
    ".py": "Python",
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".mjs": "JavaScript",
    ".json": "JSON",
    ".md": "Markdown",
    ".sql": "SQL",
    ".yml": "YAML",
    ".yaml": "YAML",
    ".toml": "TOML",
    ".css": "CSS",
    ".scss": "SCSS",
    ".html": "HTML",
    ".rs": "Rust",
    ".go": "Go",
    ".java": "Java",
    ".kt": "Kotlin",
    ".swift": "Swift",
    ".rb": "Ruby",
    ".php": "PHP",
    ".cs": "C#",
    ".cpp": "C++",
    ".c": "C",
    ".h": "C/C++ Header",
    ".sh": "Shell",
    ".graphql": "GraphQL",
}


def _classify_path(rel: str) -> str:
    lower = rel.lower()
    if "test" in lower or "/tests/" in lower or "__tests__" in lower:
        return "test"
    if lower.endswith((".config.ts", ".config.js", ".config.mjs")):
        return "config"
    if "/.github/" in lower or lower.endswith((".yml", ".yaml", ".toml")):
        return "config"
    return "code"


def _line_count(text: str) -> int:
    return sum(1 for line in text.splitlines() if line.strip())


def scan_repo(root: Path) -> dict[str, Any]:
    root = root.resolve()
    loc_by_lang: dict[str, int] = defaultdict(int)
    files_by_lang: dict[str, int] = defaultdict(int)
    category_loc: dict[str, int] = defaultdict(int)
    total_files = 0

    for dirpath, dirnames, filenames in os.walk(root, topdown=True):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIR_NAMES]
        for fn in filenames:
            fp = Path(dirpath) / fn
            try:
                rel = str(fp.relative_to(root))
            except ValueError:
                continue
            if fp.suffix.lower() in SKIP_FILE_SUFFIXES or fp.name.endswith(".lock"):
                continue
            lang = EXT_LANG.get(fp.suffix.lower(), "Other")
            try:
                raw = fp.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            n = _line_count(raw)
            if n == 0:
                continue
            total_files += 1
            cat = _classify_path(rel)
            category_loc[cat] += n
            loc_by_lang[lang] += n
            files_by_lang[lang] += 1

    return {
        "root": str(root),
        "total_loc": sum(loc_by_lang.values()),
        "loc_by_language": dict(sorted(loc_by_lang.items(), key=lambda x: -x[1])),
        "files_by_language": dict(files_by_lang),
        "loc_by_category": dict(category_loc),
        "files_scanned_approx": total_files,
        "exclusion_rules": "Skips node_modules, .git, dist, .next, lockfiles, binaries; classifies test/config heuristically.",
    }


def resolve_repo_root() -> Path | None:
    raw = getattr(settings, "OPS_REPO_INTEL_ROOT", None) or os.getenv(
        "OPS_REPO_INTEL_ROOT", ""
    )
    if raw.strip():
        p = Path(raw).expanduser().resolve()
        return p if p.is_dir() else None
    # Infer monorepo root: neufin-backend/services/repo_intel -> parents[3] = neufin
    here = Path(__file__).resolve()
    inferred = here.parents[3]
    if (inferred / "neufin-web").is_dir() and (inferred / "neufin-backend").is_dir():
        return inferred
    return None


def run_loc_scan_if_enabled() -> dict[str, Any] | None:
    root = resolve_repo_root()
    if root is None:
        return {
            "skipped": True,
            "reason": "OPS_REPO_INTEL_ROOT not set or monorepo root not detected.",
        }
    try:
        return {"skipped": False, **scan_repo(root)}
    except Exception as exc:
        logger.warning("repo_intel.loc_scan_failed", error=str(exc))
        return {"skipped": True, "reason": str(exc)}
