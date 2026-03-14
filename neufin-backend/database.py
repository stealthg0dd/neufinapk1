import sys
from supabase import create_async_client, AsyncClient
from config import SUPABASE_URL, SUPABASE_KEY

# Initialize the Async Client for 2026 FastAPI standards
# This prevents the "Success - No rows returned" ghosting issue
supabase: AsyncClient = create_async_client(SUPABASE_URL, SUPABASE_KEY)

async def save_dna_record(payload: dict):
    """
    Saves a DNA analysis record to Supabase.
    Returns the record_id if successful, else None.
    """
    try:
        # We explicitly use 'await' here to ensure the data is written 
        # before the API response is sent back to the user.
        response = await supabase.table("dna_scores").insert(payload).execute()
        
        if response.data and len(response.data) > 0:
            record_id = response.data[0].get("id")
            print(f"[Database] Record saved successfully: {record_id}")
            return record_id
        else:
            print(f"[Database] Insert returned no data: {response}", file=sys.stderr)
            return None
            
    except Exception as e:
        print(f"[Database] CRITICAL WRITE FAILURE: {e}", file=sys.stderr)
        return None

async def track_event(event_name: str, metadata: dict = None, user_id: str = None):
    """
    Background analytics tracking. 
    Wrapped in try/except so analytics failures never crash the main AI logic.
    """
    try:
        payload = {
            "event_name": event_name,
            "metadata": metadata or {},
            "user_id": user_id
        }
        await supabase.table("analytics_events").insert(payload).execute()
    except Exception as e:
        # We log to stderr but don't raise, keeping the app alive
        print(f"[Analytics] Silent Failure: {e}", file=sys.stderr)