"""Shared normalized account row for AI usage (control tower + ops snapshot)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class SyncSourceType:
    DIRECT_API = "direct_api"
    EXPORT_IMPORT = "export_import"
    MANUAL_OVERRIDE = "manual_override"
    DASHBOARD_PLACEHOLDER = "dashboard_placeholder"


class AIUsageAccount(BaseModel):
    provider_name: str
    account_name: str
    workspace_or_org: str | None = None
    model_name: str | None = None
    billing_cycle_start: str | None = None
    billing_cycle_end: str | None = None
    quota_type: str = "unknown"
    quota_limit: float | None = None
    quota_used: float | None = None
    quota_remaining: float | None = None
    cost_to_date_usd: float | None = None
    estimated_runway_days: float | None = None
    refresh_source: str
    last_synced_at: str | None = None
    sync_confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="1.0 = verified API read; 0 = manual stub",
    )
    notes: str | None = None
