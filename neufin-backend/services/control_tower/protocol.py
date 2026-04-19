"""
Connector interface — implement a subset; orchestrator merges results.

All methods are optional: return None if not applicable for this provider.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from services.control_tower.types import (
    BillingCycleInfo,
    ConnectorPayload,
    DeploymentRecord,
    ErrorSummaryItem,
    ModelBreakdownRow,
    QuotaStatus,
    UsageSummary,
)


@runtime_checkable
class ControlTowerConnector(Protocol):
    """Provider adapter — async methods; each may return None when N/A."""

    @property
    def connector_id(self) -> str: ...

    async def fetch(self) -> ConnectorPayload:
        """Primary entry: pull whatever this provider supports in one pass."""
        ...

    async def get_usage_summary(self) -> UsageSummary | None: ...

    async def get_billing_cycle(self) -> BillingCycleInfo | None: ...

    async def get_quota_status(self) -> QuotaStatus | None: ...

    async def get_model_breakdown(self) -> list[ModelBreakdownRow]: ...

    async def get_deployments(self) -> list[DeploymentRecord]: ...

    async def get_error_summary(self) -> list[ErrorSummaryItem]: ...
