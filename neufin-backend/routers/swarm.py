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
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field
from typing import Any, Literal

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
from services.auth_dependency import get_current_user
from services.jwt_auth import JWTUser
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


class GlobalChatRequest(BaseModel):
    message:    str  = Field(..., min_length=3, max_length=500)
    agent_type: str  = "general"   # quant | macro | sentiment | trend | general


# ── Background persistence helper ──────────────────────────────────────────────
async def _persist_swarm_result(report_id: str, user_id: str | None, result: dict) -> None:
    """
    Persist swarm result to Supabase swarm_reports table.
    Now async and awaited directly in the analyze endpoint so the record is
    guaranteed to exist before the response (and any redirect to /report/{id}) fires.
    user_id is None for anonymous/guest users — saved as NULL in Supabase.
    """
    import asyncio
    try:
        thesis = result.get("investment_thesis", {})
        row = {
            "id":                   report_id,
            "user_id":              user_id,   # NULL for anonymous — allowed by schema
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
            # ── Rich nested agent outputs ─────────────────────────────────────
            # These fields are populated by the synthesizer and stored as JSONB
            # so that /api/swarm/report/latest can return fully structured data.
            "market_regime":        thesis.get("market_regime"),
            "quant_analysis":       thesis.get("quant_analysis"),
            "tax_report":           thesis.get("tax_report"),
            "risk_sentinel":        thesis.get("risk_sentinel"),
            "alpha_scout":          thesis.get("alpha_scout"),
            "strategist_intel":     thesis.get("strategist_intel"),
        }
        # Run the synchronous Supabase call in a thread so we don't block the event loop
        await asyncio.to_thread(
            lambda: supabase.table("swarm_reports").upsert(row, on_conflict="id").execute()
        )
        print(f"[Swarm] Report {report_id} persisted ✓", file=sys.stderr)
    except Exception as e:
        print(f"[Swarm] Persist failed for {report_id}: {e}", file=sys.stderr)


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
        result      = await get_ai_analysis(prompt)
        reply       = result.get("reply", "Analysis complete.")
        key_numbers = result.get("key_numbers") or {}   # FIXED: never None
        action      = result.get("action", "")
    except Exception as e:
        reply       = f"IC system error: {e}. Please run the full swarm analysis first."
        key_numbers = {}   # FIXED: always present
        action      = "Re-run swarm analysis for fresh context."

    return {
        # Flat shape (SlidingChatPane / AgentChat)
        "reply":       reply,
        "key_numbers": key_numbers,   # FIXED: always present
        "action":      action,
        "agent":       "MD",
        # Nested shape (CommandPalette legacy)
        "response": {
            "answer":             reply,
            "key_numbers":        key_numbers,
            "recommended_action": action,
        },
    }


