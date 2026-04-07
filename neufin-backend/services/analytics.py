"""
Analytics service — logs funnel events to Supabase analytics_events table.
Fire-and-forget: errors are swallowed so they never break the main request.

Funnel stages tracked:
  dna_upload_started  → user submitted CSV
  dna_analysis_complete → AI returned result
  share_created       → share token generated
  checkout_initiated  → Stripe session created
  payment_completed   → webhook confirmed paid
  report_fulfilled    → PDF generated and URL returned
  referral_used       → checkout with a valid ref_token
"""

import structlog

from database import supabase

logger = structlog.get_logger("neufin.analytics")


async def track(
    event: str,
    properties: dict | None = None,
    user_id: str | None = None,
    session_id: str | None = None,
) -> None:
    """Log an analytics event to Supabase. Never raises."""
    try:
        supabase.table("analytics_events").insert(
            {
                "event": event,  # column is "event", not "event_name"
                "user_id": user_id,
                "session_id": session_id,
                "properties": properties or {},
            }
        ).execute()
    except Exception as e:
        logger.warning("analytics.track_failed", evt=event, error=str(e))
