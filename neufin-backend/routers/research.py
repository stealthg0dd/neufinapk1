"""
routers/research.py — Market Intelligence Layer API endpoints
=============================================================
Endpoints:
  GET  /api/research/regime                 — current market regime (public)
  GET  /api/research/notes                  — paginated research notes
  GET  /api/research/notes/{note_id}        — full note (retail+)
  GET  /api/research/signals                — latest macro signals (retail+)
  POST /api/research/query                  — semantic search (advisor+)
  GET  /api/research/portfolio-context/{id} — relevant notes for portfolio (retail+)
  POST /api/research/generate               — trigger note generation on-demand (advisor+)
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from database import supabase
from services.auth_dependency import get_current_user, get_subscribed_user
from services.jwt_auth import JWTUser
from services.research.regime_detector import get_current_regime_summary
from services.research.slug_utils import estimate_read_time_minutes, slugify

logger = structlog.get_logger("neufin.research")

router = APIRouter(prefix="/api/research", tags=["research"])


# ── Helpers ───────────────────────────────────────────────────────────────────


def _get_user_plan(user_id: str) -> str:
    """Return the user's active plan tier ('free', 'retail', 'advisor', 'enterprise')."""
    try:
        result = (
            supabase.table("subscriptions")
            .select("plan")
            .eq("user_id", user_id)
            .eq("status", "active")
            .limit(1)
            .execute()
        )
        return result.data[0]["plan"] if result.data else "free"
    except Exception:
        return "free"


_PLAN_RANK = {"free": 0, "retail": 1, "advisor": 2, "enterprise": 3}


def _require_plan(user_id: str, min_plan: str) -> str:
    """Raise HTTP 403 if user's plan is below min_plan. Returns current plan."""
    plan = _get_user_plan(user_id)
    if _PLAN_RANK.get(plan, 0) < _PLAN_RANK.get(min_plan, 0):
        raise HTTPException(
            status_code=403,
            detail={
                "error": "plan_required",
                "message": f"This feature requires the '{min_plan}' plan or above.",
                "upgrade_url": "/pricing",
                "current_plan": plan,
                "required_plan": min_plan,
            },
        )
    return plan


# ── Pydantic models ───────────────────────────────────────────────────────────


class SemanticSearchRequest(BaseModel):
    query: str
    limit: int = 5
    search_type: str = "all"  # "notes" | "signals" | "events" | "all"


class GenerateNoteRequest(BaseModel):
    note_type: str = (
        "macro_outlook"  # macro_outlook|sector_analysis|regime_change|risk_alert
    )
    context_days: int = 7


class PublicBlogNote(BaseModel):
    id: str
    slug: str
    title: str
    executive_summary: str
    note_type: str
    confidence_score: float | None = None
    created_at: str
    read_time_minutes: int
    asset_tickers: list[str]
    meta_description: str


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/regime")
async def get_regime():
    """
    Current market regime — public endpoint.
    Returns regime name, confidence, start date, and supporting signals.
    """
    regime = get_current_regime_summary()

    # Also return the most recent change for context
    try:
        history = (
            supabase.table("market_regimes")
            .select("regime,started_at,ended_at,confidence")
            .order("started_at", desc=True)
            .limit(5)
            .execute()
        )
        recent_history = history.data or []
    except Exception:
        recent_history = []

    return {
        "current": regime,
        "recent_history": recent_history,
        "generated_at": datetime.now(UTC).isoformat(),
    }


@router.get("/notes")
async def list_notes(
    request: Request,
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=50),
    note_type: str | None = None,
    regime: str | None = None,
):
    """
    List research notes.
    - Unauthenticated / free tier: returns only is_public=true notes
    - Retail tier+: returns all notes
    """
    user = getattr(request.state, "user", None)
    user_id: str | None = user.id if user else None

    # Soft paywall: if authenticated, show all notes (even after trial expiry).
    show_all = bool(user_id)

    offset = (page - 1) * per_page

    query = (
        supabase.table("research_notes")
        .select(
            "id,note_type,title,executive_summary,regime,time_horizon,confidence_score,affected_sectors,generated_at,is_public"
        )
        .order("generated_at", desc=True)
        .range(offset, offset + per_page - 1)
    )

    if not show_all:
        query = query.eq("is_public", True)
    if note_type:
        query = query.eq("note_type", note_type)
    if regime:
        query = query.eq("regime", regime)

    try:
        result = query.execute()
        notes = result.data or []
    except Exception as exc:
        logger.warning("research.list_notes_failed", error=str(exc))
        notes = []

    return {
        "notes": notes,
        "page": page,
        "per_page": per_page,
        "authenticated": user_id is not None,
        "full_access": show_all,
    }


