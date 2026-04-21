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
import math
import random
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from database import supabase
from services.auth_dependency import get_current_user, get_subscribed_user
from services.jwt_auth import JWTUser
from services.portfolio_region import detect_region, is_sea_region
from services.quant_model_engine import analyze_financial_modes
from services.research.regime_detector import get_current_regime_summary
from services.research.slug_utils import estimate_read_time_minutes, slugify

UTC = timezone.utc  # noqa: UP017  # Py3.9 compat (datetime.UTC is 3.11+)

logger = structlog.get_logger("neufin.research")

router = APIRouter(prefix="/api/research", tags=["research"])


def _dict_to_markdown(data: dict) -> str:
    """Convert a structured research note dict to clean markdown prose.

    Handles the common LLM-output schema:
      thesis / executive_summary, key_findings, sector_impacts,
      portfolio_implications, risks, conclusion, recommended_action.
    Falls back to JSON pretty-print only as a last resort.
    """
    lines: list[str] = []

    def _add_section(heading: str, value: object) -> None:
        if not value:
            return
        lines.append(f"## {heading}\n")
        if isinstance(value, str):
            lines.append(value.strip())
        elif isinstance(value, list):
            for item in value:
                if isinstance(item, dict):
                    # Flatten common dict shapes
                    parts = []
                    for k in (
                        "finding",
                        "implication",
                        "sector",
                        "impact",
                        "text",
                        "description",
                    ):
                        if item.get(k):
                            parts.append(str(item[k]).strip())
                    support = item.get("data_support") or item.get("evidence") or ""
                    bullet = " — ".join(parts) if parts else str(item)
                    lines.append(f"- {bullet}")
                    if support:
                        lines.append(f"  *{support}*")
                else:
                    lines.append(f"- {item}")
        else:
            lines.append(str(value))
        lines.append("")

    known_keys_handled = set()

    # Ordered presentation
    for field, label in (
        ("thesis", "Thesis"),
        ("executive_summary", "Executive Summary"),
        ("key_findings", "Key Findings"),
        ("sector_impacts", "Sector Impacts"),
        ("portfolio_implications", "Portfolio Implications"),
        ("risks", "Risks"),
        ("conclusion", "Conclusion"),
        ("recommended_action", "Recommended Action"),
    ):
        val = data.get(field)
        if val:
            _add_section(label, val)
            known_keys_handled.add(field)

    # Catch-all for any remaining string/list fields not yet handled
    for k, v in data.items():
        if k in known_keys_handled or k in ("title", "id", "slug", "generated_at"):
            continue
        if isinstance(v, str | list) and v:
            _add_section(k.replace("_", " ").title(), v)

    return "\n".join(lines).strip() if lines else json.dumps(data, indent=2)


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


def _coerce_pagination(
    value: str | None, *, default: int, minimum: int, maximum: int
) -> int:
    """Parse pagination query params defensively to avoid 422s from malformed input."""
    if value is None or value == "":
        return default
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return max(minimum, min(maximum, parsed))


def _normalize_quant_modes(raw: str | None) -> list[str]:
    allowed = {
        "alpha",
        "risk",
        "forecast",
        "macro",
        "allocation",
        "trading",
        "institutional",
    }
    if not raw:
        return ["institutional", "alpha", "risk", "macro", "forecast"]
    out: list[str] = []
    seen: set[str] = set()
    for mode in raw.split(","):
        key = str(mode or "").strip().lower()
        if not key or key in seen or key not in allowed:
            continue
        seen.add(key)
        out.append(key)
    return out or ["institutional", "alpha", "risk", "macro", "forecast"]


