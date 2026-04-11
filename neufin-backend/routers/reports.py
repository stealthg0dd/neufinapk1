# RUN IN SUPABASE SQL EDITOR (see services/analytics.py for actual column names):
#
# CREATE TABLE IF NOT EXISTS analytics_events (
#   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
#   event_name TEXT NOT NULL,
#   user_id UUID,
#   session_id TEXT,
#   properties JSONB DEFAULT '{}',
#   created_at TIMESTAMPTZ DEFAULT NOW()
# );
# CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON analytics_events(user_id);
# CREATE INDEX IF NOT EXISTS idx_analytics_events_name ON analytics_events(event_name);

import base64
import datetime
import traceback
import uuid

import stripe
import structlog
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse, Response
from pydantic import BaseModel

from config import APP_BASE_URL, STRIPE_PRICE_ADVISOR_REPORT_ONETIME, STRIPE_SECRET_KEY
from database import supabase
from services.auth_dependency import (
    get_current_user,
    get_subscription_status,
    require_active_subscription,
)
from services.calculator import calculate_portfolio_metrics
from services.jwt_auth import JWTUser
from services.pdf_generator import generate_advisor_report

router = APIRouter(prefix="/api/reports", tags=["reports"])

logger = structlog.get_logger("neufin.reports")
stripe.api_key = STRIPE_SECRET_KEY


async def can_download_report_free(user_id: str) -> bool:
    """
    Free report downloads:
      - Active 14-day trial (treated as Advisor tier)
      - Paid Advisor/Enterprise subscription_status == active (subscription_tier set by webhook)
    """
    sub = get_subscription_status(user_id)
    if sub.get("status") == "trial":
        return True
    if sub.get("status") == "active":
        tier = str(sub.get("tier") or "").lower()
        return tier in ("advisor", "enterprise")
    return False


class ColorScheme(BaseModel):
    primary: str = "#0B0F14"
    secondary: str = "#161D2E"
    accent: str = "#1EB8CC"


class ReportRequest(BaseModel):
    portfolio_id: str
    advisor_id: str | None = None  # "self" or omitted → resolved to user.id in handler
    advisor_name: str = "NeuFin Intelligence"
    logo_base64: str | None = None
    color_scheme: ColorScheme | None = None
    client_name: str = "Confidential"
    firm_name: str = ""
    advisor_logo_url: str | None = None
    advisor_email: str = "info@neufin.ai"
    white_label: bool = False
    theme: str = "dark"  # "dark" (default) | "light" (white background, print-friendly)
    inline_pdf: bool = False


def _positions_from_dna_row(dna: dict | None) -> list[dict]:
    """Best-effort rows for calculator when portfolio_positions is empty."""
    if not dna:
        return []
    syms = dna.get("symbols") or dna.get("tickers")
    wts = dna.get("weights")
    if (
        isinstance(syms, list)
        and isinstance(wts, list)
        and len(syms) == len(wts)
        and len(syms) > 0
    ):
        out = []
        for i in range(len(syms)):
            s, w = syms[i], wts[i]
            try:
                wf = float(w)
            except (TypeError, ValueError):
                wf = 0.0
            out.append({"symbol": str(s).upper(), "shares": 1.0, "weight": wf})
        return out
    return []


def _normalize_positions(positions: list) -> list:
    """
    Ensures weight_pct sums to ~100. Handles CSVs where
    weight_pct was populated with share counts.
    Also ensures value is populated for each position.
    """
    if not positions:
        return positions

    def _px(p: dict) -> float:
        return float(p.get("price") or p.get("current_price") or 0)

    # Compute total_value from position values
    total_value = sum(float(p.get("value") or 0) for p in positions)

    # If no values, try shares * price
    if total_value <= 0:
        total_value = sum(
            float(p.get("shares") or 0) * _px(p)
            for p in positions
        )

    # Check if weights look like percentages already
    weight_sum = sum(
        float(p.get("weight_pct") or p.get("weight") or 0)
        for p in positions
    )

    needs_normalization = weight_sum > 110 or weight_sum < 50

    for p in positions:
        # Always ensure value is set
        if not p.get("value") or float(p.get("value") or 0) == 0:
            shares = float(p.get("shares") or 0)
            price = _px(p)
            if shares > 0 and price > 0:
                p["value"] = round(shares * price, 2)

        # Normalize weight if needed
        if needs_normalization and total_value > 0:
            pos_value = float(p.get("value") or 0)
            p["weight_pct"] = round(pos_value / total_value * 100, 4)
            p["weight"] = p["weight_pct"]

    # If equal weight needed (no value data at all)
    if needs_normalization and total_value <= 0:
        equal_w = round(100 / len(positions), 4)
        for p in positions:
            p["weight_pct"] = equal_w
            p["weight"] = equal_w

    return positions


