from supabase import create_client, Client
from config import SUPABASE_URL, SUPABASE_KEY

# Synchronous Supabase client — compatible with all routers and sync SDK calls.
# All routers (dna.py, portfolio.py, reports.py, etc.) use sync .execute() calls.
# Switching to AsyncClient requires awaiting initialization in a FastAPI lifespan
# event and refactoring every router — not worth the risk vs sync client.
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
