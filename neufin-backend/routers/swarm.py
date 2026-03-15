"""
routers/swarm.py — Neufin Agentic Swarm API endpoints

POST /api/swarm/analyze   Run the full 4-agent swarm on a portfolio
POST /api/swarm/chat      Bloomberg-style agentic chat with MD context

Both endpoints are public (added to PUBLIC_PREFIXES in main.py).
"""

import re
import uuid
import json
import sys
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from typing import Any

# ── Prompt injection patterns ─────────────────────────────────────────────────
_INJECTION_PATTERNS = re.compile(
    r"ignore\s+(previous|all|prior)\s+(instructions?|prompts?|context)"
    r"|system\s+prompt"
    r"|you\s+are\s+now"
    r"|disregard\s+(your|all)"
    r"|forget\s+(everything|your|all)"
    r"|act\s+as\s+(if\s+you\s+are|a\s+different)"
    r"|jailbreak"
    r"|DAN\s+mode"
    # Generic credential patterns — prevents echoing any API key or token shape
    r"|sk-[A-Za-z0-9\-_]{20,}"   # Generic API key (Anthropic, OpenAI, Stripe, etc.)
    r"|eyJ[A-Za-z0-9+/]{10,}"    # JWT / Supabase session token (base64 JSON header)
    r"|AKIA[A-Z0-9]{16}",        # AWS access key ID format
    re.IGNORECASE,
)

_MD_REJECTION = (
    "I am here to discuss your portfolio risk, stress test results, and tax "
    "efficiency. I cannot assist with requests outside of investment analysis."
)


def _sanitize_message(message: str) -> str | None:
    """
    Return the message if clean, or None if a prompt injection attempt is detected.
    Callers should return _MD_REJECTION when None is returned.
    """
    if _INJECTION_PATTERNS.search(message):
        print(f"[Chat] Prompt injection blocked: {message[:120]!r}", file=sys.stderr)
        return None
    return message

from services.agent_swarm import run_swarm, chat_with_swarm
from services.ai_router import get_ai_analysis
from database import supabase

router = APIRouter(prefix="/api/swarm", tags=["swarm"])


# ── Request / Response models ──────────────────────────────────────────────────
class Position(BaseModel):
    symbol:     str
    shares:     float
    price:      float = 0.0
    value:      float = 0.0
    weight:     float = 0.0
    cost_basis: float | None = None


class SwarmAnalyzeRequest(BaseModel):
    positions:   list[Position]
    total_value: float
    user_id:     str | None = None


class ChatRequest(BaseModel):
    message:       str  = Field(..., min_length=3, max_length=500)
    # Portfolio context — used when no record_id is available (guest mode)
    positions:     list[Position] | None = None
    total_value:   float | None          = None
    # Preferred context path — tie this chat to a persisted swarm report
    record_id:     str  | None           = None
    # Full thesis blob passed from frontend (avoids a DB round-trip for record_id)
    thesis_context: dict | None          = None


# ── Background persistence helper ──────────────────────────────────────────────
def _persist_swarm_result(report_id: str, user_id: str, result: dict) -> None:
    """Fire-and-forget: persist swarm result to Supabase swarm_reports table."""
    try:
        thesis = result.get("investment_thesis", {})
        supabase.table("swarm_reports").insert({
            "id":                   report_id,
            "user_id":              user_id,
            "dna_score":            thesis.get("dna_score") or thesis.get("health_score"),
            "headline":             thesis.get("headline"),
            "briefing":             thesis.get("briefing"),
            "top_risks":            thesis.get("top_risks"),
            "macro_advice":         thesis.get("macro_advice"),
            "tax_recommendation":   thesis.get("tax_recommendation"),
            "stress_results":       thesis.get("stress_results"),
            "risk_factors":         thesis.get("risk_factors"),
            "score_breakdown":      thesis.get("score_breakdown"),
            "weighted_beta":        thesis.get("weighted_beta"),
            "sharpe_ratio":         thesis.get("sharpe_ratio"),
            "regime":               thesis.get("regime"),
            "agent_trace":          result.get("agent_trace", []),
        }).execute()
    except Exception as e:
        print(f"[Swarm] Persist failed: {e}", file=sys.stderr)


# ── MD context builder ─────────────────────────────────────────────────────────
def _build_md_context(thesis: dict) -> str:
    """Serialize the most decision-relevant thesis fields for the MD prompt."""
    ctx: dict = {}
    for key in (
        "headline", "briefing", "top_risks", "macro_advice", "tax_recommendation",
        "stress_results", "risk_factors", "regime", "dna_score", "health_score",
        "weighted_beta", "sharpe_ratio", "avg_correlation", "score_breakdown",
    ):
        if thesis.get(key) is not None:
            ctx[key] = thesis[key]
    return json.dumps(ctx, default=str, indent=2)


