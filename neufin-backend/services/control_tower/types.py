"""Typed normalized shapes for connector outputs (chart/table ready)."""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class SyncMethod(str, Enum):
    DIRECT_API = "direct_api"
    EXPORT_IMPORT = "export_import"
    MANUAL_OVERRIDE = "manual_override"
    DASHBOARD_PLACEHOLDER = "dashboard_placeholder"


class ConnectorHealth(str, Enum):
    OK = "ok"
    PARTIAL = "partial"
    FAILED = "failed"
    SKIPPED = "skipped"


class SyncStatus(BaseModel):
    """Per-connector last sync metadata."""

    connector_id: str
    health: ConnectorHealth = ConnectorHealth.SKIPPED
    sync_method: SyncMethod = SyncMethod.DASHBOARD_PLACEHOLDER
    last_attempt_at: str | None = None
    last_success_at: str | None = None
    error_message: str | None = None
    confidence: float = Field(ge=0.0, le=1.0, default=0.0)
    notes: str | None = None


class UsageSummary(BaseModel):
    period_start: str | None = None
    period_end: str | None = None
    total_cost_usd: float | None = None
    total_input_tokens: int | None = None
    total_output_tokens: int | None = None
    currency: str = "USD"
    raw: dict[str, Any] = Field(default_factory=dict)


class BillingCycleInfo(BaseModel):
    cycle_start: str | None = None
    cycle_end: str | None = None
    plan_label: str | None = None


class QuotaStatus(BaseModel):
    quota_type: str = "unknown"
    limit: float | None = None
    used: float | None = None
    remaining: float | None = None
    unit: str | None = None


class ModelBreakdownRow(BaseModel):
    model: str
    cost_usd: float | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    requests: int | None = None


class DeploymentRecord(BaseModel):
    id: str | None = None
    service_name: str | None = None
    environment: str | None = None
    status: str | None = None
    url: str | None = None
    created_at: str | None = None
    target: str | None = None
    error_message: str | None = None
    provider: str
    commit_sha: str | None = None
    building_at: str | None = None
    ready_at: str | None = None
    duration_ms: int | None = None
    build_error_hint: str | None = None


class ErrorSummaryItem(BaseModel):
    source: str
    severity: str = "info"
    title: str
    count: int | None = None
    environment: str | None = None
    service: str | None = None
    first_seen: str | None = None
    last_seen: str | None = None
    detail: str | None = None


class ConnectorPayload(BaseModel):
    """What a connector returns after one sync attempt."""

    connector_id: str
    sync_status: SyncStatus
    usage_summary: UsageSummary | None = None
    billing_cycle: BillingCycleInfo | None = None
    quota: QuotaStatus | None = None
    model_breakdown: list[ModelBreakdownRow] = Field(default_factory=list)
    deployments: list[DeploymentRecord] = Field(default_factory=list)
    error_summary: list[ErrorSummaryItem] = Field(default_factory=list)
    extra: dict[str, Any] = Field(default_factory=dict)
