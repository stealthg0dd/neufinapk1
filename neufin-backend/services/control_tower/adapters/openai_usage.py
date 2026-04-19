"""OpenAI — billing subscription, dashboard usage (date range), optional org usage."""

from __future__ import annotations

import datetime
from typing import Any

import httpx
import structlog

from core.config import settings
from services.control_tower.base import BaseConnector
from services.control_tower.types import (
    BillingCycleInfo,
    ConnectorHealth,
    ConnectorPayload,
    ModelBreakdownRow,
    QuotaStatus,
    SyncMethod,
    SyncStatus,
    UsageSummary,
)

logger = structlog.get_logger(__name__)

OPENAI_API = "https://api.openai.com/v1"


def _utc_iso() -> str:
    return datetime.datetime.now(datetime.UTC).isoformat()


class OpenAIConnector(BaseConnector):
    connector_id = "openai"

    async def fetch(self) -> ConnectorPayload:
        key = settings.OPENAI_KEY
        if not key:
            return self._skipped("OPENAI_KEY not set — OpenAI connector idle.")

        headers = {
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        }
        err: str | None = None
        usage_summary: UsageSummary | None = None
        billing: BillingCycleInfo | None = None
        quota: QuotaStatus | None = None
        models: list[ModelBreakdownRow] = []
        extra: dict[str, Any] = {}

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                sub_r = await client.get(
                    f"{OPENAI_API}/dashboard/billing/subscription", headers=headers
                )
                if sub_r.status_code == 200:
                    sj = sub_r.json()
                    plan = sj.get("plan") or {}
                    billing = BillingCycleInfo(
                        plan_label=str(plan.get("title") or "openai"),
                    )
                    hard = sj.get("hard_limit_usd")
                    quota = QuotaStatus(
                        quota_type="billing_account",
                        limit=float(hard) if hard is not None else None,
                        unit="usd_monthly_cap",
                    )
                else:
                    extra["subscription_http_status"] = sub_r.status_code

                end = datetime.datetime.now(datetime.UTC).date()
                start = end - datetime.timedelta(days=28)
                u_r = await client.get(
                    f"{OPENAI_API}/dashboard/billing/usage",
                    headers=headers,
                    params={
                        "start_date": start.isoformat(),
                        "end_date": end.isoformat(),
                    },
                )
                if u_r.status_code == 200:
                    uj = u_r.json()
                    extra["billing_usage_raw_keys"] = list(uj.keys())[:20]
                    total = uj.get("total_usage")
                    if total is not None:
                        # Values are often USD as float; some accounts return cents — heuristics:
                        tu = float(total)
                        if tu > 1_000_000:
                            tu = tu / 100.0
                        usage_summary = UsageSummary(
                            period_start=start.isoformat(),
                            period_end=end.isoformat(),
                            total_cost_usd=tu,
                            raw=uj,
                        )
                    daily = uj.get("daily_costs") or []
                    by_model: dict[str, float] = {}
                    for day in daily[:31]:
                        for line in day.get("line_items") or []:
                            name = str(
                                line.get("name") or line.get("model") or "unknown"
                            )
                            cost = line.get("cost") or line.get("total") or 0
                            try:
                                c = float(cost)
                                if c > 1_000_000:
                                    c = c / 100.0
                            except (TypeError, ValueError):
                                c = 0.0
                            by_model[name] = by_model.get(name, 0.0) + c
                    for name, cost in sorted(by_model.items(), key=lambda x: -x[1])[
                        :24
                    ]:
                        models.append(ModelBreakdownRow(model=name, cost_usd=cost))
                else:
                    extra["billing_usage_http_status"] = u_r.status_code
                    extra["billing_usage_body_hint"] = u_r.text[:240]

                # Optional: organization usage (newer API) — best-effort
                ou_r = await client.get(
                    f"{OPENAI_API}/organization/usage/completions",
                    headers=headers,
                    params={
                        "start_time": int(
                            datetime.datetime.combine(
                                start, datetime.time.min, tzinfo=datetime.UTC
                            ).timestamp()
                        ),
                        "end_time": int(
                            datetime.datetime.now(datetime.UTC).timestamp()
                        ),
                        "bucket_width": "1d",
                        "limit": 31,
                    },
                )
                if ou_r.status_code == 200:
                    oj = ou_r.json()
                    extra["org_usage_completions"] = True
                    extra["org_usage_data"] = oj
                    data = oj.get("data") or []
                    by_m: dict[str, dict[str, float]] = {}
                    for bucket in data:
                        for item in bucket.get("results") or []:
                            m = str(item.get("model") or "unknown")
                            by_m.setdefault(m, {"in": 0.0, "out": 0.0})
                            by_m[m]["in"] += float(item.get("input_tokens") or 0)
                            by_m[m]["out"] += float(item.get("output_tokens") or 0)
                    if by_m and not models:
                        for m, tok in sorted(
                            by_m.items(), key=lambda x: -(x[1]["in"] + x[1]["out"])
                        )[:24]:
                            models.append(
                                ModelBreakdownRow(
                                    model=m,
                                    input_tokens=int(tok["in"]),
                                    output_tokens=int(tok["out"]),
                                )
                            )
                else:
                    extra["org_usage_http_status"] = ou_r.status_code

        except Exception as exc:
            err = str(exc)
            logger.warning("openai_connector.fetch_failed", error=err)

        health = (
            ConnectorHealth.OK
            if (usage_summary or billing or models)
            else ConnectorHealth.PARTIAL
        )
        if err:
            health = ConnectorHealth.FAILED

        return ConnectorPayload(
            connector_id=self.connector_id,
            sync_status=SyncStatus(
                connector_id=self.connector_id,
                health=health if not err else ConnectorHealth.FAILED,
                sync_method=SyncMethod.DIRECT_API,
                last_attempt_at=_utc_iso(),
                last_success_at=_utc_iso() if health == ConnectorHealth.OK else None,
                error_message=err,
                confidence=0.82 if usage_summary else 0.45,
                notes=(
                    "Subscription + dashboard billing usage; org /usage/completions when permitted. "
                    "Some API keys cannot access billing dashboards (403)."
                ),
            ),
            usage_summary=usage_summary,
            billing_cycle=billing,
            quota=quota,
            model_breakdown=models,
            extra=extra,
        )