async def _md_reply(message: str, thesis: dict, record_id: str | None = None) -> dict:
    """
    Call the AI router with a Managing Director system prompt, providing the
    full thesis as structured context.  Returns {reply, key_numbers, action, agent}.
    """
    record_ref = f" (Report ID: {record_id})" if record_id else ""
    context_str = _build_md_context(thesis)

    prompt = f"""You are the Managing Director of a top-tier PE Investment Committee{record_ref}.
You are reviewing the following portfolio risk analysis and must answer the analyst's question
with precision, skepticism, and focus on capital preservation.

## Portfolio Analysis Context
{context_str}

## Analyst Question
"{message}"

Your instructions:
- Be professional, direct, and risk-focused. Never be reassuring without evidence.
- Reference specific numbers from the context (beta, stress results, correlation, etc.)
- If a metric is missing from the context, say so explicitly — do not fabricate data.
- Think like a risk manager, not a salesperson.

Return ONLY valid JSON (no markdown):
{{
  "reply": "2-4 sentence MD-level response with specific numbers from the analysis",
  "key_numbers": {{"metric_name": "value with units"}},
  "action": "one specific, actionable risk management directive",
  "agent": "MD"
}}"""

    try:
        result = await get_ai_analysis(prompt)
        return {
            "reply":       result.get("reply", "Analysis complete."),
            "key_numbers": result.get("key_numbers", {}),
            "action":      result.get("action", ""),
            "agent":       "MD",
        }
    except Exception as e:
        return {
            "reply":       f"IC system error: {e}. Please run the full swarm analysis first.",
            "key_numbers": {},
            "action":      "Re-run swarm analysis for fresh context.",
            "agent":       "MD",
        }


# ── Endpoints ──────────────────────────────────────────────────────────────────
@router.post("/analyze")
async def analyze_with_swarm(
    body: SwarmAnalyzeRequest,
    background_tasks: BackgroundTasks,
):
    """
    Run the full Neufin Agent Swarm on a portfolio.

    Executes four agents in sequence:
      Strategist → Quant → Tax Architect → Critic → Synthesizer

    Returns the complete swarm state including the investment thesis,
    risk metrics, tax analysis, macro context, and agent thinking trace.
    A `swarm_report_id` is injected into investment_thesis so the frontend
    can tie subsequent chat calls to this specific analysis.
    """
    if not body.positions:
        raise HTTPException(status_code=400, detail="positions list must not be empty.")

    ticker_data = [p.model_dump() for p in body.positions]

    try:
        result = await run_swarm(ticker_data, body.total_value)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Swarm analysis failed: {e}")

    # Generate a report_id upfront so we can return it immediately and also
    # use it as the Supabase primary key in the background task.
    report_id = str(uuid.uuid4())
    thesis = result.get("investment_thesis", {})
    thesis["swarm_report_id"] = report_id

    # Persist asynchronously — never block the response
    if body.user_id:
        background_tasks.add_task(_persist_swarm_result, report_id, body.user_id, result)

    return {
        "investment_thesis": thesis,
        "risk_metrics":      result.get("risk_metrics", {}),
        "tax_analysis":      result.get("tax_estimates", {}),
        "macro_context":     result.get("macro_context", ""),
        "critique":          result.get("critique", ""),
        "agent_trace":       result.get("agent_trace", []),
    }


@router.get("/report/{report_id}")
async def get_report(report_id: str):
    """
    Fetch a persisted swarm report by ID from Supabase.
    Used by the frontend to restore thesis state on page refresh.
    """
    try:
        row = (
            supabase.table("swarm_reports")
            .select("*")
            .eq("id", report_id)
            .single()
            .execute()
        )
        if not row.data:
            raise HTTPException(status_code=404, detail="Report not found.")
        return {"investment_thesis": row.data, "found": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Report not found: {e}")


@router.post("/chat")
async def chat(body: ChatRequest):
    """
    Bloomberg-style Managing Director chat.

    Context resolution priority:
      1. thesis_context (passed directly from frontend — zero latency)
      2. record_id       (fetched from Supabase swarm_reports)
      3. positions + total_value (guest fallback — routes via specialist agents)

    The MD prompt forces the AI to reference specific numbers from the analysis
    and respond with the skepticism of a PE risk committee chair.
    Prompt injection attempts are detected and rejected with an MD-appropriate response.
    """
    # ── 0. Sanitize message ────────────────────────────────────────────────────
    clean_message = _sanitize_message(body.message)
    if clean_message is None:
        return {
            "reply":       _MD_REJECTION,
            "key_numbers": {},
            "action":      "Please ask a question about your portfolio's risk or performance.",
            "agent":       "MD",
        }

    # ── 1. thesis_context passed directly ─────────────────────────────────────
    if body.thesis_context:
        result = await _md_reply(clean_message, body.thesis_context, body.record_id)
        return result

    # ── 2. Fetch by record_id from Supabase ────────────────────────────────────
    if body.record_id:
        try:
            row = (
                supabase.table("swarm_reports")
                .select("*")
                .eq("id", body.record_id)
                .single()
                .execute()
            )
            if row.data:
                thesis = {k: row.data[k] for k in row.data if row.data[k] is not None}
                result = await _md_reply(clean_message, thesis, body.record_id)
                return result
        except Exception as e:
            print(f"[Chat] Supabase fetch failed for {body.record_id}: {e}", file=sys.stderr)
        # Fall through to positions fallback if DB lookup fails

    # ── 3. Positions fallback (guest / no persisted report) ───────────────────
    if body.positions and body.total_value is not None:
        ticker_data = [p.model_dump() for p in body.positions]
        try:
            result = await chat_with_swarm(clean_message, ticker_data, body.total_value)
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"Chat analysis failed: {e}")

        # Normalise legacy response shape → SlidingChatPane shape
        resp = result.get("response", {})
        return {
            "reply":         resp.get("answer", "Analysis complete."),
            "key_numbers":   resp.get("key_numbers", {}),
            "action":        resp.get("recommended_action", ""),
            "agent":         result.get("agent", "synthesis"),
            "thinking_steps": result.get("thinking_steps", []),
        }

    raise HTTPException(
        status_code=400,
        detail="Provide thesis_context, record_id, or positions+total_value.",
    )
