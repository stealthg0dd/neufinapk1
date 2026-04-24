#!/usr/bin/env python3
"""
scripts/prod_smoke_test.py — Production provider connectivity test.

Verifies that Anthropic, Google Gemini, and Supabase are reachable using
the current environment variables.  Run this on Railway after deploy:

    python scripts/prod_smoke_test.py

Exit code 0 = all tests passed.  Exit code 1 = one or more failures.
"""
import os
import sys

# Load .env in local dev; Railway injects vars directly into the environment
try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

PASS = "\033[92m[LIVE_TEST_PASSED]\033[0m"
FAIL = "\033[91m[LIVE_TEST_FAILED]\033[0m"
SKIP = "\033[93m[LIVE_TEST_SKIPPED]\033[0m"
results: list[bool] = []


def _require(name: str) -> str | None:
    val = os.environ.get(name)
    if not val:
        print(f"{SKIP}  {name} not set — skipping provider test")
    return val


# ── 1. Anthropic ──────────────────────────────────────────────────────────────
print("\n── Anthropic (Claude) ────────────────────────────────")
api_key = _require("ANTHROPIC_API_KEY")
if api_key:
    try:
        from anthropic import Anthropic

        client = Anthropic(api_key=api_key)
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=16,
            messages=[{"role": "user", "content": "Reply with the single word: OK"}],
        )
        reply = msg.content[0].text.strip()
        print(f"{PASS}  Anthropic → {reply!r}")
        results.append(True)
    except Exception as e:
        print(f"{FAIL}  Anthropic → {e}")
        results.append(False)


# ── 2. Google Gemini ──────────────────────────────────────────────────────────
print("\n── Google Gemini ─────────────────────────────────────")
gemini_key = _require("GEMINI_KEY")
if gemini_key:
    try:
        from google import genai as google_genai

        gclient = google_genai.Client(api_key=gemini_key)
        resp = gclient.models.generate_content(
            model="gemini-1.5-flash",
            contents="Reply with the single word: OK",
        )
        reply = resp.text.strip()
        print(f"{PASS}  Gemini → {reply!r}")
        results.append(True)
    except Exception as e:
        print(f"{FAIL}  Gemini → {e}")
        results.append(False)


# ── 3. Supabase ───────────────────────────────────────────────────────────────
print("\n── Supabase ──────────────────────────────────────────")
supa_url = _require("SUPABASE_URL")
supa_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")
if not supa_key:
    print(f"{SKIP}  SUPABASE_SERVICE_ROLE_KEY / SUPABASE_KEY not set")
if supa_url and supa_key:
    try:
        from supabase import create_client

        db = create_client(supa_url, supa_key)
        # Lightweight probe: read one row from any table we own
        db.table("swarm_reports").select("id").limit(1).execute()
        print(f"{PASS}  Supabase → connection OK (swarm_reports readable)")
        results.append(True)
    except Exception as e:
        print(f"{FAIL}  Supabase → {e}")
        results.append(False)


# ── 4. Polygon (market data primary) ─────────────────────────────────────────
print("\n── Polygon (market data) ─────────────────────────────")
poly_key = _require("POLYGON_API_KEY")
if poly_key:
    try:
        import requests

        r = requests.get(
            "https://api.polygon.io/v2/aggs/ticker/AAPL/prev",
            params={"apiKey": poly_key},
            timeout=8,
        )
        data = r.json()
        if r.status_code == 200 and data.get("resultsCount", 0) > 0:
            close = data["results"][0]["c"]
            print(f"{PASS}  Polygon → AAPL prev close ${close}")
            results.append(True)
        else:
            print(f"{FAIL}  Polygon → unexpected response: {data}")
            results.append(False)
    except Exception as e:
        print(f"{FAIL}  Polygon → {e}")
        results.append(False)


# ── Summary ───────────────────────────────────────────────────────────────────
print("\n" + "─" * 55)
passed = sum(results)
total = len(results)
if total == 0:
    print("⚠  No providers tested (all API keys missing). Set env vars and retry.")
    sys.exit(1)
elif passed == total:
    print(f"✅  ALL {total}/{total} provider tests passed — ready for production.")
    sys.exit(0)
else:
    print(
        f"❌  {passed}/{total} provider tests passed — fix failures before deploying."
    )
    sys.exit(1)
