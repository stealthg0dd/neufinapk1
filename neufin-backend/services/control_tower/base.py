"""Default connector base — implement `fetch()` per provider."""

from __future__ import annotations

import datetime
from abc import ABC, abstractmethod

from services.control_tower.types import (
    BillingCycleInfo,
    ConnectorHealth,
    ConnectorPayload,
    DeploymentRecord,
    ErrorSummaryItem,
    ModelBreakdownRow,
    QuotaStatus,
    SyncMethod,
    SyncStatus,
    UsageSummary,
)


def _utc_iso() -> str:
    return datetime.datetime.now(datetime.UTC).isoformat()


class BaseConnector(ABC):
    """Optional hooks; primary integration is `fetch()`."""

    connector_id: str = "base"

    async def get_usage_summary(self) -> UsageSummary | None:
        return None

    async def get_billing_cycle(self) -> BillingCycleInfo | None:
        return None

    async def get_quota_status(self) -> QuotaStatus | None:
        return None

    async def get_model_breakdown(self) -> list[ModelBreakdownRow]:
        return []

    async def get_deployments(self) -> list[DeploymentRecord]:
        return []

    async def get_error_summary(self) -> list[ErrorSummaryItem]:
        return []

    @abstractmethod
    async def fetch(self) -> ConnectorPayload:
        """Pull remote state and return a normalized payload."""

    def _skipped(self, reason: str) -> ConnectorPayload:
        return ConnectorPayload(
            connector_id=self.connector_id,
            sync_status=SyncStatus(
                connector_id=self.connector_id,
                health=ConnectorHealth.SKIPPED,
                sync_method=SyncMethod.MANUAL_OVERRIDE,
                last_attempt_at=_utc_iso(),
                notes=reason,
                confidence=0.0,
            ),
        )
