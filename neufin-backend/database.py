import os
import sys
from dotenv import load_dotenv
from supabase import create_client, Client

# ── Read Supabase credentials from system env first (Railway), then .env (local) ─
SUPABASE_URL              = os.environ.get("SUPABASE_URL")
SUPABASE_KEY              = os.environ.get("SUPABASE_KEY")          # anon key
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    load_dotenv()
    if not SUPABASE_URL:
        SUPABASE_URL = os.getenv("SUPABASE_URL")
    if not SUPABASE_KEY:
        SUPABASE_KEY = os.getenv("SUPABASE_KEY")
    if not SUPABASE_SERVICE_ROLE_KEY:
        SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

# Use service role key if available — bypasses RLS for all backend operations.
# Without this, RLS policies would block the backend from reading/writing
# records that don't belong to the authenticated session.
_key = SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY

print(f"[DB] SUPABASE_URL          = {'SET ✓ → ' + SUPABASE_URL[:40] if SUPABASE_URL else 'MISSING ✗'}", file=sys.stderr)
print(f"[DB] SUPABASE_KEY          = {'SET ✓' if SUPABASE_KEY else 'MISSING ✗'}", file=sys.stderr)
print(f"[DB] SERVICE_ROLE_KEY      = {'SET ✓ (RLS bypassed)' if SUPABASE_SERVICE_ROLE_KEY else 'MISSING — using anon key (RLS applies)'}", file=sys.stderr)

# Synchronous Supabase client — compatible with all routers and sync SDK calls.
# All routers (dna.py, portfolio.py, reports.py, etc.) use sync .execute() calls.
supabase: Client = create_client(SUPABASE_URL, _key)
