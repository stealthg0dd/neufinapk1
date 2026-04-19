"""Merge LOC scan + GitHub extended metrics."""

from __future__ import annotations

from typing import Any

from core.config import settings
from services.repo_intel.github_metrics import fetch_extended_github_metrics
from services.repo_intel.health_heuristics import build_health_summary
from services.repo_intel.loc_scanner import run_loc_scan_if_enabled


async def build_repo_intelligence_snapshot() -> dict[str, Any]:
    loc = run_loc_scan_if_enabled()
    health = build_health_summary(
        loc if isinstance(loc, dict) and not loc.get("skipped") else None
    )

    gh_ext: dict[str, Any] | None = None
    if settings.OPS_GITHUB_TOKEN and settings.OPS_GITHUB_REPO:
        gh_ext = await fetch_extended_github_metrics(
            settings.OPS_GITHUB_TOKEN,
            settings.OPS_GITHUB_REPO.strip(),
        )

    return {
        "loc_analytics": loc,
        "github_extended": gh_ext,
        "engineering_health": health,
    }