def _synthesis_payload(dna: dict | None, metrics: dict, swarm_row: dict | None) -> dict:
    """Client-facing summary from DNA + metrics + swarm (no LLM)."""
    s = swarm_row if isinstance(swarm_row, dict) else {}
    return {
        "dna_score": (dna or {}).get("dna_score", 0),
        "investor_type": (dna or {}).get("investor_type", ""),
        "strengths": list((dna or {}).get("strengths") or []),
        "weaknesses": list((dna or {}).get("weaknesses") or []),
        "recommendation": (dna or {}).get("recommendation", ""),
        "headline": s.get("headline", ""),
        "briefing": s.get("briefing", ""),
        "regime": s.get("regime") or s.get("market_regime", ""),
        "investment_thesis": s.get("investment_thesis", ""),
        "quant_analysis": s.get("quant_analysis", ""),
        "risk_sentinel": s.get("risk_sentinel", ""),
        "alpha_signal": s.get("alpha_signal", ""),
        "recommendation_summary": s.get("recommendation_summary", ""),
        "tax_recommendation": s.get("tax_recommendation", ""),
        "macro_advice": s.get("macro_advice", ""),
        "top_risks": s.get("top_risks") or [],
        "agent_trace": s.get("agent_trace") or [],
        "metrics": metrics,
    }


def _upload_to_storage(pdf_bytes: bytes, filename: str) -> str | None:
    """Upload PDF to Supabase Storage 'advisor-reports' bucket.
    Returns a 1-hour signed URL (falls back to public URL if signing fails)."""
    try:
        path = f"{datetime.datetime.utcnow().strftime('%Y/%m/%d')}/{filename}"
        supabase.storage.from_("advisor-reports").upload(
            path=path,
            file=pdf_bytes,
            file_options={"content-type": "application/pdf"},
        )
        # Prefer a signed URL so the bucket can remain private
        try:
            signed = supabase.storage.from_("advisor-reports").create_signed_url(
                path, 3600
            )
            url = signed.get("signedURL") or signed.get("signedUrl")
            if url:
                return url
        except Exception:  # noqa: S110 — fall through to public URL
            pass
    except Exception as e:
        logger.warning("reports.storage_upload_failed", error=str(e))
        return None


