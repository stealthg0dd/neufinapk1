"""
Advisor daily brief engine — regime, DNA snapshots, behavioral alerts, meetings.
Powers GET /api/advisor/brief (cached) and the morning-brief dashboard payload.
"""

from __future__ import annotations

import json
import time
from datetime import UTC, datetime, timedelta
from typing import Any

import structlog

from core.config import settings
from database import supabase
from services.jwt_auth import JWTUser
from services.research.regime_detector import get_current_regime_summary

logger = structlog.get_logger(__name__)

_BRIEF_MEMORY: dict[str, tuple[float, dict[str, Any]]] = {}
_BRIEF_TTL_SEC = 1800
_REDIS_KEY_PREFIX = "neufin:advisor_brief:"


def get_current_regime() -> dict[str, Any]:
    """Current macro regime summary (DB-backed)."""
    row = get_current_regime_summary()
    return dict(row) if isinstance(row, dict) else {}


def attention_score(client: dict[str, Any]) -> float:
    """Higher = needs more attention (triage ranking)."""
    score = 0.0
    churn = str(client.get("churn_risk_level") or "").upper()
    if churn == "HIGH":
        score += 40.0
    elif churn == "MEDIUM":
        score += 20.0

    sd = client.get("score_delta")
    if isinstance(sd, int | float):
        if sd < -5:
            score += 30.0
        elif sd < -2:
            score += 15.0

    days = client.get("days_since_review")
    if isinstance(days, int | float) and days > 90:
        score += 20.0

    return score


def generate_regime_impact_summary(
    regime: dict[str, Any], ranked_clients: list[dict[str, Any]]
) -> dict[str, Any]:
    label = str(regime.get("regime") or "neutral").lower()
    high_churn = sum(
        1
        for c in ranked_clients
        if str(c.get("churn_risk_level") or "").upper() == "HIGH"
    )
    risk_off = any(
        x in label
        for x in (
            "risk_off",
            "risk-off",
            "recession",
            "stagflation",
            "crisis",
        )
    )
    primary_risk = (
        "High-beta and concentrated sleeves may be vulnerable in a defensive regime."
        if risk_off
        else "Monitor concentration and factor exposures versus the current regime."
    )
    suggested_tilt = (
        "Consider rotating 8-12% into defensives and quality until macro stabilizes."
        if risk_off
        else "Keep factor tilts modest until regime conviction rises."
    )
    misaligned = high_churn
    if misaligned == 0:
        misaligned = sum(
            1
            for c in ranked_clients[:40]
            if str(c.get("churn_risk_level") or "").upper() in {"HIGH", "MEDIUM"}
        )
    return {
        "misaligned_portfolios": misaligned,
        "primary_risk": primary_risk,
        "suggested_tilt": suggested_tilt,
        "regime_label": regime.get("regime"),
    }


def _fetch_clients_rpc(advisor_id: str) -> list[dict[str, Any]]:
    res = supabase.rpc(
        "get_advisor_clients_with_latest_scores",
        {"p_advisor_id": advisor_id},
    ).execute()
    rows = list(res.data or [])
    out: list[dict[str, Any]] = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        out.append({str(k): v for k, v in r.items()})
    return out


