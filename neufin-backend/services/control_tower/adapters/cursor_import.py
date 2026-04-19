"""Cursor — no public usage API; manual / JSON import path only."""

from __future__ import annotations

import datetime
import json
import os
from typing import Any

from core.config import settings
from services.control_tower.base import BaseConnector
from services.control_tower.types import (
    ConnectorHealth,
    ConnectorPayload,
    ModelBreakdownRow,
    SyncMethod,
    SyncStatus,
    UsageSummary,
)


def _utc_iso() -> str:
    return datetime.datetime.now(datetime.UTC).isoformat()


def _manual_cursor_rows() -> list[dict[str, Any]]:
    raw = (
        settings.OPS_CONTROL_TOWER_MANUAL_JSON
        or os.getenv("OPS_CONTROL_TOWER_MANUAL_JSON")
        or ""
    ).strip()
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    rows = data.get("cursor_accounts") or data.get("cursor")
    if isinstance(rows, list):
        return [r for r in rows if isinstance(r, dict)]
    return []


class CursorImportConnector(BaseConnector):
    connector_id = "cursor"

    async def fetch(self) -> ConnectorPayload:
        rows = _manual_cursor_rows()
        if not rows:
            return self._skipped(
                "No public Cursor usage API — add `cursor_accounts` to OPS_CONTROL_TOWER_MANUAL_JSON "
                "(list of {account_name, cost_to_date_usd?, billing_group?, notes?})."
            )

        models: list[ModelBreakdownRow] = []
        total_cost = 0.0
        for r in rows:
            name = str(r.get("account_name") or r.get("name") or "account")
            cost = r.get("cost_to_date_usd") or r.get("spend_usd")
            try:
                c = float(cost) if cost is not None else 0.0
            except (TypeError, ValueError):
                c = 0.0
            total_cost += c
            models.append(
                ModelBreakdownRow(
                    model=f"cursor:{name}",
                    cost_usd=c if c else None,
                )
            )

        usage = UsageSummary(
            total_cost_usd=total_cost or None,
            raw={"accounts": rows},
        )

        return ConnectorPayload(
            connector_id=self.connector_id,
            sync_status=SyncStatus(
                connector_id=self.connector_id,
                health=ConnectorHealth.OK,
                sync_method=SyncMethod.MANUAL_OVERRIDE,
                last_attempt_at=_utc_iso(),
                last_success_at=_utc_iso(),
                confidence=0.55,
                notes="Imported from OPS_CONTROL_TOWER_MANUAL_JSON — not live API.",
            ),
            usage_summary=usage,
            model_breakdown=models,
        )
