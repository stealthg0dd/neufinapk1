"""
services/research/macro_watcher.py — Macro Data Ingestion Agent
================================================================
Fetches economic data from free public APIs:
  - FRED (Federal Reserve): interest rates, CPI, unemployment, GDP
  - MAS (Monetary Authority of Singapore): SGD rates, SG inflation
  - World Bank: GDP and inflation by country

Stores results in the macro_signals Supabase table.
Generates text embeddings for semantic search.

Schedule: every 4 hours via APScheduler (registered in main.py).
"""

from __future__ import annotations

import asyncio
import datetime
import statistics
from typing import Any

import httpx
import structlog

from core.config import settings
from database import supabase

logger = structlog.get_logger("neufin.macro_watcher")

FRED_BASE = "https://api.stlouisfed.org/fred/series/observations"
MAS_BASE = "https://api.mas.gov.sg/statistics/v1"
WORLDBANK_BASE = "https://api.worldbank.org/v2"

# FRED series to track: (series_id, signal_type, region, title)
FRED_SERIES = [
    ("FEDFUNDS", "interest_rate", "US", "Federal Funds Rate"),
    ("CPIAUCSL", "inflation", "US", "US CPI All Urban Consumers"),
    ("UNRATE", "employment", "US", "US Unemployment Rate"),
    ("GDP", "gdp", "US", "US Gross Domestic Product"),
    ("T10Y2Y", "yield_curve", "US", "10Y-2Y Treasury Yield Spread"),
    ("VIXCLS", "volatility", "GLOBAL", "CBOE Volatility Index (VIX)"),
    ("DGS10", "interest_rate", "US", "10-Year Treasury Constant Maturity Rate"),
]

# World Bank indicators: (indicator, signal_type, region, title)
WORLDBANK_INDICATORS = [
    ("FP.CPI.TOTL.ZG", "inflation", "SG", "Singapore CPI Inflation (% annual)", "SGP"),
    ("NY.GDP.MKTP.KD.ZG", "gdp", "SG", "Singapore GDP Growth Rate", "SGP"),
    ("FP.CPI.TOTL.ZG", "inflation", "CN", "China CPI Inflation (% annual)", "CHN"),
    ("NY.GDP.MKTP.KD.ZG", "gdp", "SEA", "ASEAN GDP Growth", "Z4"),
]


def _get_embedding_sync(text: str) -> list[float] | None:
    """Generate a 1536-dim embedding using OpenAI text-embedding-3-small."""
    try:
        from openai import OpenAI  # noqa: PLC0415
        client = OpenAI(api_key=settings.OPENAI_KEY)
        resp = client.embeddings.create(model="text-embedding-3-small", input=text[:8000])
        return resp.data[0].embedding
    except Exception as exc:
        logger.warning("macro_watcher.embedding_failed", error=str(exc))
        return None


def _compute_significance(value: float, history: list[float]) -> str:
    """Classify significance based on deviation from 12-month average."""
    if not history:
        return "medium"
    try:
        avg = statistics.mean(history)
        std = statistics.stdev(history) if len(history) > 1 else abs(avg * 0.1) or 0.01
        deviation = abs(value - avg) / std if std else 0
        if deviation > 2.5:
            return "critical"
        if deviation > 1.5:
            return "high"
        if deviation > 0.8:
            return "medium"
        return "low"
    except Exception:
        return "medium"


def _upsert_signal(
    signal_type: str,
    region: str,
    source: str,
    title: str,
    value: float,
    previous_value: float | None,
    signal_date: str,
    significance: str,
    raw_data: dict,
) -> bool:
    """Insert macro signal into Supabase, skip if already exists. Returns True if new."""
    change_pct = None
    if previous_value and previous_value != 0:
        change_pct = round((value - previous_value) / abs(previous_value) * 100, 4)

    # Generate embedding text
    embed_text = f"{title}: {value} ({region}, {signal_date}). Significance: {significance}."

    payload: dict[str, Any] = {
        "signal_type": signal_type,
        "region": region,
        "source": source,
        "title": title,
        "value": value,
        "previous_value": previous_value,
        "change_pct": change_pct,
        "signal_date": signal_date,
        "significance": significance,
        "raw_data": raw_data,
    }

    try:
        # Check for duplicate
        existing = (
            supabase.table("macro_signals")
            .select("id")
            .eq("source", source)
            .eq("signal_type", signal_type)
            .eq("signal_date", signal_date)
            .execute()
        )
        if existing.data:
            return False  # Already ingested

        # Generate and attach embedding
        embedding = _get_embedding_sync(embed_text)
        if embedding:
            payload["embedding"] = embedding

        supabase.table("macro_signals").insert(payload).execute()
        logger.info("macro_watcher.signal_inserted", source=source, signal_type=signal_type, region=region)
        return True
    except Exception as exc:
        logger.error("macro_watcher.upsert_failed", error=str(exc), source=source, signal_type=signal_type)
        return False


