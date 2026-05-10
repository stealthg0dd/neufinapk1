"""
Meeting prep agent — structured metrics → Claude JSON brief (no raw holdings).
Persists prep on client_meetings and draft email on client_communications.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

import structlog

from database import supabase
from services.ai_router import get_ai_analysis
from services.research.regime_detector import get_current_regime_summary

logger = structlog.get_logger(__name__)

# Canonical advisor actions (merged with model output in section D).
ACTION_REGISTRY: list[dict[str, str]] = [
    {
        "id": "document_risk_ack",
        "title": "Document client acknowledgement of elevated behavioral risk",
        "share_count": "Full book snapshot",
        "timeline": "Within 5 business days of meeting",
    },
    {
        "id": "staged_trim",
        "title": "Execute staged trim of top concentration vs policy sleeve max",
        "share_count": "8-15% of overweight name(s)",
        "timeline": "2-4 weeks, staged limits",
    },
    {
        "id": "ic_memo_refresh",
        "title": "Refresh IC readiness memo after material DNA / regime shift",
        "share_count": "1 updated memo",
        "timeline": "10 business days",
    },
]


def _parse_date(d: str) -> datetime:
    raw = (d or "").strip()[:10]
    return datetime.strptime(raw, "%Y-%m-%d").replace(tzinfo=UTC)


def _assert_client(advisor_id: str, client_id: str) -> dict[str, Any]:
    res = (
        supabase.table("advisor_clients")
        .select("*")
        .eq("id", client_id)
        .eq("advisor_id", advisor_id)
        .single()
        .execute()
    )
    row = res.data
    if not row:
        raise ValueError("Client not found.")
    return row


def _primary_client_portfolio_id(advisor_id: str, client_id: str) -> str | None:
    r = (
        supabase.table("client_portfolios")
        .select("id")
        .eq("advisor_id", advisor_id)
        .eq("client_id", client_id)
        .order("created_at", desc=False)
        .limit(1)
        .execute()
    )
    if not r.data:
        return None
    return str(r.data[0]["id"])


def _normalize_weights(positions: Any) -> dict[str, float]:
    """Extract symbol -> weight (0-100) from common snapshot shapes (metrics only)."""
    out: dict[str, float] = {}
    if not positions:
        return out
    rows: list[Any]
    if isinstance(positions, list):
        rows = positions
    elif isinstance(positions, dict) and isinstance(positions.get("positions"), list):
        rows = positions["positions"]
    else:
        return out
    for p in rows:
        if not isinstance(p, dict):
            continue
        sym = str(p.get("symbol") or p.get("ticker") or "").strip().upper()
        if not sym:
            continue
        w = p.get("weight")
        if w is None:
            w = p.get("weight_pct")
        try:
            wt = float(w)
        except (TypeError, ValueError):
            continue
        if wt <= 1.0:
            wt *= 100.0
        out[sym] = max(out.get(sym, 0.0), wt)
    return out


def _top_weight_moves(
    prev_weights: dict[str, float], curr_weights: dict[str, float]
) -> list[dict[str, Any]]:
    symbols = set(prev_weights) | set(curr_weights)
    deltas: list[tuple[str, float]] = []
    for s in symbols:
        d = curr_weights.get(s, 0.0) - prev_weights.get(s, 0.0)
        if abs(d) >= 0.25:
            deltas.append((s, d))
    deltas.sort(key=lambda x: abs(x[1]), reverse=True)
    return [
        {
            "symbol": sym,
            "delta_pct": round(d, 2),
            "current_pct": round(curr_weights.get(sym, 0.0), 2),
        }
        for sym, d in deltas[:6]
    ]


def _load_snapshots_for_prep(
    advisor_id: str, client_portfolio_id: str | None
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Return (portfolio_snapshots newest first, dna_snapshots newest first)."""
    ps: list[dict[str, Any]] = []
    ds: list[dict[str, Any]] = []
    if not client_portfolio_id:
        return ps, ds
    try:
        pr = (
            supabase.table("portfolio_snapshots")
            .select("id, positions, metrics, as_of, total_value")
            .eq("advisor_id", advisor_id)
            .eq("client_portfolio_id", client_portfolio_id)
            .order("as_of", desc=True)
            .limit(5)
            .execute()
        )
        ps = list(pr.data or [])
    except Exception as exc:
        logger.warning("meeting_prep.portfolio_snapshots_failed", error=str(exc))
    try:
        dr = (
            supabase.table("dna_score_snapshots")
            .select("id, dna_score, detail, investor_type, created_at")
            .eq("advisor_id", advisor_id)
            .eq("client_portfolio_id", client_portfolio_id)
            .order("created_at", desc=True)
            .limit(5)
            .execute()
        )
        ds = list(dr.data or [])
    except Exception as exc:
        logger.warning("meeting_prep.dna_snapshots_failed", error=str(exc))
    return ps, ds


