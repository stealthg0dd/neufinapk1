"""
AI Fallback Chain (March 14, 2026 Stable):
Claude Sonnet 4.6 → OpenAI GPT-4o → Gemini 3.1 Pro (→ 1.5 Flash) → Groq Llama 3.3 70B
"""

import json
import re
import time

import structlog
from anthropic import Anthropic
from google import genai as google_genai
from groq import Groq
from openai import OpenAI

from core.config import settings

logger = structlog.get_logger("neufin.ai_router")

# Initialize Google Client lazily to avoid startup failures when GEMINI_KEY is absent
_gemini: google_genai.Client | None = None


def _get_gemini_client() -> google_genai.Client:
    """Lazily initialize and return the Gemini client."""
    global _gemini
    if _gemini is None:
        if not settings.GEMINI_KEY:
            raise ValueError("GEMINI_KEY not set")
        _gemini = google_genai.Client(api_key=settings.GEMINI_KEY)
    return _gemini


# Centralized Gemini model config — single source of truth for main.py and ai_router.py
GEMINI_PRIMARY_MODEL = "gemini-3.1-pro-preview"
GEMINI_FALLBACK_MODEL = settings.GEMINI_FALLBACK_MODEL

# Avoid any network/API calls during import so tests can run without provider keys.
if settings.GEMINI_KEY:
    logger.info(
        "gemini.config",
        primary=GEMINI_PRIMARY_MODEL,
        fallback=GEMINI_FALLBACK_MODEL,
    )
else:
    logger.warning("gemini.key_missing")