# ── Endpoints ──────────────────────────────────────────────────────────────────
@router.post("/analyze")
async def analyze_with_swarm(
    body: SwarmAnalyzeRequest,
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
        print(f"[Swarm] analyze exception: {e}", file=sys.stderr)
        return {
            "investment_thesis": {"error": str(e), "status": "failed"},
            "risk_metrics":      {},
            "tax_analysis":      {},
            "macro_context":     "",
            "critique":          "",
            "agent_trace":       [f"ERROR: {e}"],
            # FIXED: key_numbers always present so frontend never crashes on undefined
            "key_numbers":       {"score": 0, "status": "unavailable"},
        }

    report_id = str(uuid.uuid4())
    thesis = result.get("investment_thesis", {})
    thesis["swarm_report_id"] = report_id

    # Always persist — user_id is NULL for anonymous users (allowed by schema)
    await _persist_swarm_result(report_id, body.user_id, result)

    return {
        "investment_thesis": thesis,
        "risk_metrics":      result.get("risk_metrics", {}),
        "tax_analysis":      result.get("tax_estimates", {}),
        "macro_context":     result.get("macro_context", ""),
        "critique":          result.get("critique", ""),
        "agent_trace":       result.get("agent_trace", []),
        # FIXED: key_numbers always present — extracted from thesis for convenience
        "key_numbers":       {
            "dna_score":      str(thesis.get("dna_score") or thesis.get("health_score") or ""),
            "weighted_beta":  str(thesis.get("weighted_beta") or ""),
            "sharpe_ratio":   str(thesis.get("sharpe_ratio") or ""),
            "regime":         str(thesis.get("regime") or ""),
        },
    }


@router.get("/report/latest")
async def get_latest_report(user: JWTUser = Depends(get_current_user)):
    """
    Return the authenticated user's most recent swarm report.

    Shapes the raw DB row into the SwarmReport interface expected by the
    mobile app and web frontend:
      swarm_report_id, briefing, regime, dna_score,
      market_regime, quant_analysis, tax_report,
      risk_sentinel, alpha_scout, strategist_intel, created_at

    Returns 404 if the user has never run a swarm analysis.
    """
    try:
        result = (
            supabase.table("swarm_reports")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not fetch swarm report: {exc}")

    if not result.data:
        raise HTTPException(status_code=404, detail="No swarm report found for this user.")

    row = result.data[0]

    # ── Shape response ─────────────────────────────────────────────────────────
    # Fields stored by _persist_swarm_result (flat scalar fields):
    #   dna_score, briefing, regime, weighted_beta, sharpe_ratio,
    #   score_breakdown, top_risks, risk_factors, agent_trace, created_at
    #
    # New fields added by the updated _persist_swarm_result (rich JSON objects):
    #   market_regime, risk_sentinel, alpha_scout, strategist_intel,
    #   quant_analysis, tax_report
    #
    # For reports persisted before the schema update we reconstruct the nested
    # objects from the flat scalars so old records remain readable.

    score_bd    = row.get("score_breakdown") or {}
    hhi_pts     = score_bd.get("hhi_concentration")

    # market_regime — use stored object if present, else reconstruct minimum
    market_regime = row.get("market_regime") or {
        "regime":     row.get("regime"),
        "confidence": None,
        "cpi_yoy":    None,
        "portfolio_implication": row.get("macro_advice"),
    }

    # quant_analysis — use stored object if present, else reconstruct from flat fields
    quant_analysis = row.get("quant_analysis") or {
        "hhi_pts":        hhi_pts,
        "weighted_beta":  row.get("weighted_beta"),
        "sharpe_ratio":   row.get("sharpe_ratio"),
        "avg_corr":       None,
        "beta_map":       {},
    }

    # tax_report — use stored object if present, else reconstruct from flat recommendation
    tax_report = row.get("tax_report") or {
        "available":             bool(row.get("tax_recommendation")),
        "total_liability":       None,
        "harvest_opportunities": [],
        "tax_drag_pct":          None,
        "narrative":             row.get("tax_recommendation"),
    }

    # risk_sentinel — use stored object if present, else reconstruct from flat lists
    primary_risks = (
        row.get("risk_factors") or row.get("top_risks") or []
    )
    risk_sentinel = row.get("risk_sentinel") or {
        "risk_level":    "medium",
        "risk_score":    None,
        "primary_risks": primary_risks,
        "mitigations":   [],
    }

    # alpha_scout / strategist_intel — stored directly after schema update
    alpha_scout     = row.get("alpha_scout")     or {"opportunities": [], "watchlist": []}
    strategist_intel = row.get("strategist_intel") or {}

    return {
        "swarm_report_id":  row["id"],
        "briefing":         row.get("briefing") or row.get("headline"),
        "regime":           row.get("regime"),
        "dna_score":        row.get("dna_score"),
        "market_regime":    market_regime,
        "quant_analysis":   quant_analysis,
        "tax_report":       tax_report,
        "risk_sentinel":    risk_sentinel,
        "alpha_scout":      alpha_scout,
        "strategist_intel": strategist_intel,
        "created_at":       row.get("created_at"),
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
            # FIXED: return 200 with error payload instead of 503
            print(f"[Swarm] chat exception: {e}", file=sys.stderr)
            return {
                "reply":         f"Analysis error: {e}. Please try again.",
                "key_numbers":   {},
                "action":        "Re-run analysis.",
                "agent":         "MD",
                "thinking_steps": [],
            }

        # Normalise response — support both flat {reply} and nested {response:{answer}} shapes
        # FIXED: always emit both shapes so CommandPalette and SlidingChatPane both work
        resp        = result.get("response", {})
        answer      = resp.get("answer") or result.get("reply", "Analysis complete.")
        key_numbers = resp.get("key_numbers") or result.get("key_numbers") or {}
        action      = resp.get("recommended_action") or result.get("action", "")
        return {
            # Flat shape (SlidingChatPane / AgentChat)
            "reply":          answer,
            "key_numbers":    key_numbers,   # FIXED: always present
            "action":         action,
            "agent":          result.get("agent", "synthesis"),
            "thinking_steps": result.get("thinking_steps", []),
            # Nested shape (CommandPalette legacy)
            "response": {
                "answer":             answer,
                "key_numbers":        key_numbers,   # FIXED: always present
                "recommended_action": action,
            },
        }

    raise HTTPException(
        status_code=400,
        detail="Provide thesis_context, record_id, or positions+total_value.",
    )


# ── System prompts per agent type ──────────────────────────────────────────────
_GLOBAL_AGENT_PROMPTS: dict[str, str] = {
    "quant": (
        "You are a quantitative analyst at a top-tier hedge fund. "
        "You specialise in risk metrics, volatility, beta, correlation, and portfolio mathematics. "
        "Be precise, cite numbers, and think in terms of factor exposure and statistical risk."
    ),
    "macro": (
        "You are a macro strategist covering global markets, central bank policy, inflation, "
        "currency flows, and geopolitical risk. Speak with the authority of a sell-side research head. "
        "Reference real macro indicators (CPI, Fed funds rate, yield curve) where relevant."
    ),
    "technical": (
        "You are a technical analyst with deep expertise in price action, chart patterns, "
        "moving averages, RSI, MACD, support/resistance levels, and volume analysis. "
        "Give precise, chart-based insights. Reference specific levels and timeframes. "
        "Be direct — no fundamental commentary unless asked."
    ),
    "sentiment": (
        "You are a market sentiment analyst specialising in news flow, investor psychology, "
        "fear/greed cycles, and short-term momentum. "
        "Translate market mood into actionable intelligence. "
        "Be concise and direct — no waffle."
    ),
    "trend": (
        "You are a global trend analyst tracking structural shifts in technology, demographics, "
        "energy, and capital markets. Think in multi-year themes. "
        "Identify the trend, its stage (early/mid/late), and investable angle."
    ),
    "general": (
        "You are a senior investment analyst with broad knowledge across equities, macro, "
        "fixed income, and portfolio construction. Answer clearly and concisely. "
        "If you cite a number, make it real. No generic advice."
    ),
}


@router.post("/global-chat")
async def global_chat(body: GlobalChatRequest):
    """
    Portfolio-free market intelligence chat.
    Accepts agent_type to switch personality (quant / macro / sentiment / trend / general).
    No portfolio or auth required — safe to call from the public landing page.
    """
    clean = _sanitize_message(body.message)
    if clean is None:
        return {
            "reply":      "I can only discuss markets, trends, and investment concepts.",
            "key_numbers": {},  # FIXED: always present
            "action":     "",
            "agent":      body.agent_type,
            "response":   {"answer": "I can only discuss markets, trends, and investment concepts.", "key_numbers": {}, "recommended_action": ""},
        }

    agent_type   = body.agent_type.lower().strip() if body.agent_type else "general"
    system_prose = _GLOBAL_AGENT_PROMPTS.get(agent_type, _GLOBAL_AGENT_PROMPTS["general"])

    prompt = f"""{system_prose}

User question: "{clean}"

Return ONLY valid JSON (no markdown fences):
{{
  "reply": "clear, direct 2-4 sentence answer",
  "key_numbers": {{"metric_name": "value with units"}},
  "action": "one specific, actionable takeaway or watch-point"
}}"""

    try:
        data        = await get_ai_analysis(prompt)
        reply       = data.get("reply", "Analysis complete.")
        raw_kn      = data.get("key_numbers") or {}
        action      = data.get("action", "")
    except Exception as e:
        print(f"[GlobalChat] AI error: {e}", file=sys.stderr)
        reply       = "Analysis temporarily unavailable. Please try again shortly."
        raw_kn      = {}
        action      = ""

    # Round any numeric values in key_numbers to 2 decimal places for readability
    key_numbers: dict[str, str] = {}
    for k, v in raw_kn.items():
        try:
            key_numbers[k] = f"{float(v):.2f}" if str(v).replace('.', '', 1).replace('-', '', 1).isdigit() else str(v)
        except (ValueError, TypeError):
            key_numbers[k] = str(v)

    return {
        # Flat shape
        "reply":          reply,
        "key_numbers":    key_numbers,   # FIXED: always present
        "action":         action,
        "agent":          agent_type,
        # Nested shape (CommandPalette compatibility)
        "response": {
            "answer":             reply,
            "key_numbers":        key_numbers,
            "recommended_action": action,
        },
    }