def _bias_tags(detail: Any) -> list[str]:
    if not isinstance(detail, dict):
        return []
    tags: list[str] = []
    for k in ("top_bias", "bias_flag", "top_flag", "primary_bias", "flags"):
        v = detail.get(k)
        if isinstance(v, list):
            tags.extend(str(x) for x in v if x)
        elif v:
            tags.append(str(v))
    return list(dict.fromkeys(tags))


def _churn_from_severity(sev: str | None) -> str:
    s = (sev or "").lower()
    if s in {"critical", "high"}:
        return "HIGH"
    if s == "medium":
        return "MEDIUM"
    return "LOW"


def build_metrics_bundle(
    advisor_id: str,
    client_id: str,
    meeting_date: str,
    advisor_notes: str | None,
) -> dict[str, Any]:
    """Structured, privacy-safe inputs for the model (no raw position rows)."""
    client = _assert_client(advisor_id, client_id)
    cp_id = _primary_client_portfolio_id(advisor_id, client_id)
    ps, dna_snaps = _load_snapshots_for_prep(advisor_id, cp_id)

    curr_w: dict[str, float] = {}
    prev_w: dict[str, float] = {}
    if len(ps) >= 1:
        curr_w = _normalize_weights(ps[0].get("positions"))
    if len(ps) >= 2:
        prev_w = _normalize_weights(ps[1].get("positions"))
    weight_moves = _top_weight_moves(prev_w, curr_w)

    dna_curr = dna_snaps[0] if dna_snaps else None
    dna_prev = dna_snaps[1] if len(dna_snaps) > 1 else None
    dna_score_new = (
        int(dna_curr["dna_score"])
        if dna_curr and dna_curr.get("dna_score") is not None
        else None
    )
    dna_score_old = (
        int(dna_prev["dna_score"])
        if dna_prev and dna_prev.get("dna_score") is not None
        else None
    )
    dna_delta = (
        (dna_score_new - dna_score_old)
        if dna_score_new is not None and dna_score_old is not None
        else None
    )

    biases_new = _bias_tags((dna_curr or {}).get("detail"))
    biases_old = _bias_tags((dna_prev or {}).get("detail")) if dna_prev else []
    new_biases = [b for b in biases_new if b not in biases_old]

    meta = client.get("metadata") or {}
    if not isinstance(meta, dict):
        meta = {}
    last_review = meta.get("last_review_at")

    alerts = (
        supabase.table("behavioral_alerts")
        .select("id, severity, title, created_at, payload")
        .eq("advisor_id", advisor_id)
        .eq("client_id", client_id)
        .order("created_at", desc=True)
        .limit(12)
        .execute()
    ).data or []
    churn_new = (
        _churn_from_severity(str(alerts[0].get("severity"))) if alerts else "LOW"
    )
    churn_old = (
        _churn_from_severity(str(alerts[1].get("severity")))
        if len(alerts) > 1
        else "LOW"
    )

    regime = get_current_regime_summary()

    return {
        "client_display_name": str(client.get("display_name") or "Client"),
        "risk_profile": str(meta.get("risk_profile") or "unspecified"),
        "meeting_date": meeting_date,
        "advisor_context_notes": (advisor_notes or "").strip()[:4000],
        "last_review_at": last_review,
        "dna": {
            "score_new": dna_score_new,
            "score_old": dna_score_old,
            "score_delta": dna_delta,
            "as_of_new": (dna_curr or {}).get("created_at"),
            "as_of_old": (dna_prev or {}).get("created_at"),
            "investor_type": (dna_curr or {}).get("investor_type"),
        },
        "churn": {"current": churn_new, "previous": churn_old},
        "new_bias_flags": new_biases[:8],
        "all_bias_flags_current": biases_new[:12],
        "largest_weight_changes_pct": weight_moves,
        "snapshot_as_of": (ps[0] or {}).get("as_of") if ps else None,
        "regime": {
            "label": regime.get("regime"),
            "confidence": regime.get("confidence"),
        },
        "recent_alerts_summary": [
            {
                "title": str(a.get("title") or ""),
                "severity": str(a.get("severity") or ""),
                "created_at": str(a.get("created_at") or ""),
            }
            for a in alerts[:8]
        ],
        "action_registry": ACTION_REGISTRY,
    }