def _strip_json_fences(text: str) -> str:
    """Strip markdown code fences and whitespace from AI responses."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _parse(text: str) -> dict:
    """Parse string response into a dictionary with recovery logic."""
    try:
        return json.loads(_strip_json_fences(text))
    except json.JSONDecodeError:
        # Emergency recovery: search for the first '{' and last '}'
        match = re.search(r"(\{.*\})", text, re.DOTALL)
        if match:
            return json.loads(match.group(1))
        raise


def _parse_ai_response(text: str) -> dict:
    """Backward-compatible alias for test and legacy call sites."""
    return _parse(text)


def _is_model_not_found(exc: Exception) -> bool:
    """Return True if the exception indicates an unknown/unsupported model."""
    msg = str(exc).lower()
    return any(
        k in msg
        for k in ("not found", "not_found", "404", "unsupported", "invalid model", "does not exist")
    )


def call_gemini(prompt: str) -> dict:
    """
    Call Gemini with automatic model fallback.
    Tries GEMINI_PRIMARY_MODEL first; on model-not-found errors retries with GEMINI_FALLBACK_MODEL.
    Raises on all other errors or if both models fail.
    """
    for model in (GEMINI_PRIMARY_MODEL, GEMINI_FALLBACK_MODEL):
        try:
            response = _get_gemini_client().models.generate_content(model=model, contents=prompt)
            result = _parse(response.text)
            logger.info("ai.gemini_ok", model=model)
            return result
        except Exception as exc:
            if model == GEMINI_PRIMARY_MODEL and _is_model_not_found(exc):
                logger.warning("ai.gemini_model_not_found", model=model, fallback=GEMINI_FALLBACK_MODEL)
                continue
            logger.warning("ai.gemini_failed", model=model, error=str(exc))
            raise
    raise RuntimeError(
        f"Both Gemini models failed: {GEMINI_PRIMARY_MODEL}, {GEMINI_FALLBACK_MODEL}"
    )


async def get_ai_analysis(prompt: str, response_format: str = "json") -> dict:
    """
    Unified AI Analysis with 4-tier provider fallback.
    """

    # ── 1. Claude Sonnet 4.6 (Primary) ───────────────────────────────────────
    t0 = time.monotonic()
    try:
        if not settings.ANTHROPIC_API_KEY:  # FIXED: skip init entirely when key is absent
            raise ValueError("ANTHROPIC_API_KEY not set")
        client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        response = client.messages.create(
            model="claude-sonnet-4-6",  # Latest March 2026 Stable
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
        )
        result = _parse(response.content[0].text)
        logger.info("ai.claude_ok", elapsed=f"{time.monotonic() - t0:.1f}s")
        return result
    except Exception as e:
        logger.warning("ai.claude_failed", error=str(e))

    # ── 2. OpenAI GPT-4o (Tier 2 Fallback) ───────────────────────────────────
    t1 = time.monotonic()
    try:
        client = OpenAI(api_key=settings.OPENAI_KEY)
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
        )
        result = _parse(response.choices[0].message.content)
        logger.info("ai.gpt4o_ok", elapsed=f"{time.monotonic() - t1:.1f}s")
        return result
    except Exception as e:
        logger.warning("ai.gpt4o_failed", error=str(e))

    # ── 3. Gemini (Tier 3 Fallback) — auto-fallback: primary → GEMINI_FALLBACK_MODEL ─
    t2 = time.monotonic()
    try:
        result = call_gemini(prompt)
        logger.info("ai.gemini_ok", elapsed=f"{time.monotonic() - t2:.1f}s")
        return result
    except Exception as e:
        logger.warning("ai.gemini_failed", error=str(e))

    # ── 4. Groq Llama 3.3 70B (Final Fallback) ───────────────────────────────
    t3 = time.monotonic()
    try:
        client = Groq(api_key=settings.GROQ_KEY)
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "system",
                    "content": "You are a financial analyst. Return ONLY valid JSON, no markdown.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
        )
        result = _parse(response.choices[0].message.content)
        logger.info("ai.llama_ok", elapsed=f"{time.monotonic() - t3:.1f}s")
        return result
    except Exception as e:
        logger.warning("ai.llama_failed", error=str(e))

    raise Exception(
        "All AI providers failed: claude-sonnet-4-6, gpt-4o, gemini-3.1-pro-preview, llama-3.3-70b-versatile. Check API keys and provider status."
    )


async def get_ai_briefing(system_prompt: str, user_content: str) -> str:
    """
    Returns raw markdown text from the AI, NOT a parsed JSON dict.
    Used for the IC Briefing synthesizer where the output is long-form prose.

    Passes system_prompt as a proper system role (not injected into the user turn)
    so the PE Managing Director persona is preserved across all providers.
    """
    # ── 1. Claude (system param) ──────────────────────────────────────────────
    t0 = time.monotonic()
    try:
        client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4096,
            system=system_prompt,
            messages=[{"role": "user", "content": user_content}],
        )
        text = response.content[0].text
        logger.info("ai.briefing_claude_ok", elapsed=f"{time.monotonic() - t0:.1f}s")
        return text
    except Exception as e:
        logger.warning("ai.briefing_claude_failed", error=str(e))

    # ── 2. OpenAI GPT-4o ─────────────────────────────────────────────────────
    t1 = time.monotonic()
    try:
        client = OpenAI(api_key=settings.OPENAI_KEY)
        response = client.chat.completions.create(
            model="gpt-4o",
            max_tokens=4096,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
        )
        text = response.choices[0].message.content
        logger.info("ai.briefing_gpt4o_ok", elapsed=f"{time.monotonic() - t1:.1f}s")
        return text
    except Exception as e:
        logger.warning("ai.briefing_gpt4o_failed", error=str(e))

    # ── 3. Gemini (system prepended to prompt) ────────────────────────────────
    t2 = time.monotonic()
    for model in (GEMINI_PRIMARY_MODEL, GEMINI_FALLBACK_MODEL):
        try:
            full_prompt = f"SYSTEM INSTRUCTIONS:\n{system_prompt}\n\n---\n\nUSER:\n{user_content}"
            response = _get_gemini_client().models.generate_content(
                model=model, contents=full_prompt
            )
            text = response.text
            logger.info("ai.briefing_gemini_ok", model=model, elapsed=f"{time.monotonic() - t2:.1f}s")
            return text
        except Exception as e:
            if model == GEMINI_PRIMARY_MODEL and _is_model_not_found(e):
                continue
            logger.warning("ai.briefing_gemini_failed", model=model, error=str(e))
            break

    # ── 4. Groq Llama 3.3 70B ────────────────────────────────────────────────
    t3 = time.monotonic()
    try:
        client = Groq(api_key=settings.GROQ_KEY)
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            max_tokens=4096,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            temperature=0.2,
        )
        text = response.choices[0].message.content
        logger.info("ai.briefing_groq_ok", elapsed=f"{time.monotonic() - t3:.1f}s")
        return text
    except Exception as e:
        logger.warning("ai.briefing_groq_failed", error=str(e))

    raise Exception("All AI providers failed for IC Briefing generation.")