@router.get("/blog", response_model=list[PublicBlogNote])
async def list_blog_notes(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=50),
    type: str | None = Query(None, alias="type"),
):
    """
    Public SEO feed of research notes for blog pages.
    Query params:
      - page
      - limit
      - type=MACRO_OUTLOOK|REGIME_CHANGE|SECTOR_ANALYSIS|BEHAVIORAL
    """
    offset = (page - 1) * limit
    query = (
        supabase.table("research_notes")
        .select(
            "id,slug,title,executive_summary,note_type,confidence_score,generated_at,affected_tickers,asset_tickers,full_content,content,body"
        )
        .eq("is_public", True)
        .order("generated_at", desc=True)
        .range(offset, offset + limit - 1)
    )
    if type:
        query = query.eq("note_type", type.lower())

    try:
        result = query.execute()
        rows = result.data or []
    except Exception as exc:
        logger.warning("research.list_blog_failed", error=str(exc))
        rows = []

    out: list[PublicBlogNote] = []
    for n in rows:
        title = str(n.get("title") or "Untitled")
        summary = str(n.get("executive_summary") or "")
        slug = str(n.get("slug") or "").strip() or slugify(title)
        content = str(n.get("content") or n.get("body") or n.get("full_content") or "")
        tickers = n.get("asset_tickers") or n.get("affected_tickers") or []
        if not isinstance(tickers, list):
            tickers = []
        out.append(
            PublicBlogNote(
                id=str(n.get("id")),
                slug=slug,
                title=title,
                executive_summary=summary,
                note_type=str(n.get("note_type") or ""),
                confidence_score=n.get("confidence_score"),
                created_at=str(n.get("generated_at") or datetime.now(UTC).isoformat()),
                read_time_minutes=estimate_read_time_minutes(summary, content),
                asset_tickers=[str(t).upper() for t in tickers if isinstance(t, str)],
                meta_description=(summary[:160] if summary else title[:160]),
            )
        )
    return out


@router.get("/blog/{slug}")
async def get_blog_note(slug: str):
    """Public full research note by slug with related notes."""
    try:
        result = (
            supabase.table("research_notes")
            .select("*")
            .eq("slug", slug)
            .eq("is_public", True)
            .limit(1)
            .execute()
        )
        if not result.data:
            # Backward-compatible fallback for legacy links that still use note UUID.
            result = (
                supabase.table("research_notes")
                .select("*")
                .eq("id", slug)
                .eq("is_public", True)
                .limit(1)
                .execute()
            )
    except Exception as exc:
        logger.error("research.blog_note_failed", slug=slug, error=str(exc))
        raise HTTPException(
            status_code=500, detail="Failed to retrieve blog note."
        ) from exc

    if not result.data:
        raise HTTPException(status_code=404, detail="Research note not found.")

    note = result.data[0]
    title = str(note.get("title") or "Untitled")
    summary = str(note.get("executive_summary") or "")
    note_slug = str(note.get("slug") or "").strip() or slugify(title)
    content = note.get("content") or note.get("body") or note.get("full_content") or ""
    if isinstance(content, dict):
        content = json.dumps(content, indent=2)
    elif not isinstance(content, str):
        content = str(content)
    tickers = note.get("asset_tickers") or note.get("affected_tickers") or []
    if not isinstance(tickers, list):
        tickers = []

    related: list[dict[str, Any]] = []
    try:
        rel_res = (
            supabase.table("research_notes")
            .select(
                "id,slug,title,executive_summary,note_type,generated_at,confidence_score"
            )
            .eq("is_public", True)
            .eq("note_type", note.get("note_type"))
            .neq("id", note.get("id"))
            .order("generated_at", desc=True)
            .limit(3)
            .execute()
        )
        for r in rel_res.data or []:
            r_title = str(r.get("title") or "Untitled")
            related.append(
                {
                    "id": r.get("id"),
                    "slug": r.get("slug") or slugify(r_title),
                    "title": r_title,
                    "executive_summary": r.get("executive_summary") or "",
                    "note_type": r.get("note_type") or "",
                    "created_at": r.get("generated_at"),
                    "confidence_score": r.get("confidence_score"),
                }
            )
    except Exception as exc:
        logger.debug("research.blog_related_failed", error=str(exc))

    return {
        "id": note.get("id"),
        "slug": note_slug,
        "title": title,
        "executive_summary": summary,
        "content": content,
        "note_type": note.get("note_type"),
        "confidence_score": note.get("confidence_score"),
        "created_at": note.get("generated_at"),
        "read_time_minutes": estimate_read_time_minutes(summary, content),
        "asset_tickers": [str(t).upper() for t in tickers if isinstance(t, str)],
        "meta_description": (summary[:160] if summary else title[:160]),
        "related_notes": related,
    }


