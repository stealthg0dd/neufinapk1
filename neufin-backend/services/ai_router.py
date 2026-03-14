"""
AI Fallback Chain (2026 Edition): 
Claude Sonnet 4.6 → Gemini 3 Flash → GPT-OSS 120B (Groq)
Each model is attempted in order; the first successful response is returned.
"""
import json
import re
import time
from anthropic import Anthropic
from google import genai as google_genai
from groq import Groq
from config import ANTHROPIC_KEY, GEMINI_KEY, GROQ_KEY

# Initialize Client once to reuse the connection
_gemini = google_genai.Client(api_key=GEMINI_KEY)

def _strip_json_fences(text: str) -> str:
    """Strip markdown code fences that Gemini/Groq often wrap around JSON."""
    text = text.strip()
    # Removes ```json ... ``` or just ``` ... ```
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()

def _parse(text: str) -> dict:
    return json.loads(_strip_json_fences(text))

async def get_ai_analysis(prompt: str, response_format: str = "json") -> dict:
    """
    Attempt analysis with the 2026 production-ready fallback chain.
    """

    # ── 1. Claude Sonnet 4.6 ──────────────────────────────────────────────────
    # Primary model: Best in class for behavioral & financial analysis.
    t0 = time.monotonic()
    try:
        client = Anthropic(api_key=ANTHROPIC_KEY)
        response = client.messages.create(
            model="claude-sonnet-4-6", # Stable version released Feb 2026
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
        )
        result = _parse(response.content[0].text)
        print(f"[AI] Claude ✓  ({time.monotonic()-t0:.1f}s)")
        return result
    except Exception as e:
        print(f"[AI] Claude ✗  ({time.monotonic()-t0:.1f}s) — {type(e).__name__}: {e}")

    # ── 2. Gemini 3 Flash ─────────────────────────────────────────────────────
    # First fallback: Lightning fast, PhD-level reasoning for DNA profiles.
    t0 = time.monotonic()
    try:
        response = _gemini.models.generate_content(
            model="gemini-3-flash-preview", # Current high-stability preview in March 2026
            contents=prompt,
        )
        result = _parse(response.text)
        print(f"[AI] Gemini ✓  ({time.monotonic()-t0:.1f}s)")
        return result
    except Exception as e:
        print(f"[AI] Gemini ✗  ({time.monotonic()-t0:.1f}s) — {type(e).__name__}: {e}")

    # ── 3. Groq (GPT-OSS 120B) ───────────────────────────────────────────────
    # Final Fallback: The 2026 replacement for Llama 3.3 on Groq infrastructure.
    t0 = time.monotonic()
    try:
        client = Groq(api_key=GROQ_KEY)
        response = client.chat.completions.create(
            model="openai/gpt-oss-120b", # Current stable Groq workhorse
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

    raise Exception("All AI models failed (Claude 4.6 → Gemini 3 → GPT-OSS)")