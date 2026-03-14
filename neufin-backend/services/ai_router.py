"""
AI Fallback Chain (March 14, 2026 Stable): 
Claude Sonnet 4.6 → Gemini 3.1 Pro → Groq GPT-OSS 120B
"""
import json
import re
import time
import sys
from anthropic import Anthropic
from google import genai as google_genai
from groq import Groq
from config import ANTHROPIC_KEY, GEMINI_KEY, GROQ_KEY

# Initialize Google Client globally for connection pooling
# Note: google-genai SDK 1.x+ required
_gemini = google_genai.Client(api_key=GEMINI_KEY)

def _strip_json_fences(text: str) -> str:
    """Strip markdown code fences and whitespace from AI responses."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()

def _parse(text: str) -> dict:
    """Parse string response into a dictionary with fence stripping."""
    try:
        return json.loads(_strip_json_fences(text))
    except json.JSONDecodeError as e:
        print(f"[AI] JSON Parse Error: {e}", file=sys.stderr)
        # Attempt recovery if text contains a JSON object anywhere
        match = re.search(r"(\{.*\})", text, re.DOTALL)
        if match:
            return json.loads(match.group(1))
        raise

async def get_ai_analysis(prompt: str, response_format: str = "json") -> dict:
    """
    Unified AI Analysis with automatic fallback.
    """

    # ── 1. Claude Sonnet 4.6 (Primary) ───────────────────────────────────────
    t0 = time.monotonic()
    try:
        client = Anthropic(api_key=ANTHROPIC_KEY)
        response = client.messages.create(
            model="claude-sonnet-4-6", # Released Feb 2026
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
        )
        result = _parse(response.content[0].text)
        print(f"[AI] Claude ✓ ({time.monotonic()-t0:.1f}s)")
        return result
    except Exception as e:
        print(f"[AI] Claude ✗ ({time.monotonic()-t0:.1f}s) — Error: {e}", file=sys.stderr)

    # ── 2. Gemini 3.1 Pro (Tier 2 Fallback) ───────────────────────────────────
    # Note: gemini-3-pro-preview retired March 9, 2026.
    t0 = time.monotonic()
    try:
        response = _gemini.models.generate_content(
            model="gemini-3.1-pro-preview", 
            contents=prompt,
        )
        result = _parse(response.text)
        print(f"[AI] Gemini ✓ ({time.monotonic()-t0:.1f}s)")
        return result
    except Exception as e:
        print(f"[AI] Gemini ✗ ({time.monotonic()-t0:.1f}s) — Error: {e}", file=sys.stderr)

    # ── 3. Groq (Final Fallback) ─────────────────────────────────────────────
    # High-speed backup using the GPT-OSS 120B engine.
    t0 = time.monotonic()
    try:
        client = Groq(api_key=GROQ_KEY)
        response = client.chat.completions.create(
            model="openai/gpt-oss-120b",
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
        print(f"[AI] Groq ✗ ({time.monotonic()-t0:.1f}s) — Error: {e}", file=sys.stderr)

    raise Exception("Critical: All AI providers (Claude, Gemini, Groq) failed analysis.")