@router.get("/notes/{note_id}")
async def get_note(note_id: str, user: JWTUser = Depends(get_current_user)):
    """Full research note — soft paywall (auth required, even if trial expired)."""

    try:
        result = (
            supabase.table("research_notes")
            .select("*")
            .eq("id", note_id)
            .limit(1)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Research note not found.")

        note = result.data[0]
        # Parse full_content (stored as JSON string) back to dict for readability
        if isinstance(note.get("full_content"), str):
            try:
                note["full_content"] = json.loads(note["full_content"])
            except (json.JSONDecodeError, TypeError):
                pass

        return note
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("research.get_note_failed", note_id=note_id, error=str(exc))
        raise HTTPException(status_code=500, detail="Failed to retrieve note.") from exc


@router.get("/signals")
async def get_signals(
    user: JWTUser = Depends(get_current_user),
    region: str | None = None,
    signal_type: str | None = None,
    significance: str | None = None,
    days: int = Query(30, ge=1, le=180),
    limit: int = Query(20, ge=1, le=100),
):
    """Latest macro signals — soft paywall (auth required, even if trial expired)."""

    from datetime import timedelta

    cutoff = (datetime.now(UTC) - timedelta(days=days)).isoformat()

    query = (
        supabase.table("macro_signals")
        .select(
            "id,signal_type,region,source,title,value,previous_value,change_pct,signal_date,significance"
        )
        .gte("signal_date", cutoff)
        .order("signal_date", desc=True)
        .limit(limit)
    )
    if region:
        query = query.eq("region", region)
    if signal_type:
        query = query.eq("signal_type", signal_type)
    if significance:
        query = query.eq("significance", significance)

    try:
        result = query.execute()
        return {"signals": result.data or [], "days": days}
    except Exception as exc:
        logger.error("research.get_signals_failed", error=str(exc))
        raise HTTPException(
            status_code=500, detail="Failed to retrieve signals."
        ) from exc


@router.post("/query")
async def semantic_search(
    body: SemanticSearchRequest, user: JWTUser = Depends(get_subscribed_user)
):
    """
    Semantic search across the knowledge base using pgvector cosine similarity.
    Requires advisor plan or above (this is the core moat endpoint).
    """
    # Hard paywall: advisor-tier feature (vector search). After trial ends, returns 402.

    if not body.query.strip():
        raise HTTPException(status_code=422, detail="Query cannot be empty.")

    # Generate embedding for the search query
    try:
        from openai import OpenAI

        from core.config import settings

        client = OpenAI(api_key=settings.OPENAI_KEY)
        embed_resp = client.embeddings.create(
            model="text-embedding-3-small",
            input=body.query[:8000],
        )
        query_embedding: list[float] = embed_resp.data[0].embedding
    except Exception as exc:
        logger.error("research.embed_query_failed", error=str(exc))
        raise HTTPException(
            status_code=503, detail="Embedding service unavailable."
        ) from exc

    results: dict[str, list[Any]] = {"notes": [], "signals": [], "events": []}
    limit = min(body.limit, 10)

    # Search research notes
    if body.search_type in ("notes", "all"):
        try:
            rpc_result = supabase.rpc(
                "search_research_notes",
                {
                    "query_embedding": query_embedding,
                    "match_threshold": 0.7,
                    "match_count": limit,
                },
            ).execute()
            results["notes"] = rpc_result.data or []
        except Exception as exc:
            logger.warning("research.search_notes_failed", error=str(exc))

    # Search macro signals
    if body.search_type in ("signals", "all"):
        try:
            rpc_result = supabase.rpc(
                "search_macro_signals",
                {
                    "query_embedding": query_embedding,
                    "match_threshold": 0.7,
                    "match_count": limit,
                },
            ).execute()
            results["signals"] = rpc_result.data or []
        except Exception as exc:
            logger.warning("research.search_signals_failed", error=str(exc))

    # Search market events
    if body.search_type in ("events", "all"):
        try:
            rpc_result = supabase.rpc(
                "search_market_events",
                {
                    "query_embedding": query_embedding,
                    "match_threshold": 0.7,
                    "match_count": limit,
                },
            ).execute()
            results["events"] = rpc_result.data or []
        except Exception as exc:
            logger.warning("research.search_events_failed", error=str(exc))

    return {
        "query": body.query,
        "results": results,
        "total": sum(len(v) for v in results.values()),
    }


@router.get("/portfolio-context/{portfolio_id}")
async def portfolio_context(
    portfolio_id: str, user: JWTUser = Depends(get_current_user)
):
    """
    Returns all recent research notes and signals relevant to a saved portfolio's holdings.
    Soft paywall: allow access after trial expiry (banner handled in UI).
    """

    # Fetch portfolio holdings
    try:
        port_result = (
            supabase.table("portfolios")
            .select("id,ticker_data")
            .eq("id", portfolio_id)
            .eq("user_id", user.id)
            .limit(1)
            .execute()
        )
        if not port_result.data:
            raise HTTPException(status_code=404, detail="Portfolio not found.")
        portfolio = port_result.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail="Failed to fetch portfolio."
        ) from exc

    # Extract tickers from portfolio
    ticker_data = portfolio.get("ticker_data") or []
    if isinstance(ticker_data, str):
        try:
            ticker_data = json.loads(ticker_data)
        except (json.JSONDecodeError, TypeError):
            ticker_data = []

    tickers = [t.get("symbol", "") for t in ticker_data if t.get("symbol")]

    # Find research notes mentioning these tickers
    relevant_notes: list[dict] = []
    relevant_signals: list[dict] = []

    if tickers:
        try:
            # Notes with any matching ticker in affected_tickers (JSONB array contains)
            for ticker in tickers[:5]:  # Limit to top 5 to keep query small
                note_result = (
                    supabase.table("research_notes")
                    .select(
                        "id,note_type,title,executive_summary,regime,time_horizon,generated_at"
                    )
                    .contains("affected_tickers", [ticker])
                    .order("generated_at", desc=True)
                    .limit(3)
                    .execute()
                )
                for note in note_result.data or []:
                    if not any(n["id"] == note["id"] for n in relevant_notes):
                        relevant_notes.append(note)
        except Exception as exc:
            logger.warning("research.portfolio_notes_failed", error=str(exc))

    # Always include the latest macro_outlook notes (always relevant)
    try:
        latest_notes = (
            supabase.table("research_notes")
            .select(
                "id,note_type,title,executive_summary,regime,time_horizon,generated_at"
            )
            .in_("note_type", ["macro_outlook", "regime_change"])
            .order("generated_at", desc=True)
            .limit(3)
            .execute()
        )
        for note in latest_notes.data or []:
            if not any(n["id"] == note["id"] for n in relevant_notes):
                relevant_notes.append(note)
    except Exception as _lat_exc:
        logger.debug("research.latest_notes_unavailable", error=str(_lat_exc))

    # Get current regime
    current_regime = get_current_regime_summary()

    return {
        "portfolio_id": portfolio_id,
        "tickers": tickers,
        "current_regime": current_regime,
        "relevant_notes": relevant_notes[:10],
        "relevant_signals": relevant_signals[:10],
    }


@router.post("/generate")
async def generate_note(
    body: GenerateNoteRequest, user: JWTUser = Depends(get_subscribed_user)
):
    """
    Trigger on-demand research note generation.
    Requires advisor plan or above.
    """
    # Hard paywall: advisor-tier AI generation. After trial ends, returns 402.

    valid_types = {"macro_outlook", "sector_analysis", "regime_change", "risk_alert"}
    if body.note_type not in valid_types:
        raise HTTPException(
            status_code=422,
            detail=f"note_type must be one of: {', '.join(valid_types)}",
        )

    try:
        from services.research.synthesiser import (
            generate_research_note,
        )

        note = await generate_research_note(
            note_type=body.note_type,
            context_days=body.context_days,
        )
        return {
            "status": "generated",
            "note_id": note.get("id"),
            "title": note.get("title"),
            "note_type": body.note_type,
        }
    except Exception as exc:
        logger.error(
            "research.generate_failed", note_type=body.note_type, error=str(exc)
        )
        raise HTTPException(status_code=500, detail="Note generation failed.") from exc