def _meeting_scheduled_at(meeting_date: str) -> str:
    dt = _parse_date(meeting_date)
    return dt.replace(hour=14, minute=0, second=0, microsecond=0).isoformat()


async def generate_meeting_prep_brief(
    advisor_id: str,
    client_id: str,
    meeting_date: str,
    notes: str | None,
) -> dict[str, Any]:
    try:
        _parse_date(meeting_date)
    except Exception as exc:
        raise ValueError("Invalid meeting_date; use YYYY-MM-DD.") from exc

    metrics = build_metrics_bundle(advisor_id, client_id, meeting_date, notes)
    prompt = f"""You are a senior wealth advisor writing a concise, compliant meeting prep brief.
Use ONLY the JSON metrics below. Do not invent ticker-level detail unless it appears in largest_weight_changes_pct.
Return ONLY valid JSON (no markdown) with this shape:
{{
  "section_b": {{
    "flags": [
      {{"title": "short label", "explanation": "plain language for advisor, 1-2 sentences"}}
    ]
  }},
  "section_c": {{
    "talking_points": ["3-5 strings"]
  }},
  "section_d": {{
    "actions": [
      {{"registry_id": "document_risk_ack|staged_trim|ic_memo_refresh", "rationale": "one sentence"}}
    ]
  }},
  "section_e": {{
    "risk_tier_change": "one sentence (use HIGH/MEDIUM/LOW if unknown say 'under review')",
    "suitability_line": "one sentence with placeholders [client] [date]",
    "ic_readiness": "LOW|MEDIUM|HIGH — one word tier plus 4 words max"
  }},
  "section_f": {{
    "subject": "email subject",
    "body": "3-6 sentence follow-up email draft, professional tone"
  }}
}}
Metrics:
{json.dumps(metrics, default=str)}
"""
    try:
        ai_part = await get_ai_analysis(prompt, response_format="json")
    except Exception as exc:
        logger.warning("meeting_prep.ai_failed", error=str(exc))
        ai_part = {}
    if not isinstance(ai_part, dict):
        ai_part = {}

    section_a = {
        "dna_score": {
            "old": metrics["dna"]["score_old"],
            "new": metrics["dna"]["score_new"],
            "delta": metrics["dna"]["score_delta"],
        },
        "churn_risk": {
            "old": metrics["churn"]["previous"],
            "new": metrics["churn"]["current"],
        },
        "new_bias_flags_since_last_review": metrics["new_bias_flags"],
        "largest_position_changes": metrics["largest_weight_changes_pct"],
        "regime": metrics["regime"],
    }

    flags = (ai_part.get("section_b") or {}).get("flags") or []
    talking = (ai_part.get("section_c") or {}).get("talking_points") or []
    model_actions = (ai_part.get("section_d") or {}).get("actions") or []
    merged_actions: list[dict[str, Any]] = []
    reg_by_id = {a["id"]: a for a in ACTION_REGISTRY}
    for a in model_actions[:3]:
        if not isinstance(a, dict):
            continue
        rid = str(a.get("registry_id") or "")
        base = reg_by_id.get(rid)
        if base:
            merged_actions.append(
                {
                    **base,
                    "rationale": str(a.get("rationale") or ""),
                }
            )
        else:
            merged_actions.append(
                {
                    "id": rid or "custom",
                    "title": str(a.get("title") or "Follow-up action"),
                    "share_count": str(a.get("share_count") or "—"),
                    "timeline": str(a.get("timeline") or "TBD"),
                    "rationale": str(a.get("rationale") or ""),
                }
            )
    for reg in ACTION_REGISTRY:
        if len(merged_actions) >= 3:
            break
        if any(x.get("id") == reg["id"] for x in merged_actions):
            continue
        merged_actions.append(dict(reg))

    section_e = ai_part.get("section_e") or {}
    section_f = ai_part.get("section_f") or {}

    brief = {
        "generated_at": datetime.now(UTC).isoformat(),
        "section_a": section_a,
        "section_b": {"flags": flags[:3]},
        "section_c": {"talking_points": talking[:8]},
        "section_d": {"actions": merged_actions[:3]},
        "section_e": section_e,
        "section_f": section_f,
        "metrics_bundle": metrics,
    }

    scheduled_iso = _meeting_scheduled_at(meeting_date)
    meeting_row = {
        "advisor_id": advisor_id,
        "client_id": client_id,
        "title": f"Prep — {metrics['client_display_name']}",
        "scheduled_at": scheduled_iso,
        "notes": (notes or "").strip() or None,
        "meeting_type": "review",
        "prep_brief_json": brief,
        "prep_status": "draft",
    }
    ins = supabase.table("client_meetings").insert(meeting_row).execute()
    meeting_id = str((ins.data or [{}])[0].get("id") or "")

    draft_subject = str(section_f.get("subject") or "Follow-up after our meeting")
    draft_body = str(section_f.get("body") or "")
    comm_ins = (
        supabase.table("client_communications")
        .insert(
            {
                "advisor_id": advisor_id,
                "client_id": client_id,
                "channel": "email",
                "subject": draft_subject,
                "body": draft_body,
                "metadata": {
                    "status": "draft",
                    "kind": "meeting_prep",
                    "meeting_id": meeting_id,
                },
                "occurred_at": datetime.now(UTC).isoformat(),
            }
        )
        .execute()
    )
    comm_id = str((comm_ins.data or [{}])[0].get("id") or "")

    return {
        "meeting_id": meeting_id,
        "draft_communication_id": comm_id,
        "client_id": client_id,
        "meeting_date": meeting_date,
        **brief,
    }


def patch_meeting_prep(
    advisor_id: str,
    meeting_id: str,
    prep_status: str | None = None,
    prep_brief_json: dict[str, Any] | None = None,
) -> dict[str, Any]:
    allowed = {"draft", "saved", "used"}
    if prep_status is not None and prep_status not in allowed:
        raise ValueError("Invalid prep_status.")
    updates: dict[str, Any] = {}
    if prep_status is not None:
        updates["prep_status"] = prep_status
    if prep_brief_json is not None:
        updates["prep_brief_json"] = prep_brief_json
    if not updates:
        raise ValueError("No updates provided.")
    res = (
        supabase.table("client_meetings")
        .update(updates)
        .eq("id", meeting_id)
        .eq("advisor_id", advisor_id)
        .execute()
    )
    row = (res.data or [None])[0]
    if not row:
        raise ValueError("Meeting not found.")
    return row
