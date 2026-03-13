"""
AI Fallback Chain: Claude 3.5 Sonnet → Gemini 1.5 Pro → Groq Llama 3.3
Each model is attempted in order; the first successful response is returned.
"""
import json
import re
import time
from anthropic import Anthropic
import google.generativeai as genai
from groq import Groq
from config import ANTHROPIC_KEY, GEMINI_KEY, GROQ_KEY


def _strip_json_fences(text: str) -> str:
    """Strip markdown code fences that Gemini/Groq sometimes wrap around JSON."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _parse(text: str) -> dict:
    return json.loads(_strip_json_fences(text))


async def get_ai_analysis(prompt: str, response_format: str = "json") -> dict:
    """
    Attempt analysis with the following fallback chain:
      1. Claude 3.5 Sonnet  — deep behavioral analysis (primary)
      2. Gemini 1.5 Pro     — fallback
      3. Groq Llama 3.3     — high-speed summary fallback
    Raises Exception only when all three models fail.
    """

    # ── 1. Claude 3.5 Sonnet ──────────────────────────────────────────────────
    t0 = time.monotonic()
    try:
        client = Anthropic(api_key=ANTHROPIC_KEY)
        response = client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
        )
        result = _parse(response.content[0].text)
        print(f"[AI] Claude ✓  ({time.monotonic()-t0:.1f}s)")
        return result
    except Exception as e:
        print(f"[AI] Claude ✗  ({time.monotonic()-t0:.1f}s) — {type(e).__name__}: {e}")

    # ── 2. Gemini 1.5 Pro ─────────────────────────────────────────────────────
    t0 = time.monotonic()
    try:
        genai.configure(api_key=GEMINI_KEY)
        model = genai.GenerativeModel(
            "gemini-1.5-pro",
            generation_config={"response_mime_type": "application/json"},
        )
        response = model.generate_content(prompt)
        result = _parse(response.text)
        print(f"[AI] Gemini ✓  ({time.monotonic()-t0:.1f}s)")
        return result
    except Exception as e:
        print(f"[AI] Gemini ✗  ({time.monotonic()-t0:.1f}s) — {type(e).__name__}: {e}")

    # ── 3. Groq Llama 3.3 70B (high-speed summary) ────────────────────────────
    t0 = time.monotonic()
    try:
        client = Groq(api_key=GROQ_KEY)
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "system",
                    "content": "You are a financial analyst. Return ONLY valid JSON, no markdown.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=1500,
        )
        result = _parse(response.choices[0].message.content)
        print(f"[AI] Groq ✓  ({time.monotonic()-t0:.1f}s)")
        return result
    except Exception as e:
        print(f"[AI] Groq ✗  ({time.monotonic()-t0:.1f}s) — {type(e).__name__}: {e}")

    raise Exception("All AI models failed (Claude → Gemini → Groq)")
