"""
AI Fallback Chain (March 14, 2026 Stable):
Claude Sonnet 4.6 → OpenAI GPT-4o → Gemini 3.1 Pro (→ 1.5 Flash) → Groq Llama 3.3 70B
"""

from __future__ import annotations

import asyncio
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
        for k in (
            "not found",
            "not_found",
            "404",
            "unsupported",
            "invalid model",
            "does not exist",
        )
    )


def call_gemini(prompt: str) -> dict:
    """
    Call Gemini with automatic model fallback.
    Tries GEMINI_PRIMARY_MODEL first; on model-not-found errors retries with GEMINI_FALLBACK_MODEL.
    Raises on all other errors or if both models fail.
    Synchronous — intended to be called via asyncio.to_thread in get_ai_analysis.
    """
    for model in (GEMINI_PRIMARY_MODEL, GEMINI_FALLBACK_MODEL):
        try:
            response = _get_gemini_client().models.generate_content(
                model=model, contents=prompt
            )
            result = _parse(response.text)
            logger.info("ai.gemini_ok", model=model)
            return result
        except Exception as exc:
            if model == GEMINI_PRIMARY_MODEL and _is_model_not_found(exc):
                logger.warning(
                    "ai.gemini_model_not_found",
                    model=model,
                    fallback=GEMINI_FALLBACK_MODEL,
                )
                continue
            logger.warning("ai.gemini_failed", model=model, error=str(exc))
            raise
    raise RuntimeError(
        f"Both Gemini models failed: {GEMINI_PRIMARY_MODEL}, {GEMINI_FALLBACK_MODEL}"
    )


# ── Per-provider hard timeout (seconds) ───────────────────────────────────────
# These run the blocking SDK call in a thread pool.  asyncio.wait_for enforces
# the deadline; the underlying thread may run a bit longer but the coroutine
# moves on immediately, so the total request budget stays predictable.
_PROVIDER_TIMEOUT: dict[str, int] = {
    "anthropic": 25,
    "openai": 20,
    "gemini": 20,
    "groq": 15,
}


def _call_anthropic_sync(prompt: str) -> dict:
    if not settings.ANTHROPIC_API_KEY:
        raise ValueError("ANTHROPIC_API_KEY not set")
    client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}],
    )
    return _parse(response.content[0].text)


def _call_openai_sync(prompt: str) -> dict:
    client = OpenAI(api_key=settings.OPENAI_KEY)
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
    )
    return _parse(response.choices[0].message.content)


def _call_groq_sync(prompt: str) -> dict:
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
    return _parse(response.choices[0].message.content)


async def get_ai_analysis(prompt: str, response_format: str = "json") -> dict:
    """
    Unified AI Analysis with 4-tier provider fallback.

    Each provider's blocking SDK call runs inside asyncio.to_thread() so the
    event loop remains responsive and asyncio.wait_for() can enforce the hard
    per-provider deadline.  If a provider times out the thread continues in the
    background but the coroutine immediately tries the next provider — ensuring
    the total wall-clock time stays well under the Railway gateway timeout.

    Provider order: Claude → OpenAI → Gemini → Groq
    """
    _providers = [
        ("anthropic", _call_anthropic_sync),
        ("openai", _call_openai_sync),
        ("gemini", call_gemini),
        ("groq", _call_groq_sync),
    ]

    for name, fn in _providers:
        t0 = time.monotonic()
        timeout = float(_PROVIDER_TIMEOUT.get(name, 20))
        try:
            result = await asyncio.wait_for(
                asyncio.to_thread(fn, prompt),
                timeout=timeout,
            )
            logger.info(
                f"ai.{name}_ok",
                elapsed=f"{time.monotonic() - t0:.1f}s",
            )
            return result
        except TimeoutError:
            logger.warning(
                f"ai.{name}_timeout",
                timeout=timeout,
                elapsed=f"{time.monotonic() - t0:.1f}s",
            )
            # Do NOT re-raise — try the next provider immediately.
            continue
        except Exception as e:
            logger.warning(f"ai.{name}_failed", error=str(e))
            continue

    raise Exception(
        "All AI providers failed or timed out: anthropic, openai, gemini, groq. "
        "Check API keys and provider status."
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
            full_prompt = (
                f"SYSTEM INSTRUCTIONS:\n{system_prompt}\n\n---\n\nUSER:\n{user_content}"
            )
            response = _get_gemini_client().models.generate_content(
                model=model, contents=full_prompt
            )
            text = response.text
            logger.info(
                "ai.briefing_gemini_ok",
                model=model,
                elapsed=f"{time.monotonic() - t2:.1f}s",
            )
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
