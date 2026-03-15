"""
Global Market Health
---------------------
Aggregated, anonymised statistics across all Neufin portfolios.

GET /api/market/health           → platform-wide DNA stats (5-min cache)
GET /api/market/score-trend      → avg DNA score per day, last 30 days (5-min cache)
POST /api/analytics/track        → client-side funnel event ingestion
"""

import time
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from database import supabase

router = APIRouter(tags=["market"])

# ── Simple in-process 5-minute dict cache ─────────────────────────────────────
_cache: dict[str, tuple[float, object]] = {}
_CACHE_TTL = 300  # seconds


def _cached(key: str, ttl: int = _CACHE_TTL):
    """Return (hit, value). hit=True means cache is fresh."""
    if key in _cache:
        ts, value = _cache[key]
        if time.monotonic() - ts < ttl:
            return True, value
    return False, None


def _store(key: str, value: object):
    _cache[key] = (time.monotonic(), value)


# ── Investor type metadata ─────────────────────────────────────────────────────
_TYPE_META = {
    "Diversified Strategist": {"sector": "Balanced",    "color": "#3b82f6"},
    "Conviction Growth":      {"sector": "Growth",      "color": "#8b5cf6"},
    "Momentum Trader":        {"sector": "Momentum",    "color": "#f59e0b"},
    "Defensive Allocator":    {"sector": "Defensive",   "color": "#22c55e"},
    "Speculative Investor":   {"sector": "Speculative", "color": "#ef4444"},
}

_SCORE_BANDS = [
    {"range": "0–20",  "label": "High Risk"},
    {"range": "21–40", "label": "Below Avg"},
    {"range": "41–60", "label": "Average"},
    {"range": "61–80", "label": "Good"},
    {"range": "81–100","label": "Excellent"},
]


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/api/market/health")
async def market_health():
    """
    Returns aggregated platform stats — all data is anonymous.
    Cached for 5 minutes to reduce Supabase load.
    """
    hit, cached = _cached("market_health")
    if hit:
        return cached

    try:
        result = (
            supabase.table("dna_scores")
            .select("dna_score, investor_type, total_value, max_position_pct, created_at")
            .not_.is_("dna_score", "null")
            .execute()
        )
        rows = result.data or []
    except Exception as e:
        raise HTTPException(500, f"Could not fetch market data: {e}")

    if not rows:
        payload = {
            "total_portfolios": 0,
            "avg_dna_score": 0,
            "median_dna_score": 0,
            "avg_concentration": 0,
            "score_distribution": [],
            "strategy_mix": [],
        }
        _store("market_health", payload)
        return payload

    scores = [r["dna_score"] for r in rows if r.get("dna_score") is not None]
    concentrations = [r["max_position_pct"] for r in rows if r.get("max_position_pct") is not None]

    # Score distribution
    bands = [0, 0, 0, 0, 0]
    for s in scores:
        idx = min(int(s // 20), 4)
        bands[idx] += 1

    score_distribution = [
        {**_SCORE_BANDS[i], "count": bands[i], "pct": round(bands[i] / len(scores) * 100, 1)}
        for i in range(5)
    ]

    # Strategy mix (investor_type breakdown)
    type_counts: dict[str, int] = {}
    for r in rows:
        t = r.get("investor_type") or "Unknown"
        type_counts[t] = type_counts.get(t, 0) + 1

    total = len(rows)
    strategy_mix = sorted(
        [
            {
                "type":   t,
                "count":  cnt,
                "pct":    round(cnt / total * 100, 1),
                "color":  _TYPE_META.get(t, {}).get("color", "#6b7280"),
                "sector": _TYPE_META.get(t, {}).get("sector", t),
            }
            for t, cnt in type_counts.items()
        ],
        key=lambda x: x["count"],
        reverse=True,
    )

    sorted_scores = sorted(scores)
    mid = len(sorted_scores) // 2
    median = (
        sorted_scores[mid]
        if len(sorted_scores) % 2 == 1
        else (sorted_scores[mid - 1] + sorted_scores[mid]) / 2
    )

    payload = {
        "total_portfolios":  total,
        "avg_dna_score":     round(sum(scores) / len(scores), 1),
        "median_dna_score":  round(median, 1),
        "avg_concentration": round(sum(concentrations) / len(concentrations), 1) if concentrations else 0,
        "score_distribution": score_distribution,
        "strategy_mix":       strategy_mix,
    }
    _store("market_health", payload)
    return payload


@router.get("/api/market/score-trend")
async def score_trend():
    """
    Daily average DNA score for the last 30 days.
    Cached for 5 minutes.
    """
    hit, cached = _cached("score_trend")
    if hit:
        return cached

    try:
        result = (
            supabase.table("dna_scores")
            .select("dna_score, created_at")
            .not_.is_("dna_score", "null")
            .order("created_at", desc=False)
            .limit(2000)
            .execute()
        )
        rows = result.data or []
    except Exception as e:
        raise HTTPException(500, f"Could not fetch trend data: {e}")

    # Bucket by date (YYYY-MM-DD)
    daily: dict[str, list[int]] = {}
    for r in rows:
        day = (r.get("created_at") or "")[:10]
        if day:
            daily.setdefault(day, []).append(r["dna_score"])

    trend = [
        {
            "date":      day,
            "avg_score": round(sum(scores) / len(scores), 1),
            "count":     len(scores),
        }
        for day, scores in sorted(daily.items())
    ]

    payload = {"trend": trend}
    _store("score_trend", payload)
    return payload


# ── Client-side analytics ingestion ───────────────────────────────────────────

class TrackRequest(BaseModel):
    event: str
    properties: Optional[dict] = None
    session_id: Optional[str] = None


@router.post("/api/analytics/track")
async def track_event(body: TrackRequest):
    """
    Lightweight first-party analytics event ingestion.
    Called from the frontend useAnalytics hook.
    Silently ignores failures so it never breaks the UI.
    """
    try:
        supabase.table("analytics_events").insert({
            "event":      body.event,
            "session_id": body.session_id,
            "properties": body.properties or {},
        }).execute()
    except Exception:
        pass  # fire-and-forget
    return {"ok": True}