async def fetch_fred_series(series_id: str, limit: int = 14) -> list[dict]:
    """Fetch recent observations from FRED REST API."""
    if not settings.FRED_API_KEY:
        return []
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                FRED_BASE,
                params={
                    "series_id": series_id,
                    "api_key": settings.FRED_API_KEY,
                    "sort_order": "asc",
                    "limit": str(limit),
                    "file_type": "json",
                },
            )
            obs = resp.json().get("observations", [])
            return [
                {"date": o["date"], "value": float(o["value"])}
                for o in obs
                if o.get("value") not in (".", None, "")
            ]
    except Exception as exc:
        logger.warning("macro_watcher.fred_fetch_failed", series=series_id, error=str(exc))
        return []


async def ingest_fred() -> int:
    """Fetch and store all configured FRED series. Returns count of new signals."""
    if not settings.FRED_API_KEY:
        logger.warning("macro_watcher.fred_key_missing")
        return 0

    new_count = 0
    tasks = {s[0]: fetch_fred_series(s[0]) for s in FRED_SERIES}
    results = await asyncio.gather(*tasks.values(), return_exceptions=True)
    series_results = dict(zip(tasks.keys(), results))

    for series_id, signal_type, region, title in FRED_SERIES:
        obs = series_results.get(series_id)
        if not obs or isinstance(obs, Exception) or len(obs) < 2:
            continue

        history = [o["value"] for o in obs[:-1]]
        latest = obs[-1]
        prev = obs[-2]

        significance = _compute_significance(latest["value"], history)
        inserted = _upsert_signal(
            signal_type=signal_type,
            region=region,
            source="fred",
            title=title,
            value=latest["value"],
            previous_value=prev["value"],
            signal_date=latest["date"] + "T00:00:00Z",
            significance=significance,
            raw_data={"series_id": series_id, "observations": obs[-3:]},
        )
        if inserted:
            new_count += 1

    logger.info("macro_watcher.fred_done", new_signals=new_count)
    return new_count


async def ingest_mas() -> int:
    """Fetch SGD exchange rates and SG interest rates from MAS public API."""
    new_count = 0
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{MAS_BASE}/exchange-rates",
                params={"offset": 0, "limit": 5, "sort_by": "end_of_day", "sort_dir": "desc"},
            )
            if resp.status_code != 200:
                return 0
            data = resp.json().get("result", {}).get("records", [])
    except Exception as exc:
        logger.warning("macro_watcher.mas_fetch_failed", error=str(exc))
        return 0

    for record in data[:3]:
        usd_sgd = record.get("usd_sgd")
        end_of_day = record.get("end_of_day")
        if not usd_sgd or not end_of_day:
            continue
        try:
            value = float(usd_sgd)
        except (ValueError, TypeError):
            continue

        inserted = _upsert_signal(
            signal_type="currency",
            region="SG",
            source="mas",
            title="USD/SGD Exchange Rate",
            value=value,
            previous_value=None,
            signal_date=f"{end_of_day}T00:00:00Z",
            significance="low",
            raw_data={"raw": record},
        )
        if inserted:
            new_count += 1

    logger.info("macro_watcher.mas_done", new_signals=new_count)
    return new_count


async def ingest_worldbank() -> int:
    """Fetch World Bank GDP and inflation data for SG, CN, SEA."""
    new_count = 0
    for indicator, signal_type, region, title, country_code in WORLDBANK_INDICATORS:
        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                resp = await client.get(
                    f"{WORLDBANK_BASE}/country/{country_code}/indicator/{indicator}",
                    params={"format": "json", "mrv": "5", "per_page": "5"},
                )
                if resp.status_code != 200:
                    continue
                records = resp.json()
                if not isinstance(records, list) or len(records) < 2:
                    continue
                obs = [r for r in records[1] if r.get("value") is not None]
                if len(obs) < 2:
                    continue

                latest = obs[0]
                history = [float(r["value"]) for r in obs[1:]]
                significance = _compute_significance(float(latest["value"]), history)

                inserted = _upsert_signal(
                    signal_type=signal_type,
                    region=region,
                    source="worldbank",
                    title=title,
                    value=float(latest["value"]),
                    previous_value=float(obs[1]["value"]) if len(obs) > 1 else None,
                    signal_date=f"{latest['date']}-01-01T00:00:00Z",
                    significance=significance,
                    raw_data={"indicator": indicator, "country": country_code, "records": obs[:3]},
                )
                if inserted:
                    new_count += 1
        except Exception as exc:
            logger.warning("macro_watcher.worldbank_failed", indicator=indicator, error=str(exc))

    logger.info("macro_watcher.worldbank_done", new_signals=new_count)
    return new_count


async def run_macro_watcher() -> dict:
    """
    Main entry point — run all data sources concurrently.
    Called by APScheduler every 4 hours.
    """
    logger.info("macro_watcher.run_start")
    fred_count, mas_count, wb_count = await asyncio.gather(
        ingest_fred(),
        ingest_mas(),
        ingest_worldbank(),
    )
    total = fred_count + mas_count + wb_count
    logger.info("macro_watcher.run_complete", total_new=total)
    return {"fred": fred_count, "mas": mas_count, "worldbank": wb_count, "total": total}
