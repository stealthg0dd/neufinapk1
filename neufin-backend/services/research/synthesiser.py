"""
services/research/synthesiser.py — Research Note Generation Agent
=================================================================
Produces institutional-grade research notes by synthesising:
  - Recent macro signals (from macro_watcher)
  - Recent market events (from news_intelligence)
  - Current market regime (from regime_detector)

Uses Claude Opus via ai_router for Goldman-quality prose.

Schedule: daily at 06:00 SGT (UTC+8) via APScheduler.
Also callable on-demand via POST /api/research/generate.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

UTC = timezone.utc  # Py3.9 — datetime.UTC is 3.11+
from typing import Any

import structlog

from database import supabase
from services.ai_router import get_ai_analysis
from services.research.regime_detector import get_current_regime_summary
from services.research.slug_utils import slugify

logger = structlog.get_logger("neufin.synthesiser")

SYSTEM_PROMPT = """You are a senior macro strategist producing institutional-grade research in the style of Goldman Sachs Global Investment Research. Your output is read by sophisticated professional investors across Southeast Asia.

Guidelines:
- Be specific and data-driven — cite actual numbers from the provided data
- Be actionable — tell readers what to DO, not just what is happening
- Reference Southeast Asia (Singapore, Indonesia, Malaysia, Thailand) implications specifically
- Do not hedge excessively — make clear calls
- Write at the level of a Goldman Sachs or Morgan Stanley macro note
- Keep language precise, avoid filler phrases"""


def _get_embedding_sync(text: str) -> list[float] | None:
    try:
        from openai import OpenAI

        from core.config import settings

        client = OpenAI(api_key=settings.OPENAI_KEY)
        resp = client.embeddings.create(
            model="text-embedding-3-small", input=text[:8000]
        )
        return resp.data[0].embedding
    except Exception as exc:
        logger.warning("synthesiser.embedding_failed", error=str(exc))
        return None


def _fetch_recent_signals(days: int) -> list[dict]:
    cutoff = (datetime.now(UTC) - timedelta(days=days)).isoformat()
    try:
        result = (
            supabase.table("macro_signals")
            .select(
                "signal_type,region,source,title,value,previous_value,change_pct,signal_date,significance"
            )
            .gte("signal_date", cutoff)
            .order("significance", desc=True)
            .order("signal_date", desc=True)
            .limit(25)
            .execute()
        )
        return result.data or []
    except Exception as exc:
        logger.warning("synthesiser.fetch_signals_failed", error=str(exc))
        return []


def _fetch_recent_events(days: int) -> list[dict]:
    cutoff = (datetime.now(UTC) - timedelta(days=days)).isoformat()
    try:
        result = (
            supabase.table("market_events")
            .select(
                "event_type,company_ticker,title,summary,impact_sentiment,impact_score,event_date,sector"
            )
            .gte("event_date", cutoff)
            .neq("impact_sentiment", "neutral")
            .order("event_date", desc=True)
            .limit(20)
            .execute()
        )
        return result.data or []
    except Exception as exc:
        logger.warning("synthesiser.fetch_events_failed", error=str(exc))
        return []


def _build_signals_text(signals: list[dict]) -> str:
    if not signals:
        return "No recent signals available."
    lines = []
    for s in signals:
        change = f" (Δ{s['change_pct']:+.1f}%)" if s.get("change_pct") else ""
        sig_flag = (
            f" [{s['significance'].upper()}]"
            if s.get("significance") in ("high", "critical")
            else ""
        )
        lines.append(
            f"  • {s['title']} ({s['region']}): {s['value']}{change}{sig_flag} — {s['signal_date'][:10]}"
        )
    return "\n".join(lines)


def _build_events_text(events: list[dict]) -> str:
    if not events:
        return "No significant recent events."
    lines = []
    for e in events:
        ticker = f" [{e['company_ticker']}]" if e.get("company_ticker") else ""
        score = (
            f" ({e['impact_score']:+.1f})" if e.get("impact_score") is not None else ""
        )
        lines.append(
            f"  • {e['event_type'].upper()}{ticker}: {e['title'][:100]}{score}"
        )
    return "\n".join(lines)


NOTE_TYPE_INSTRUCTIONS = {
    "macro_outlook": "Write a 7-day macro outlook covering Fed policy, Asian central bank implications, currency impacts, and sector rotation.",
    "sector_analysis": "Analyze the top 3 affected sectors. For each: current position, key catalysts, Singapore-listed proxy stocks.",
    "regime_change": "Write a regime-change alert. Explain what changed, why it matters for SEA portfolios, and required immediate portfolio adjustments.",
    "risk_alert": "Write a risk alert. Identify the top 3 risks, probability estimates, and specific hedging strategies for SEA-focused portfolios.",
}


async def generate_research_note(
    note_type: str = "macro_outlook",
    context_days: int = 7,
    override_context: dict | None = None,
) -> dict:
    """
    Generate an institutional-grade research note.

    Args:
        note_type: 'macro_outlook' | 'sector_analysis' | 'regime_change' | 'risk_alert'
        context_days: how many days of data to look back
        override_context: optional additional context (e.g. for regime change alerts)

    Returns: the saved research note dict
    """
    signals = _fetch_recent_signals(context_days)
    events = _fetch_recent_events(context_days)
    regime_summary = get_current_regime_summary()

    instruction = NOTE_TYPE_INSTRUCTIONS.get(
        note_type, NOTE_TYPE_INSTRUCTIONS["macro_outlook"]
    )

    override_text = ""
    if override_context:
        override_text = f"\nADDITIONAL CONTEXT:\n{json.dumps(override_context, indent=2, default=str)}\n"

    prompt = f"""Using the data below, produce a {note_type.replace("_", " ")} research note.