def _fallback_clients_with_scores(advisor_id: str) -> list[dict[str, Any]]:
    """Python fallback if RPC is missing or errors (e.g. migration not applied)."""
    try:
        ac_res = (
            supabase.table("advisor_clients")
            .select("id, display_name, metadata")
            .eq("advisor_id", advisor_id)
            .execute()
        )
        clients = list(ac_res.data or [])
    except Exception as exc:
        logger.warning("advisor_brief.fallback_clients_failed", error=str(exc))
        return []

    cp_res = (
        supabase.table("client_portfolios")
        .select("id, client_id, created_at")
        .eq("advisor_id", advisor_id)
        .execute()
    )
    cps = sorted(cp_res.data or [], key=lambda x: str(x.get("created_at") or ""))
    first_cp: dict[str, str] = {}
    for cp in cps:
        cid = str(cp.get("client_id") or "")
        cpid = str(cp.get("id") or "")
        if cid and cpid and cid not in first_cp:
            first_cp[cid] = cpid

    cp_ids = list(first_cp.values())
    snaps_by_cp: dict[str, list[dict[str, Any]]] = {x: [] for x in cp_ids}
    if cp_ids:
        try:
            snap_res = (
                supabase.table("dna_score_snapshots")
                .select("client_portfolio_id, dna_score, created_at")
                .in_("client_portfolio_id", cp_ids)
                .order("created_at", desc=False)
                .limit(2000)
                .execute()
            )
            for s in snap_res.data or []:
                k = str(s.get("client_portfolio_id") or "")
                if k in snaps_by_cp:
                    snaps_by_cp[k].append(s)
        except Exception as exc:
            logger.warning("advisor_brief.fallback_snapshots_failed", error=str(exc))

    alert_by_client: dict[str, dict[str, Any]] = {}
    try:
        ar = (
            supabase.table("behavioral_alerts")
            .select("*")
            .eq("advisor_id", advisor_id)
            .order("created_at", desc=True)
            .limit(500)
            .execute()
        )
        for a in ar.data or []:
            cid = str(a.get("client_id") or "")
            if cid and cid not in alert_by_client:
                alert_by_client[cid] = a
    except Exception as exc:
        logger.warning("advisor_brief.fallback_alerts_failed", error=str(exc))

    def _churn_from_alert(a: dict[str, Any] | None) -> str:
        if not a:
            return "LOW"
        s = str(a.get("severity") or "").lower()
        if s in {"critical", "high"}:
            return "HIGH"
        if s == "medium":
            return "MEDIUM"
        return "LOW"

    out: list[dict[str, Any]] = []
    for cl in clients:
        cid = str(cl["id"])
        cpid = first_cp.get(cid)
        snaps = sorted(
            snaps_by_cp.get(cpid or "", []),
            key=lambda x: str(x.get("created_at") or ""),
        )
        latest = snaps[-1] if snaps else None
        prev = snaps[-2] if len(snaps) >= 2 else None
        dna = (
            int(latest["dna_score"])
            if latest and latest.get("dna_score") is not None
            else None
        )
        delta: int | None = None
        if (
            latest
            and prev
            and latest.get("dna_score") is not None
            and prev.get("dna_score") is not None
        ):
            delta = int(latest["dna_score"]) - int(prev["dna_score"])
        score_date = latest.get("created_at") if latest else None
        meta = cl.get("metadata") or {}
        if not isinstance(meta, dict):
            meta = {}
        lr = meta.get("last_review_at")
        days_since: int | None = None
        try:
            if lr:
                lr_dt = datetime.fromisoformat(str(lr).replace("Z", "+00:00"))
                days_since = int((datetime.now(UTC) - lr_dt).total_seconds() // 86400)
            elif score_date:
                sd_dt = datetime.fromisoformat(str(score_date).replace("Z", "+00:00"))
                days_since = int((datetime.now(UTC) - sd_dt).total_seconds() // 86400)
        except Exception:
            days_since = None

        out.append(
            {
                "id": cid,
                "client_name": cl.get("display_name") or f"Client {cid[:8]}",
                "risk_profile": str(meta.get("risk_profile") or ""),
                "client_portfolio_id": cpid,
                "dna_score": dna,
                "churn_risk_level": _churn_from_alert(alert_by_client.get(cid)),
                "score_date": score_date,
                "score_delta": delta,
                "days_since_review": days_since,
            }
        )
    return out


def load_clients_with_latest_scores(advisor_id: str) -> list[dict[str, Any]]:
    try:
        return _fetch_clients_rpc(advisor_id)
    except Exception as exc:
        logger.warning(
            "advisor_brief.rpc_fallback",
            advisor_id=advisor_id,
            error=str(exc),
        )
        return _fallback_clients_with_scores(advisor_id)


def generate_daily_brief(advisor_id: str) -> dict[str, Any]:
    """
    Personalized daily brief: regime, ranked clients, unread alerts, upcoming meetings.
    """
    now = datetime.now(UTC)
    regime = get_current_regime()

    clients_raw = load_clients_with_latest_scores(advisor_id)
    for c in clients_raw:
        c["attention_score"] = attention_score(c)

    ranked = sorted(
        clients_raw,
        key=lambda x: (float(x.get("attention_score") or 0), str(x.get("id") or "")),
        reverse=True,
    )

    regime_impact = generate_regime_impact_summary(regime, ranked)

    alerts_unread: list[dict[str, Any]] = []
    try:
        alerts_unread = (
            supabase.table("behavioral_alerts")
            .select("*")
            .eq("advisor_id", advisor_id)
            .is_("acknowledged_at", "null")
            .order("created_at", desc=True)
            .limit(10)
            .execute()
        ).data or []
    except Exception as exc:
        logger.warning("advisor_brief.unread_alerts_failed", error=str(exc))

    meetings: list[dict[str, Any]] = []
    try:
        end = now + timedelta(days=7)
        mt = (
            supabase.table("client_meetings")
            .select(
                "id, client_id, title, scheduled_at, duration_minutes, notes, advisor_clients(display_name)"
            )
            .eq("advisor_id", advisor_id)
            .gte("scheduled_at", now.isoformat())
            .lte("scheduled_at", end.isoformat())
            .order("scheduled_at", desc=False)
            .limit(10)
            .execute()
        )
        for m in mt.data or []:
            if not isinstance(m, dict):
                continue
            row = dict(m)
            nested = row.pop("advisor_clients", None)
            if isinstance(nested, dict):
                row["client_display_name"] = nested.get("display_name")
            meetings.append(row)
    except Exception as exc:
        logger.warning("advisor_brief.meetings_failed", error=str(exc))

    clients_high_risk = sum(
        1 for c in clients_raw if str(c.get("churn_risk_level") or "").upper() == "HIGH"
    )

    return {
        "generated_at": now.isoformat(),
        "regime": regime,
        "clients_with_scores": clients_raw,
        "ranked_clients": ranked,
        "top_clients": ranked[:5],
        "alerts_count": len(alerts_unread),
        "alerts": alerts_unread[:3],
        "upcoming_meetings": meetings,
        "regime_impact": regime_impact,
        "clients_total": len(clients_raw),
        "clients_high_risk": clients_high_risk,
    }


def _redis_get(key: str) -> dict[str, Any] | None:
    url = (settings.REDIS_URL or "").strip()
    if not url:
        return None
    try:
        import redis as redis_lib

        r = redis_lib.from_url(url, decode_responses=True, socket_connect_timeout=2)
        raw = r.get(key)
        if not raw:
            return None
        return json.loads(raw)
    except Exception as exc:
        logger.debug("advisor_brief.redis_get_failed", error=str(exc))
        return None


def _redis_set(key: str, payload: dict[str, Any]) -> None:
    url = (settings.REDIS_URL or "").strip()
    if not url:
        return
    try:
        import redis as redis_lib

        r = redis_lib.from_url(url, decode_responses=True, socket_connect_timeout=2)
        r.setex(key, _BRIEF_TTL_SEC, json.dumps(payload, default=str))
    except Exception as exc:
        logger.debug("advisor_brief.redis_set_failed", error=str(exc))


def get_daily_brief_cached(advisor_id: str) -> dict[str, Any]:
    """30-minute cache: Redis when configured, else in-process."""
    now = time.time()
    mem = _BRIEF_MEMORY.get(advisor_id)
    if mem and now - mem[0] < _BRIEF_TTL_SEC:
        return mem[1]

    rkey = f"{_REDIS_KEY_PREFIX}{advisor_id}"
    cached = _redis_get(rkey)
    if cached is not None:
        _BRIEF_MEMORY[advisor_id] = (now, cached)
        return cached

    fresh = generate_daily_brief(advisor_id)
    _BRIEF_MEMORY[advisor_id] = (now, fresh)
    _redis_set(rkey, fresh)
    return fresh


def _severity_to_churn(sev: str | None) -> str:
    s = (sev or "").lower()
    if s in {"critical", "high"}:
        return "HIGH"
    if s == "medium":
        return "MEDIUM"
    return "LOW"


def _payload_str(payload: Any, *keys: str) -> str | None:
    if not isinstance(payload, dict):
        return None
    for k in keys:
        v = payload.get(k)
        if v:
            return str(v)
    return None


def _detail_bias(detail: Any) -> str | None:
    if not isinstance(detail, dict):
        return None
    for key in ("top_bias", "bias_flag", "top_flag", "primary_bias"):
        v = detail.get(key)
        if v:
            return str(v)
    return None


def _resolve_primary_portfolio_id(client_id: str, advisor_id: str) -> str | None:
    try:
        r = (
            supabase.table("client_portfolios")
            .select("id, base_portfolio_id, created_at")
            .eq("client_id", client_id)
            .eq("advisor_id", advisor_id)
            .order("created_at", desc=False)
            .limit(25)
            .execute()
        )
        for row in r.data or []:
            bp = row.get("base_portfolio_id")
            if bp:
                return str(bp)
        return None
    except Exception:
        return None


def build_morning_brief_dashboard(user: JWTUser) -> dict[str, Any]:
    """
    Full payload for GET /api/advisor/morning-brief (cards + counts + meetings).
    Uses generate_daily_brief for regime, ranking, meetings, and regime_impact.
    """
    uid = user.id
    now = datetime.now(UTC)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    first_name: str | None = None
    if user.email:
        first_name = (user.email.split("@", 1)[0] or "there").strip() or None

    core = generate_daily_brief(uid)
    ranked = list(core.get("ranked_clients") or [])

    try:
        cp_res = (
            supabase.table("client_portfolios")
            .select("id")
            .eq("advisor_id", uid)
            .execute()
        )
        portfolios_monitored = len(cp_res.data or [])
    except Exception:
        portfolios_monitored = 0

    alerts_morning = 0
    try:
        ar = (
            supabase.table("behavioral_alerts")
            .select("id", count="exact")
            .eq("advisor_id", uid)
            .gte("created_at", day_start.isoformat())
            .execute()
        )
        alerts_morning = int(ar.count or 0)
    except Exception:
        try:
            fallback = (
                supabase.table("behavioral_alerts")
                .select("id")
                .eq("advisor_id", uid)
                .gte("created_at", day_start.isoformat())
                .execute()
            )
            alerts_morning = len(fallback.data or [])
        except Exception:
            alerts_morning = 0

    clients_due_review = 0
    cutoff = (now - timedelta(days=90)).isoformat()
    try:
        all_clients = (
            supabase.table("advisor_clients")
            .select("id, metadata")
            .eq("advisor_id", uid)
            .execute()
        )
        for row in all_clients.data or []:
            meta = row.get("metadata") or {}
            if not isinstance(meta, dict):
                meta = {}
            lr = meta.get("last_review_at")
            if not lr:
                clients_due_review += 1
            else:
                try:
                    lr_dt = datetime.fromisoformat(str(lr).replace("Z", "+00:00"))
                    if lr_dt.isoformat() < cutoff:
                        clients_due_review += 1
                except Exception:
                    clients_due_review += 1
    except Exception:
        clients_due_review = 0

    alerts_rows: list[dict[str, Any]] = []
    try:
        alerts_rows = (
            supabase.table("behavioral_alerts")
            .select("*")
            .eq("advisor_id", uid)
            .order("created_at", desc=True)
            .limit(200)
            .execute()
        ).data or []
    except Exception:
        alerts_rows = []

    cp_all = (
        supabase.table("client_portfolios")
        .select("id, client_id")
        .eq("advisor_id", uid)
        .execute()
    ).data or []
    cp_to_client = {
        str(x["id"]): str(x["client_id"]) for x in cp_all if x.get("client_id")
    }
    cp_ids = list(cp_to_client.keys())
    snaps_by_cp: dict[str, list[dict[str, Any]]] = {cid: [] for cid in cp_ids}
    if cp_ids:
        try:
            snap_res = (
                supabase.table("dna_score_snapshots")
                .select("client_portfolio_id, dna_score, detail, created_at")
                .in_("client_portfolio_id", cp_ids)
                .order("created_at", desc=True)
                .limit(800)
                .execute()
            )
            for s in snap_res.data or []:
                cid = str(s.get("client_portfolio_id") or "")
                if cid in snaps_by_cp:
                    snaps_by_cp[cid].append(s)
        except Exception as exc:
            logger.warning("advisor_brief.dashboard_snapshots_failed", error=str(exc))

    clients_by_id: dict[str, dict[str, Any]] = {}
    try:
        cr = (
            supabase.table("advisor_clients")
            .select("*")
            .eq("advisor_id", uid)
            .execute()
        )
        for c in cr.data or []:
            clients_by_id[str(c["id"])] = c
    except Exception as exc:
        logger.warning("advisor_brief.dashboard_clients_failed", error=str(exc))

    top_ids = [str(x.get("id")) for x in ranked[:5] if x.get("id")]
    top_clients: list[dict[str, Any]] = []
    for cid in top_ids:
        c = clients_by_id.get(cid, {})
        display = str(c.get("display_name") or f"Client {str(cid)[:8]}")
        engine_row = next((x for x in ranked if str(x.get("id")) == cid), {}) or {}
        cur_s = engine_row.get("dna_score")
        if cur_s is not None:
            try:
                cur_s = int(cur_s)
            except (TypeError, ValueError):
                cur_s = None
        delta = engine_row.get("score_delta")
        if delta is not None:
            try:
                delta = int(delta)
            except (TypeError, ValueError):
                delta = None

        latest_alert = next(
            (x for x in alerts_rows if str(x.get("client_id")) == cid),
            None,
        )
        churn = (
            _severity_to_churn(str(latest_alert.get("severity")))
            if latest_alert
            else str(engine_row.get("churn_risk_level") or "LOW")
        )
        payload = (latest_alert or {}).get("payload") or {}
        detail: dict[str, Any] = {}
        if latest_alert:
            any_snap: dict[str, Any] | None = None
            for cp_id, clid in cp_to_client.items():
                if clid == cid and snaps_by_cp.get(cp_id):
                    any_snap = snaps_by_cp[cp_id][0]
                    break
            raw_d = (any_snap or {}).get("detail") or {}
            detail = raw_d if isinstance(raw_d, dict) else {}
        top_bias = (
            _payload_str(payload, "top_bias", "bias_flag", "top_flag")
            or _detail_bias(detail)
            or "—"
        )
        risk_from = _payload_str(payload, "risk_from", "from_risk") or "—"
        risk_to = _payload_str(payload, "risk_to", "to_risk") or "—"
        reason = (
            (latest_alert or {}).get("body")
            or (latest_alert or {}).get("title")
            or "Review behavioral signals for this client."
        )
        next_action = (
            _payload_str(payload, "recommended_action", "next_action", "action")
            or "Review alerts and schedule touchpoint if material."
        )
        top_clients.append(
            {
                "client_id": cid,
                "display_name": display,
                "dna_score_current": cur_s,
                "dna_score_delta": delta,
                "churn_risk": churn,
                "top_bias": top_bias,
                "risk_from": risk_from,
                "risk_to": risk_to,
                "reason": reason,
                "recommended_action": next_action,
                "severity": (latest_alert or {}).get("severity"),
                "primary_portfolio_id": _resolve_primary_portfolio_id(cid, uid),
                "attention_score": engine_row.get("attention_score"),
            }
        )

    misaligned = int(core.get("regime_impact", {}).get("misaligned_portfolios") or 0)
    primary_risk = str(
        core.get("regime_impact", {}).get("primary_risk")
        or "Monitor concentration and factor exposures versus the current regime."
    )
    suggested_tilt = str(
        core.get("regime_impact", {}).get("suggested_tilt")
        or "Consider trimming momentum / high-beta sleeves when regime data shows risk-off."
    )

    upcoming_meetings: list[dict[str, Any]] = []
    for m in core.get("upcoming_meetings") or []:
        if not isinstance(m, dict):
            continue
        mcid = str(m.get("client_id") or "")
        display = (clients_by_id.get(mcid) or {}).get("display_name") or m.get(
            "client_display_name"
        )
        upcoming_meetings.append(
            {
                **m,
                "client_display_name": display or f"Client {mcid[:8]}",
                "prep_ready": bool((m.get("notes") or "").strip()),
            }
        )

    return {
        "greeting_name": first_name or "there",
        "generated_at": now.isoformat(),
        "portfolios_monitored": portfolios_monitored,
        "alerts_this_morning": alerts_morning,
        "clients_due_review_this_week": clients_due_review,
        "top_clients": top_clients,
        "upcoming_meetings": upcoming_meetings[:3],
        "regime_impact": {
            "misaligned_portfolios": misaligned,
            "primary_risk": primary_risk,
            "suggested_tilt": suggested_tilt,
        },
        "brief_engine": {
            "alerts_count": core.get("alerts_count"),
            "clients_total": core.get("clients_total"),
            "clients_high_risk": core.get("clients_high_risk"),
        },
    }
