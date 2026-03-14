"""
AI Fallback Chain (March 2026): 
Claude Sonnet 4.6 → Gemini 3.1 Pro → Groq GPT-OSS 120B
"""
import json
import re
import time
from anthropic import Anthropic
from google import genai as google_genai
from groq import Groq
from config import ANTHROPIC_KEY, GEMINI_KEY, GROQ_KEY

# Initialize Google Client once for efficiency
# This matches your Railway variable: GEMINI_KEY
_gemini = google_genai.Client(api_key=GEMINI_KEY)

def _strip_json_fences(text: str) -> str:
    """Strip markdown code fences from AI responses."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()

def _parse(text: str) -> dict:
    """Parse string response into a dictionary."""
    return json.loads(_strip_json_fences(text))

async def get_ai_analysis(prompt: str, response_format: str = "json") -> dict:
    """
    Attempt analysis with a multi-provider fallback chain.
    """

    # ── 1. Claude Sonnet 4.6 (Primary) ───────────────────────────────────────
    # Best for complex behavioral and financial reasoning.
    t0 = time.monotonic()
    try:
        client = Anthropic(api_key=ANTHROPIC_KEY)
        response = client.messages.create(
            model="claude-sonnet-4-6", # March 2026 Stable Release
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
        )
        result = _parse(response.content[0].text)
        print(f"[AI] Claude ✓ ({time.monotonic()-t0:.1f}s)")
        return result
    except Exception as e:
        print(f"[AI] Claude ✗ ({time.monotonic()-t0:.1f}s) — {e}")

    # ── 2. Gemini 3.1 Pro (First Fallback) ───────────────────────────────────
    # High-speed fallback with PhD-level reasoning.
    t0 = time.monotonic()
    try:
        response = _gemini.models.generate_content(
            model="gemini-3.1-pro-preview", # Current 2026 production preview
            contents=prompt,
        )
        result = _parse(response.text)
        print(f"[AI] Gemini ✓ ({time.monotonic()-t0:.1f}s)")
        return result
    except Exception as e:
        print(f"[AI] Gemini ✗ ({time.monotonic()-t0:.1f}s) — {e}")

    # ── 3. Groq (Final Fallback) ─────────────────────────────────────────────
    # Uses the hyper-fast GPT-OSS 120B model on Groq LPU.
    t0 = time.monotonic()
    try:
        client = Groq(api_key=GROQ_KEY)
        response = client.chat.completions.create(
            model="openai/gpt-oss-120b", # Industry-standard Groq workhorse
            messages=[
                {
                    "role": "system", 
                    "content": "You are a financial analyst. Return ONLY valid JSON."
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
        )
        result = _parse(response.choices[0].message.content)
        print(f"[AI] Groq ✓ ({time.monotonic()-t0:.1f}s)")
        return result
    except Exception as e:
        print(f"[AI] Groq ✗ ({time.monotonic()-t0:.1f}s) — {e}")

    raise Exception("Critical: All AI providers failed. Check API keys and logs.")