{instruction}

CURRENT MARKET REGIME: {regime_summary["regime"]} (confidence: {regime_summary["confidence"]:.0%})
{f"Regime started: {regime_summary['started_at']}" if regime_summary.get("started_at") else ""}
{override_text}
MACRO SIGNALS (last {context_days} days):
{_build_signals_text(signals)}

MARKET EVENTS (last {context_days} days):
{_build_events_text(events)}

Return ONLY valid JSON — no markdown, no preamble:
{{
  "title": "<concise research note title>",
  "executive_summary": "<3-sentence max executive summary — the single most important message>",
  "key_findings": [
    {{
      "finding": "<specific finding>",
      "data_support": "<specific data point or number from the signals above>",
      "implication": "<what this means for SEA portfolios>"
    }}
  ],
  "sector_impacts": [
    {{"sector": "<sector name>", "impact": "positive|negative|neutral", "rationale": "<1 sentence>"}}
  ],
  "portfolio_implications": [
    {{"action": "<specific actionable step>", "rationale": "<why>", "time_horizon": "immediate|1_week|1_month|1_quarter"}}
  ],
  "risk_factors": ["<risk 1>", "<risk 2>", "<risk 3>"],
  "affected_tickers": ["<ticker1>", "<ticker2>"],
  "regime": "{regime_summary["regime"]}",
  "confidence_score": <0.0-1.0>,
  "time_horizon": "immediate|1_week|1_month|1_quarter"
}}"""

    try:
        result = await get_ai_analysis(prompt)
    except Exception as exc:
        logger.error("synthesiser.ai_failed", error=str(exc))
        raise

    # Extract fields with safe defaults
    title: str = result.get(
        "title",
        f"{note_type.replace('_', ' ').title()} — {datetime.now(UTC).strftime('%Y-%m-%d')}",
    )
    executive_summary: str = result.get("executive_summary", "")
    full_content: str = json.dumps(result, indent=2)
    affected_sectors: list[str] = [
        s["sector"] for s in result.get("sector_impacts", []) if isinstance(s, dict)
    ]
    affected_tickers: list[str] = result.get("affected_tickers", [])
    confidence: float = float(result.get("confidence_score", 0.7))
    time_horizon: str = result.get("time_horizon", "1_week")
    regime: str = result.get("regime", regime_summary["regime"])

    # Build data_sources reference
    data_sources: list[dict[str, Any]] = [
        {
            "source": s["source"],
            "signal": s["title"],
            "date": s["signal_date"][:10],
            "value": s["value"],
        }
        for s in signals[:5]
    ]

    # Generate embedding from title + executive_summary
    embed_text = f"{title}. {executive_summary}"
    embedding = _get_embedding_sync(embed_text)

    payload: dict[str, Any] = {
        "note_type": note_type,
        "title": title,
        "slug": slugify(title),
        "executive_summary": executive_summary,
        "full_content": full_content,
        "key_findings": result.get("key_findings", []),
        "affected_sectors": affected_sectors,
        "affected_tickers": affected_tickers,
        "regime": regime,
        "time_horizon": time_horizon,
        "confidence_score": confidence,
        "data_sources": data_sources,
        "generated_by": "synthesiser",
        "is_public": note_type
        in ("macro_outlook", "regime_change"),  # Public notes visible to all
    }
    if embedding:
        payload["embedding"] = embedding

    try:
        try:
            insert_result = supabase.table("research_notes").insert(payload).execute()
        except Exception as exc:
            # Migration lag safeguard: if slug column isn't deployed yet, retry without slug.
            if "slug" in str(exc).lower():
                payload_no_slug = {k: v for k, v in payload.items() if k != "slug"}
                insert_result = (
                    supabase.table("research_notes").insert(payload_no_slug).execute()
                )
            else:
                raise
        note = insert_result.data[0] if insert_result.data else payload
        logger.info("synthesiser.note_saved", note_type=note_type, title=title)
        return note
    except Exception as exc:
        logger.error("synthesiser.save_failed", error=str(exc))
        raise


async def run_daily_synthesis() -> dict:
    """
    APScheduler entry point — runs daily at 06:00 SGT.
    Generates the standard daily macro outlook.
    """
    logger.info("synthesiser.daily_run_start")
    note = await generate_research_note(note_type="macro_outlook", context_days=7)
    logger.info("synthesiser.daily_run_complete", title=note.get("title", ""))
    return {"status": "ok", "note_id": note.get("id"), "title": note.get("title")}
