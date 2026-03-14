"""
AI Fallback Chain (March 14, 2026 Stable):
Claude Sonnet 4.6 → OpenAI GPT-4o → Gemini 3.1 Pro (→ 1.5 Flash) → Groq Llama 3.3 70B
"""
import json
import re
import time
import sys
from anthropic import Anthropic
from google import genai as google_genai
from groq import Groq
from openai import OpenAI
from config import ANTHROPIC_KEY, GEMINI_KEY, GROQ_KEY, OPENAI_KEY

# Initialize Google Client
_gemini = google_genai.Client(api_key=GEMINI_KEY)

# Centralized Gemini model config — single source of truth for main.py and ai_router.py
GEMINI_PRIMARY_MODEL = "gemini-3.1-pro-preview"
GEMINI_FALLBACK_MODEL = "gemini-1.5-flash"

# Print available Gemini models at startup so the correct model ID can be confirmed.
# Check your Railway/local stderr logs and update GEMINI_PRIMARY_MODEL to match.
try:
    _available = [m.name for m in _gemini.models.list() if "gemini" in m.name.lower()]
    print(f"[Gemini] Available: {_available}", file=sys.stderr)
    print(f"[Gemini] Primary: {GEMINI_PRIMARY_MODEL} | Fallback: {GEMINI_FALLBACK_MODEL}", file=sys.stderr)
except Exception as _e:
    print(f"[Gemini] Model list failed: {_e}", file=sys.stderr)


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


def _is_model_not_found(exc: Exception) -> bool:
    """Return True if the exception indicates an unknown/unsupported model."""
    msg = str(exc).lower()
    return any(k in msg for k in ("not found", "not_found", "404", "unsupported", "invalid model", "does not exist"))


def call_gemini(prompt: str) -> dict:
    """
    Call Gemini with automatic model fallback.
    Tries GEMINI_PRIMARY_MODEL first; on model-not-found errors retries with GEMINI_FALLBACK_MODEL.
    Raises on all other errors or if both models fail.
    """
    for model in (GEMINI_PRIMARY_MODEL, GEMINI_FALLBACK_MODEL):
        try:
            response = _gemini.models.generate_content(model=model, contents=prompt)
            result = _parse(response.text)
            print(f"[AI] {model} ✓", file=sys.stderr)
            return result
        except Exception as exc:
            if model == GEMINI_PRIMARY_MODEL and _is_model_not_found(exc):
                print(f"[AI] {model} not found — retrying with {GEMINI_FALLBACK_MODEL}", file=sys.stderr)
                continue
            print(f"[AI] {model} ✗ — {exc}", file=sys.stderr)
            raise
    raise RuntimeError(f"Both Gemini models failed: {GEMINI_PRIMARY_MODEL}, {GEMINI_FALLBACK_MODEL}")

async def get_ai_analysis(prompt: str, response_format: str = "json") -> dict:
    """
    Unified AI Analysis with 4-tier provider fallback.
    """

    # ── 1. Claude Sonnet 4.6 (Primary) ───────────────────────────────────────
    t0 = time.monotonic()
    try:
        client = Anthropic(api_key=ANTHROPIC_KEY)
        response = client.messages.create(
            model="claude-sonnet-4-6", # Latest March 2026 Stable
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
        )
        result = _parse(response.content[0].text)
        print(f"[AI] Claude ✓ ({time.monotonic()-t0:.1f}s)")
        return result
    except Exception as e:
        print(f"[AI] Claude ✗ — Error: {e}", file=sys.stderr)

    # ── 2. OpenAI GPT-4o (Tier 2 Fallback) ───────────────────────────────────
    t1 = time.monotonic()
    try:
        client = OpenAI(api_key=OPENAI_KEY)
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
        )
        result = _parse(response.choices[0].message.content)
        print(f"[AI] gpt-4o ✓ ({time.monotonic()-t1:.1f}s)")
        return result
    except Exception as e:
        print(f"[AI] gpt-4o ✗ — {e}", file=sys.stderr)

    # ── 3. Gemini (Tier 3 Fallback) — auto-fallback: primary → gemini-1.5-flash ─
    t2 = time.monotonic()
    try:
        result = call_gemini(prompt)
        print(f"[AI] Gemini ✓ ({time.monotonic()-t2:.1f}s)")
        return result
    except Exception as e:
        print(f"[AI] Gemini ✗ — {e}", file=sys.stderr)

    # ── 4. Groq Llama 3.3 70B (Final Fallback) ───────────────────────────────
    t3 = time.monotonic()
    try:
        client = Groq(api_key=GROQ_KEY)
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are a financial analyst. Return ONLY valid JSON, no markdown."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
        )
        result = _parse(response.choices[0].message.content)
        print(f"[AI] llama-3.3-70b-versatile ✓ ({time.monotonic()-t3:.1f}s)")
        return result
    except Exception as e:
        print(f"[AI] llama-3.3-70b-versatile ✗ — {e}", file=sys.stderr)

    raise Exception("All AI providers failed: claude-sonnet-4-6, gpt-4o, gemini-3.1-pro-preview, llama-3.3-70b-versatile. Check API keys and provider status.")