def _load_report_for_advisor(report_id: str, user: JWTUser) -> dict:
    try:
        record = (
            supabase.table("advisor_reports")
            .select("id, advisor_id, pdf_url, is_paid, created_at, portfolio_id")
            .eq("id", report_id)
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Report not found.") from None

    data = record.data
    if not data or data.get("advisor_id") != user.id:
        raise HTTPException(status_code=404, detail="Report not found.")

    return data


@router.post("/generate")
async def generate_report(
    body: ReportRequest, user: JWTUser = Depends(get_current_user)
):
    """
    Generate a 10-page IC PDF from portfolio metrics, DNA scores, and latest swarm output.
    No extra LLM calls — formatting and synthesis only.

    Set ``inline_pdf: true`` to receive ``Response(content=pdf_bytes, media_type="application/pdf")``
    instead of JSON (optional ``X-Report-Id``, ``X-PDF-URL`` headers when available).
    """
    # Resolve advisor_id — "self" and None both map to the authenticated user.
    effective_advisor_id = (
        body.advisor_id
        if body.advisor_id and body.advisor_id not in ("self", "")
        else str(user.id)
    )
    logger.info(
        "report_generate_called",
        portfolio_id=body.portfolio_id,
        user_id=str(user.id),
        effective_advisor_id=effective_advisor_id,
    )
    try:
        # Gate: trial/paid advisor/enterprise generate directly; otherwise return checkout URL
        if not await can_download_report_free(user.id):
            if not STRIPE_PRICE_ADVISOR_REPORT_ONETIME:
                raise HTTPException(
                    503, "Stripe single-report price is not configured."
                )
            try:
                session = stripe.checkout.Session.create(
                    line_items=[
                        {"price": STRIPE_PRICE_ADVISOR_REPORT_ONETIME, "quantity": 1}
                    ],
                    mode="payment",
                    success_url=f"{APP_BASE_URL}/pricing/success",
                    cancel_url=f"{APP_BASE_URL}/pricing",
                    metadata={
                        "plan": "single",
                        "portfolio_id": body.portfolio_id,
                        "advisor_id": user.id,
                        "user_id": user.id,
                    },
                )
                return {"checkout_url": session.url}
            except stripe.StripeError as e:
                raise HTTPException(502, f"Stripe error: {e.user_message}") from e

        try:
            portfolio_result = (
                supabase.table("portfolios")
                .select("id, user_id, name, total_value")
                .eq("id", body.portfolio_id)
                .single()
                .execute()
            )
            portfolio = portfolio_result.data
            if not portfolio:
                raise HTTPException(status_code=404, detail="Portfolio not found.")
            if portfolio.get("user_id") and portfolio.get("user_id") != user.id:
                raise HTTPException(
                    status_code=403, detail="You do not have access to this portfolio."
                )

            dna_result = (
                supabase.table("dna_scores")
                .select("*")
                .eq("portfolio_id", body.portfolio_id)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            existing_dna = dna_result.data[0] if dna_result.data else None

            positions_result = (
                supabase.table("portfolio_positions")
                .select("symbol, shares, value, weight_pct, current_price")
                .eq("portfolio_id", body.portfolio_id)
                .execute()
            )

            # Try portfolio-specific swarm first (session_id = portfolio_id)
            _swarm_cols = (
                "id,user_id,created_at,headline,briefing,regime,"
                "risk_sentinel,investment_thesis,market_regime,"
                "quant_analysis,alpha_signal,recommendation_summary,"
                "tax_recommendation,macro_advice,top_risks,agent_trace,"
                "dna_score,weighted_beta,sharpe_ratio,sentiment_score,"
                "key_risks,alpha_outlook,technical_outlook,tax_report,session_id"
            )
            swarm_result = (
                supabase.table("swarm_reports")
                .select(_swarm_cols)
                .eq("user_id", str(user.id))
                .eq("session_id", body.portfolio_id)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            swarm_row = swarm_result.data[0] if swarm_result.data else None

            # Fallback: most recent swarm for this user (any portfolio)
            if not swarm_row:
                fallback = (
                    supabase.table("swarm_reports")
                    .select(_swarm_cols)
                    .eq("user_id", str(user.id))
                    .order("created_at", desc=True)
                    .limit(1)
                    .execute()
                )
                swarm_row = fallback.data[0] if fallback.data else None
                if swarm_row:
                    logger.warning(
                        "reports.swarm_portfolio_mismatch",
                        portfolio_id=body.portfolio_id,
                        swarm_session_id=swarm_row.get("session_id"),
                    )

            profile_result = (
                supabase.table("user_profiles")
                .select(
                    "full_name, email, avatar_url, subscription_tier,"
                    "firm_name, firm_logo_url, advisor_name, advisor_email,"
                    "white_label_enabled, brand_primary_color"
                )
                .eq("id", str(user.id))
                .limit(1)
                .execute()
            )
            profile = (profile_result.data or [None])[0] or {}

            # Merge advisors row (white-label source of truth)
            try:
                adv_r = (
                    supabase.table("advisors")
                    .select("firm_name,advisor_name,logo_base64,white_label,brand_color")
                    .eq("id", str(user.id))
                    .limit(1)
                    .execute()
                )
                if adv_r.data:
                    ar = adv_r.data[0]
                    if ar.get("firm_name"):
                        profile["firm_name"] = profile.get("firm_name") or ar["firm_name"]
                    if ar.get("advisor_name"):
                        profile["advisor_name"] = profile.get("advisor_name") or ar["advisor_name"]
                    if ar.get("logo_base64"):
                        profile["advisor_logo_base64"] = ar["logo_base64"]
                    if ar.get("brand_color"):
                        profile["brand_primary_color"] = (
                            profile.get("brand_primary_color") or ar["brand_color"]
                        )
                    if ar.get("white_label") is not None:
                        profile["white_label_enabled"] = bool(ar.get("white_label")) or bool(
                            profile.get("white_label_enabled")
                        )
            except Exception:
                pass
        except HTTPException:
            raise
        except Exception as e:
            tb = traceback.format_exc()
            logger.error(
                "reports.db_fetch_failed",
                error=str(e),
                traceback=tb,
                portfolio_id=getattr(body, "portfolio_id", "unknown"),
                user_id=str(user.id) if user else "unknown",
            )
            raise HTTPException(
                status_code=500, detail=f"Data fetch failed: {e!s}"
            ) from e

        positions_raw = list(positions_result.data or [])
        if not positions_raw:
            positions_raw = _positions_from_dna_row(existing_dna)
        positions_raw = _normalize_positions(positions_raw)

        if not positions_raw:
            raise HTTPException(
                status_code=404,
                detail="No positions found for this portfolio.",
            )

        # FIX 3: parse alpha_signal before PDF generator (structured list + clean text)
        if swarm_row:
            import json as _json

            alpha_raw = swarm_row.get("alpha_signal")
            parsed_opps: list = []

            if isinstance(alpha_raw, str) and alpha_raw.strip():
                try:
                    parsed = _json.loads(alpha_raw)
                    parsed_opps = (
                        parsed.get("opportunities")
                        or parsed.get("alpha_opportunities", {}).get("opportunities")
                        or []
                    )
                except Exception:
                    parsed_opps = []
            elif isinstance(alpha_raw, dict):
                parsed_opps = (
                    alpha_raw.get("opportunities")
                    or alpha_raw.get("alpha_opportunities", {}).get("opportunities")
                    or []
                )
            elif isinstance(alpha_raw, list):
                parsed_opps = alpha_raw

            if parsed_opps:
                swarm_row["alpha_signal_parsed"] = parsed_opps
                lines = []
                for o in parsed_opps[:5]:
                    if not isinstance(o, dict):
                        continue
                    sym = o.get("symbol", "")
                    try:
                        c0 = float(o.get("confidence", 0) or 0)
                    except (TypeError, ValueError):
                        c0 = 0.0
                    conf_i = int(c0 * 100) if c0 <= 1 else int(c0)
                    reason = str(o.get("reason", ""))[:200]
                    lines.append(f"{sym}: Confidence {conf_i}% — {reason}")
                swarm_row["alpha_signal"] = "\n\n".join(lines)
            else:
                swarm_row["alpha_signal_parsed"] = []

        try:
            metrics = calculate_portfolio_metrics(positions_raw)
        except Exception as e:
            tb = traceback.format_exc()
            logger.error(
                "reports.metrics_calc_failed",
                error=str(e),
                traceback=tb,
                num_positions=len(positions_raw),
                portfolio_id=getattr(body, "portfolio_id", "unknown"),
            )
            raise HTTPException(
                status_code=422, detail=f"Metrics calculation failed: {e!s}"
            ) from e

        run_id = uuid.uuid4().hex[:8]
        brand = body.color_scheme.model_dump() if body.color_scheme else None

        # White-label: request body fields take priority; fall back to saved profile config
        profile_wl_enabled = bool(profile.get("white_label_enabled"))
        effective_white_label = body.white_label or profile_wl_enabled
        effective_firm_name = (
            body.firm_name
            or profile.get("firm_name")
            or profile.get("full_name")
            or ""
        )
        effective_advisor_name = (
            body.advisor_name
            if body.advisor_name != "NeuFin Intelligence"  # not the default
            else (profile.get("advisor_name") or body.advisor_name)
        )
        effective_logo_url = (
            body.advisor_logo_url
            or profile.get("firm_logo_url")
            or profile.get("avatar_url")
        )
        effective_email = (
            body.advisor_email
            if body.advisor_email != "info@neufin.ai"  # not the default
            else (profile.get("advisor_email") or profile.get("email") or "info@neufin.ai")
        )

        advisor_config = {
            "firm_name": effective_firm_name,
            "logo_url": effective_logo_url,
            "logo_base64": body.logo_base64 or profile.get("advisor_logo_base64"),
            "brand_colors": brand or (
                {"primary": profile.get("brand_primary_color")} if profile.get("brand_primary_color") else None
            ),
            "advisor_name": effective_advisor_name,
            "client_name": body.client_name,
            "advisor_email": effective_email,
            "white_label": effective_white_label,
            "report_run_id": run_id,
        }

        # FIX 5: single source of truth for total_value across all PDF sections
        total_value_final = float(
            portfolio.get("total_value")
            or metrics.get("total_value")
            or sum(float(p.get("value") or 0) for p in positions_raw)
            or 0
        )

        portfolio_payload = {
            "name": portfolio.get("name") or "Portfolio Analysis",
            "total_value": total_value_final,
            "metrics": {**metrics, "total_value": total_value_final},
            # Raw positions with cost_basis — used by _build_report_context to
            # synthesize tax estimates when DNA tax_analysis is not available.
            "positions_with_basis": positions_raw,
        }

        pdf_bytes = await generate_advisor_report(
            portfolio_payload,
            existing_dna or {},
            swarm_row,
            advisor_config,
            theme=body.theme,
        )

        filename = f"report-{body.portfolio_id[:8]}-{uuid.uuid4().hex[:6]}.pdf"
        pdf_url = _upload_to_storage(pdf_bytes, filename)

        try:
            report_result = (
                supabase.table("advisor_reports")
                .insert(
                    {
                        "portfolio_id": body.portfolio_id,
                        "advisor_id": effective_advisor_id,
                        "pdf_url": pdf_url,
                        "is_paid": False,
                    }
                )
                .execute()
            )
            report_id = report_result.data[0]["id"] if report_result.data else None
        except Exception as e:
            logger.warning("reports.save_record_failed", error=str(e))
            report_id = None

        analysis = _synthesis_payload(existing_dna, metrics, swarm_row)

        if body.inline_pdf:
            headers = {
                "Content-Disposition": f'inline; filename="{filename}"',
            }
            if report_id:
                headers["X-Report-Id"] = str(report_id)
            if pdf_url:
                headers["X-PDF-URL"] = pdf_url
            return Response(
                content=pdf_bytes,
                media_type="application/pdf",
                headers=headers,
            )

        out: dict = {
            "report_id": report_id,
            "pdf_size_bytes": len(pdf_bytes),
            "analysis": analysis,
            "pages": 10,
        }
        if pdf_url:
            out["pdf_url"] = pdf_url
            out["delivery"] = "url"
        else:
            out["pdf_base64"] = base64.b64encode(pdf_bytes).decode("ascii")
            out["delivery"] = "base64"
            out["filename"] = filename
        return out

    except HTTPException as http_exc:
        if http_exc.status_code >= 500:
            logger.error(
                "reports.5xx_http_exception",
                status_code=http_exc.status_code,
                detail=str(http_exc.detail),
                portfolio_id=getattr(body, "portfolio_id", "unknown"),
                user_id=str(user.id) if user else "unknown",
            )
        raise
    except Exception as e:
        tb = traceback.format_exc()
        logger.error(
            "report_generation_failed",
            error=str(e),
            traceback=tb,
            portfolio_id=getattr(body, "portfolio_id", "unknown"),
            user_id=str(user.id) if user else "unknown",
        )
        raise HTTPException(
            status_code=500,
            detail=f"Report generation failed: {e!s}",
        ) from e


@router.get("/{report_id}/download")
async def download_report(
    report_id: str, user: JWTUser = Depends(require_active_subscription)
):
    """Redirect to the Supabase Storage public URL for this report."""
    record = _load_report_for_advisor(report_id, user)
    pdf_url = record.get("pdf_url")
    if not pdf_url:
        raise HTTPException(
            status_code=404, detail="PDF not yet available for this report."
        )

    return RedirectResponse(url=pdf_url)


@router.get("/advisor/{advisor_id}")
async def get_advisor_reports(
    advisor_id: str, user: JWTUser = Depends(get_current_user)
):
    """List all reports generated by an advisor, including public PDF URLs."""
    if advisor_id != user.id:
        raise HTTPException(
            status_code=403, detail="You do not have access to these reports."
        )

    try:
        result = (
            supabase.table("advisor_reports")
            .select("id, portfolio_id, pdf_url, is_paid, created_at")
            .eq("advisor_id", user.id)
            .order("created_at", desc=True)
            .execute()
        )
        return {"reports": result.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
