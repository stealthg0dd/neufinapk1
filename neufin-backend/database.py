import os
import sys
from dotenv import load_dotenv
from supabase import create_client, Client

# ── Read Supabase credentials from system env first (Railway), then .env (local) ─
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
if not SUPABASE_URL or not SUPABASE_KEY:
    load_dotenv()
    if not SUPABASE_URL:
        SUPABASE_URL = os.getenv("SUPABASE_URL")
    if not SUPABASE_KEY:
        SUPABASE_KEY = os.getenv("SUPABASE_KEY")

print(f"[DB] SUPABASE_URL = {'SET ✓ → ' + SUPABASE_URL[:40] if SUPABASE_URL else 'MISSING ✗'}", file=sys.stderr)
print(f"[DB] SUPABASE_KEY = {'SET ✓' if SUPABASE_KEY else 'MISSING ✗'}", file=sys.stderr)

# Synchronous Supabase client — compatible with all routers and sync SDK calls.
# All routers (dna.py, portfolio.py, reports.py, etc.) use sync .execute() calls.
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
