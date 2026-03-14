"""
AI Fallback Chain (March 14, 2026 Stable): 
Claude Sonnet 4.6 → OpenAI GPT-5.4 → Gemini 3.1 Pro → Groq GPT-OSS 120B
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

# Initialize Google Client for Gemini 3.x series
_gemini = google_genai.Client(api_key=GEMINI_KEY)

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

    # ── 2. OpenAI GPT-5.4 (Tier 2 Fallback) ──────────────────────────────────
    t1 = time.monotonic()
    try:
        client = OpenAI(api_key=OPENAI_KEY)
        response = client.chat.completions.create(
            model="gpt-5.4-pro", # Current flagship as of March 2026
            messages=[{"role": "user", "content": prompt}]
        )
        result = _parse(response.choices[0].message.content)
        print(f"[AI] OpenAI ✓ ({time.monotonic()-t1:.1f}s)")
        return result
    except Exception as e:
        print(f"[AI] OpenAI ✗ — Error: {e}", file=sys.stderr)

    # ── 3. Gemini 3.1 Pro (Tier 3 Fallback) ──────────────────────────────────
    t2 = time.monotonic()
    try:
        # Note: Gemini 3.0 was deprecated last week; using 3.1 Pro stable
        response = _gemini.models.generate_content(
            model="gemini-3.1-pro-preview", 
            contents=prompt,
        )
        result = _parse(response.text)
        print(f"[AI] Gemini ✓ ({time.monotonic()-t2:.1f}s)")
        return result
    except Exception as e:
        print(f"[AI] Gemini ✗ — Error: {e}", file=sys.stderr)

    # ── 4. Groq (Final Fallback) ─────────────────────────────────────────────
    t3 = time.monotonic()
    try:
        client = Groq(api_key=GROQ_KEY)
        response = client.chat.completions.create(
            model="openai/gpt-oss-120b", # Open-weight standard on Groq LPU
            messages=[
                {"role": "system", "content": "You are a financial analyst. Return JSON."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
        )
        result = _parse(response.choices[0].message.content)
        print(f"[AI] Groq ✓ ({time.monotonic()-t3:.1f}s)")
        return result
    except Exception as e:
        print(f"[AI] Groq ✗ — Error: {e}", file=sys.stderr)

    # If all 4 tiers fail, we raise a specific error that your app handles
    raise Exception("CRITICAL: All AI providers (Claude 4.6, GPT-5.4, Gemini 3.1, Groq) failed.")