def _normalize_position_weights(
    positions: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not positions:
        return []
    out = [dict(p) for p in positions]
    total = sum(float(p.get("weight") or p.get("weight_pct") or 0) for p in out)
    if total > 0:
        for p in out:
            raw = float(p.get("weight") or p.get("weight_pct") or 0)
            p["weight"] = raw / 100.0 if total > 1.5 else raw
        return out

    total_value = sum(float(p.get("value") or 0) for p in out)
    if total_value > 0:
        for p in out:
            p["weight"] = float(p.get("value") or 0) / total_value
        return out

    eq = 1.0 / len(out)
    for p in out:
        p["weight"] = eq
    return out


def _parse_alpha_opportunities(raw_alpha: Any) -> list[dict[str, Any]]:
    if isinstance(raw_alpha, list):
        return [x for x in raw_alpha if isinstance(x, dict)]
    if isinstance(raw_alpha, dict):
        return list(
            raw_alpha.get("opportunities")
            or (raw_alpha.get("alpha_opportunities") or {}).get("opportunities")
            or []
        )
    if isinstance(raw_alpha, str) and raw_alpha.strip().startswith("{"):
        try:
            payload = json.loads(raw_alpha)
            return list(
                payload.get("opportunities")
                or (payload.get("alpha_opportunities") or {}).get("opportunities")
                or []
            )
        except Exception:
            return []
    return []


def _parse_alpha_payload(raw_alpha: Any) -> dict[str, Any]:
    if isinstance(raw_alpha, dict):
        return raw_alpha
    if isinstance(raw_alpha, str) and raw_alpha.strip().startswith("{"):
        try:
            payload = json.loads(raw_alpha)
            return payload if isinstance(payload, dict) else {}
        except Exception:
            return {}
    return {}


def _regime_alignment_score(
    quant_result: dict[str, Any],
    alpha_payload: dict[str, Any],
    region_context: dict[str, Any],
) -> int:
    if not is_sea_region(region_context):
        return 0
    score = 62.0
    signals = alpha_payload.get("vn_specific_alpha_signals") or []
    if signals:
        score += min(14.0, len(signals) * 3.0)
    try:
        alpha_score = float(quant_result.get("alpha_score") or 0)
    except (TypeError, ValueError):
        alpha_score = 0.0
    if alpha_score >= 70:
        score += 12
    elif alpha_score >= 50:
        score += 6
    if region_context.get("primary_market") == "VN":
        score += 6
    return int(max(0, min(100, round(score))))


def _factor_decomposition(quant_result: dict[str, Any]) -> list[dict[str, Any]]:
    breakdown = quant_result.get("model_contribution_breakdown") or {}
    if not isinstance(breakdown, dict):
        breakdown = {}
    out: list[dict[str, Any]] = []
    for k, v in breakdown.items():
        try:
            pct = max(0.0, float(v) * 100.0)
        except (TypeError, ValueError):
            continue
        out.append(
            {
                "factor": str(k).replace("_", " ").title(),
                "weight_pct": round(pct, 2),
            }
        )
    return sorted(out, key=lambda x: x["weight_pct"], reverse=True)


def _monte_carlo_paths(
    portfolio_id: str,
    alpha_score: float,
    vol_proxy: float,
    n_paths: int = 24,
    horizon_days: int = 60,
) -> list[dict[str, Any]]:
    seed = sum(ord(ch) for ch in portfolio_id)
    rng = random.Random(seed)
    drift = (alpha_score - 50.0) / 5000.0
    sigma = max(0.004, min(0.06, vol_proxy / 6.0))

    paths: list[dict[str, Any]] = []
    for pidx in range(n_paths):
        level = 100.0
        points = [{"day": 0, "value": 100.0}]
        for day in range(1, horizon_days + 1):
            shock = rng.gauss(drift, sigma)
            level *= 1.0 + shock
            level = max(35.0, min(220.0, level))
            points.append({"day": day, "value": round(level, 2)})
        paths.append({"path_id": f"path_{pidx + 1}", "points": points})
    return paths


def _var_surface(vol_proxy: float, drawdown_proxy: float) -> list[dict[str, Any]]:
    levels = [0.90, 0.95, 0.99]
    horizon = [1, 5, 10, 20]
    rows: list[dict[str, Any]] = []
    for conf in levels:
        z = 1.28 if conf == 0.90 else 1.65 if conf == 0.95 else 2.33
        for d in horizon:
            var = z * vol_proxy * math.sqrt(d / 252.0)
            cvar = var * (1.1 if conf < 0.99 else 1.2) + drawdown_proxy * 0.1
            rows.append(
                {
                    "confidence": conf,
                    "horizon_days": d,
                    "var_pct": round(var * 100.0, 2),
                    "cvar_pct": round(cvar * 100.0, 2),
                }
            )
    return rows


def _correlation_network(
    positions: list[dict[str, Any]],
    quant_result: dict[str, Any],
) -> dict[str, Any]:
    top = sorted(
        positions,
        key=lambda p: float(p.get("weight") or 0),
        reverse=True,
    )[:8]
    symbols = [str(p.get("symbol") or "").upper() for p in top if p.get("symbol")]
    weights = {
        str(p.get("symbol") or "").upper(): float(p.get("weight") or 0) for p in top
    }

    corr = (quant_result.get("risk_report") or {}).get("correlation_matrix") or {}
    if not isinstance(corr, dict):
        corr = {}

    nodes = [
        {
            "id": sym,
            "label": sym,
            "weight_pct": round(weights.get(sym, 0.0) * 100.0, 2),
        }
        for sym in symbols
    ]
    edges: list[dict[str, Any]] = []
    for i, src in enumerate(symbols):
        for dst in symbols[i + 1 :]:
            rho = (corr.get(src) or {}).get(dst)
            if rho is None:
                rho = (corr.get(dst) or {}).get(src)
            try:
                rho_f = float(rho)
            except (TypeError, ValueError):
                rho_f = 0.0
            if abs(rho_f) < 0.22:
                continue
            edges.append(
                {
                    "source": src,
                    "target": dst,
                    "correlation": round(rho_f, 3),
                }
            )
    return {"nodes": nodes, "edges": edges}


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


@router.get("/quant-dashboard")
async def get_quant_dashboard(
    modes: str | None = Query(None, description="CSV quant modes"),
    user: JWTUser = Depends(get_current_user),
):
    """
    Quant dashboard payload for interactive frontend charts.
    Includes factor decomposition, Monte Carlo paths, VaR/CVaR surface,
    correlation network, and alpha opportunities derived from quant outputs.
    """
    selected_modes = _normalize_quant_modes(modes)

    portfolio_res = (
        supabase.table("portfolios")
        .select("id,name,total_value,created_at")
        .eq("user_id", str(user.id))
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    portfolio = (portfolio_res.data or [None])[0]
    if not portfolio:
        raise HTTPException(status_code=404, detail="No portfolio found.")

    pos_res = (
        supabase.table("portfolio_positions")
        .select("symbol,weight,weight_pct,value,current_price,last_price")
        .eq("portfolio_id", portfolio["id"])
        .execute()
    )
    positions = _normalize_position_weights(list(pos_res.data or []))
    if not positions:
        raise HTTPException(status_code=404, detail="No portfolio positions found.")
    region_context = detect_region([str(p.get("symbol") or "") for p in positions])

    quant_result = await analyze_financial_modes(
        portfolio["id"],
        positions,
        selected_modes,
    )

    latest_swarm = (
        supabase.table("swarm_reports")
        .select(
            "id,created_at,regime,alpha_signal,recommendation_summary,"
            "risk_sentinel,quant_analysis"
        )
        .eq("user_id", str(user.id))
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    swarm_row = (latest_swarm.data or [None])[0] or {}

    raw_alpha = swarm_row.get("alpha_signal")
    alpha_payload = _parse_alpha_payload(raw_alpha)
    alpha_opps = _parse_alpha_opportunities(raw_alpha)
    if not alpha_opps:
        alpha_opps = [
            {
                "symbol": "PORTFOLIO",
                "confidence": 0.68,
                "reason": "Broad portfolio alpha quality from quant model signal layer.",
            }
        ]

    risk_metrics = quant_result.get("risk_adjusted_metrics") or {}
    vol_proxy = float(risk_metrics.get("volatility_annualized_proxy") or 0.18)
    dd_proxy = float(risk_metrics.get("max_drawdown_proxy") or 0.14)
    alpha_score = float(quant_result.get("alpha_score") or 50.0)
    sea_region = is_sea_region(region_context)
    regime_alignment_score = _regime_alignment_score(
        quant_result,
        alpha_payload,
        region_context,
    )

    return {
        "portfolio": {
            "id": portfolio["id"],
            "name": portfolio.get("name") or "Portfolio",
            "total_value": float(portfolio.get("total_value") or 0),
        },
        "modes": selected_modes,
        "quant_model": quant_result,
        "charts": {
            "factor_decomposition": _factor_decomposition(quant_result),
            "monte_carlo_paths": _monte_carlo_paths(
                portfolio["id"],
                alpha_score,
                vol_proxy,
                n_paths=24,
                horizon_days=60,
            ),
            "var_cvar": _var_surface(vol_proxy, dd_proxy),
            "correlation_network": _correlation_network(positions, quant_result),
            "alpha_feed": [
                {
                    "symbol": str(o.get("symbol") or "").upper() or "UNKNOWN",
                    "confidence": (
                        round(float(o.get("confidence") or 0) * 100, 1)
                        if float(o.get("confidence") or 0) <= 1.0
                        else round(float(o.get("confidence") or 0), 1)
                    ),
                    "reason": str(o.get("reason") or "No rationale available."),
                }
                for o in alpha_opps[:12]
                if isinstance(o, dict)
            ],
        },
        "context": {
            "regime": swarm_row.get("regime") or quant_result.get("regime_context", {}),
            "recommendation_summary": swarm_row.get("recommendation_summary") or "",
            "generated_at": datetime.now(UTC).isoformat(),
            "region_context": region_context,
            "sea_alpha": sea_region,
            "alpha_framework": (
                alpha_payload.get("sector_rotation_framework")
                or (
                    "VN30 sector rotation"
                    if region_context.get("primary_market") == "VN"
                    else "ASEAN factor tilt" if sea_region else "S&P sector rotation"
                )
            ),
            "regime_alignment_score": regime_alignment_score,
            "vn_specific_alpha_signals": alpha_payload.get("vn_specific_alpha_signals")
            or [],
        },
    }


@router.get("/global-map")
async def get_global_macro_map(days: int = Query(30, ge=7, le=180)):
    """
    Region-level macro map for frontend choropleth overlays.
    Color dimensions: sentiment, volatility, and current regime.
    """
    from datetime import timedelta

    cutoff = (datetime.now(UTC) - timedelta(days=days)).isoformat()
    rows: list[dict[str, Any]] = []
    try:
        res = (
            supabase.table("macro_signals")
            .select(
                "region,signal_type,change_pct,significance,signal_date,title,value"
            )
            .gte("signal_date", cutoff)
            .order("signal_date", desc=True)
            .limit(600)
            .execute()
        )
        rows = list(res.data or [])
    except Exception as exc:
        logger.warning("research.global_map_fetch_failed", error=str(exc))

    regime = get_current_regime_summary() or {}
    current_regime = str(regime.get("regime") or "neutral")

    by_region: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        r = str(row.get("region") or "GLOBAL").upper().strip()
        by_region[r].append(row)

    points: list[dict[str, Any]] = []
    for region, items in by_region.items():
        if not items:
            continue
        sentiment_score = 0.0
        volatility_score = 0.0
        weight_total = 0.0
        latest = items[0]
        for it in items:
            sig = str(it.get("significance") or "medium").lower()
            w = (
                1.6
                if sig == "critical"
                else 1.2 if sig == "high" else 0.8 if sig == "medium" else 0.4
            )
            c = float(it.get("change_pct") or 0.0)
            st = str(it.get("signal_type") or "").lower()
            sentiment_score += c * w
            if st in ("volatility", "yield_curve", "interest_rate"):
                volatility_score += abs(c) * w
            weight_total += w

        if weight_total > 0:
            sentiment_score = sentiment_score / weight_total
            volatility_score = volatility_score / weight_total

        points.append(
            {
                "region": region,
                "sentiment": round(sentiment_score, 3),
                "volatility": round(volatility_score, 3),
                "regime": current_regime,
                "latest_signal": {
                    "title": latest.get("title"),
                    "signal_type": latest.get("signal_type"),
                    "value": latest.get("value"),
                    "date": latest.get("signal_date"),
                },
            }
        )

    points.sort(key=lambda p: p["region"])
    return {
        "regime": current_regime,
        "regions": points,
        "generated_at": datetime.now(UTC).isoformat(),
    }


@router.get("/regime-heatmap")
async def get_regime_heatmap(days: int = Query(60, ge=14, le=365)):
    """
    Time x region heatmap payload for regime state intensity.
    """
    from datetime import timedelta

    cutoff = (datetime.now(UTC) - timedelta(days=days)).isoformat()
    rows: list[dict[str, Any]] = []
    try:
        res = (
            supabase.table("macro_signals")
            .select("region,signal_type,significance,change_pct,signal_date")
            .gte("signal_date", cutoff)
            .order("signal_date", asc=True)
            .limit(1600)
            .execute()
        )
        rows = list(res.data or [])
    except Exception as exc:
        logger.warning("research.regime_heatmap_fetch_failed", error=str(exc))

    regime = get_current_regime_summary() or {}
    regime_label = str(regime.get("regime") or "neutral")

    buckets: dict[tuple[str, str], list[float]] = defaultdict(list)
    for row in rows:
        dt = str(row.get("signal_date") or "")[:10]
        region = str(row.get("region") or "GLOBAL").upper().strip()
        if not dt:
            continue
        sig = str(row.get("significance") or "medium").lower()
        sig_weight = (
            1.8
            if sig == "critical"
            else 1.3 if sig == "high" else 1.0 if sig == "medium" else 0.6
        )
        delta = abs(float(row.get("change_pct") or 0.0))
        buckets[(dt, region)].append(delta * sig_weight)

    points: list[dict[str, Any]] = []
    for (dt, region), vals in buckets.items():
        intensity = sum(vals) / len(vals) if vals else 0.0
        if intensity >= 8:
            regime_state = "risk_off"
        elif intensity >= 4:
            regime_state = "transition"
        elif intensity > 0:
            regime_state = "risk_on"
        else:
            regime_state = "neutral"
        points.append(
            {
                "time": dt,
                "region": region,
                "regime_state": regime_state,
                "intensity": round(intensity, 3),
                "global_regime": regime_label,
            }
        )

    points.sort(key=lambda x: (x["time"], x["region"]))
    regions = sorted({p["region"] for p in points})
    timeline = sorted({p["time"] for p in points})
    return {
        "regime": regime_label,
        "regions": regions,
        "timeline": timeline,
        "cells": points,
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
    page: str | None = Query("1"),
    limit: str | None = Query("10"),
    type: str | None = Query(None, alias="type"),
):
    """
    Public SEO feed of research notes for blog pages.
    Query params:
      - page
      - limit
      - type=MACRO_OUTLOOK|REGIME_CHANGE|SECTOR_ANALYSIS|BEHAVIORAL
    """
    page_num = _coerce_pagination(page, default=1, minimum=1, maximum=10_000)
    limit_num = _coerce_pagination(limit, default=10, minimum=1, maximum=50)
    offset = (page_num - 1) * limit_num

    def _build_query(include_slug: bool):
        select_fields = (
            "id,slug,title,executive_summary,note_type,confidence_score,generated_at,affected_tickers,asset_tickers,full_content,content,body"
            if include_slug
            else "id,title,executive_summary,note_type,confidence_score,generated_at,affected_tickers,asset_tickers,full_content,content,body"
        )
        q = (
            supabase.table("research_notes")
            .select(select_fields)
            .eq("is_public", True)
            .order("generated_at", desc=True)
            .range(offset, offset + limit_num - 1)
        )
        if type:
            q = q.eq("note_type", type.lower())
        return q

    try:
        result = _build_query(include_slug=True).execute()
        rows = result.data or []
    except Exception as exc:
        message = str(exc).lower()
        if "slug" in message and "does not exist" in message:
            logger.warning("research.list_blog_slug_missing_fallback", error=str(exc))
            try:
                result = _build_query(include_slug=False).execute()
                rows = result.data or []
            except Exception as fallback_exc:
                logger.warning("research.list_blog_failed", error=str(fallback_exc))
                rows = []
        else:
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
        content = _dict_to_markdown(content)
    elif isinstance(content, str):
        # Content might be a JSON-encoded dict stored as a string
        stripped = content.strip()
        if stripped.startswith("{") and stripped.endswith("}"):
            try:
                parsed = json.loads(stripped)
                if isinstance(parsed, dict):
                    content = _dict_to_markdown(parsed)
            except (json.JSONDecodeError, ValueError):
                pass
    else:
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

    ds = note.get("data_sources")
    if isinstance(ds, str):
        try:
            ds = json.loads(ds)
        except (json.JSONDecodeError, TypeError):
            ds = []
    macro_signal_count = len(ds) if isinstance(ds, list) else 0

    return {
        "id": note.get("id"),
        "slug": note_slug,
        "title": title,
        "executive_summary": summary,
        "content": content,
        "note_type": note.get("note_type"),
        "regime": note.get("regime"),
        "confidence_score": note.get("confidence_score"),
        "created_at": note.get("generated_at"),
        "read_time_minutes": estimate_read_time_minutes(summary, content),
        "asset_tickers": [str(t).upper() for t in tickers if isinstance(t, str)],
        "meta_description": (summary[:160] if summary else title[:160]),
        "related_notes": related,
        "macro_signal_count": macro_signal_count,
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
