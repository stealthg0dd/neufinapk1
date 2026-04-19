"""Lightweight code-health hints from file paths (no test runner integration)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from services.repo_intel.loc_scanner import resolve_repo_root


def count_test_files(root: Path) -> dict[str, Any]:
    root = root.resolve()
    n = 0
    patterns = (
        "test_",
        "_test.py",
        ".test.",
        ".spec.",
        "/__tests__/",
        "/tests/",
    )
    for p in root.rglob("*"):
        if not p.is_file():
            continue
        rel = str(p.relative_to(root))
        if "node_modules" in rel or ".git" in rel:
            continue
        low = rel.lower()
        if any(x in low for x in patterns):
            n += 1
    return {"test_files_count": n}


def build_health_summary(loc_result: dict[str, Any] | None) -> dict[str, Any]:
    """Executive summary — CI/lint status requires external APIs (see github_metrics)."""
    root = resolve_repo_root()
    if root is None:
        return {
            "note": "OPS_REPO_INTEL_ROOT unset and monorepo root not detected — test file scan skipped.",
        }
    tf = count_test_files(root)
    loc_total = (loc_result or {}).get("total_loc")
    ratio = None
    if loc_total and loc_total > 0 and tf.get("test_files_count"):
        ratio = round(tf["test_files_count"] / max(loc_total / 500, 1), 4)
    return {
        **tf,
        "test_to_loc_ratio_hint": ratio,
        "lint_typecheck": "not_executed_in_snapshot",
        "note": "Live lint/typecheck requires CI integration; see ci_workflow_runs_recent from GitHub.",
    }
