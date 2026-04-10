"""
Stripe Payment Integration
--------------------------
Free tier  : DNA Score (always free, no auth required)
$29 once   : Single Advisor Report PDF download
$99/mo     : Unlimited reports subscription (advisor tier)

Endpoints
---------
POST /api/reports/checkout  → Create Stripe Checkout session
POST /api/stripe/webhook    → Stripe event handler
GET  /api/reports/fulfill   → After payment, generate PDF and return URL
"""

import asyncio
import datetime

import sentry_sdk
import stripe
import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel

from config import (
    APP_BASE_URL,
    STRIPE_PRICE_ADVISOR_MONTHLY,
    STRIPE_PRICE_SINGLE,
    STRIPE_PRICE_UNLIMITED,
    STRIPE_REFERRAL_COUPON_ID,
    STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET,
)
from database import supabase
from services.ai_router import get_ai_analysis
from services.analytics import track
from services.auth_dependency import get_optional_user, invalidate_subscription_cache
from services.calculator import calculate_portfolio_metrics
from services.jwt_auth import JWTUser
from services.pdf_generator import generate_advisor_report
from services.slack import notify_alerts

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["payments"])

stripe.api_key = STRIPE_SECRET_KEY


# ── Request models ─────────────────────────────────────────────────────────────


class CheckoutRequest(BaseModel):
    plan: str  # "single" | "unlimited"
    positions: list[dict] | None = None  # anonymous flow: pass positions directly
    portfolio_id: str | None = None  # authenticated flow: existing portfolio
    advisor_id: str = "anonymous"
    ref_token: str | None = None  # referral token → apply 20% coupon
    success_url: str = f"{APP_BASE_URL}/results?checkout_success=1"
    cancel_url: str = f"{APP_BASE_URL}/results"


# ── Helpers ────────────────────────────────────────────────────────────────────


def _upload_pdf(pdf_bytes: bytes, report_id: str) -> str | None:
    filename = (
        f"{datetime.datetime.utcnow().strftime('%Y/%m/%d')}/report-{report_id[:8]}.pdf"
    )
    try:
        supabase.storage.from_("advisor-reports").upload(
            path=filename,
            file=pdf_bytes,
            file_options={"content-type": "application/pdf"},
        )
        return supabase.storage.from_("advisor-reports").get_public_url(filename)
    except Exception as e:
        logger.warning("storage.upload_failed", error=str(e))
        return None


async def _generate_and_store_pdf(portfolio_id: str, report_id: str) -> str | None:
    """Run full PDF generation pipeline and update the advisor_reports record."""
    try:
        positions_result = (
            supabase.table("portfolio_positions")
            .select("symbol, shares")
            .eq("portfolio_id", portfolio_id)
            .execute()
        )
        if not positions_result.data:
            return None

        metrics = calculate_portfolio_metrics(positions_result.data)

        prompt = f"""You are a senior portfolio strategist.
Portfolio metrics: {metrics}
Return ONLY valid JSON:
{{
  "dna_score": <0-100>,
  "investor_type": "<Diversified Strategist | Conviction Growth | Momentum Trader | Defensive Allocator | Speculative Investor>",
  "strengths": ["s1","s2","s3"],
  "weaknesses": ["w1","w2"],
  "recommendation": "<actionable recommendation>",
  "risk_assessment": "<2-sentence risk overview>",
  "market_outlook": "<2-sentence market positioning>",
  "action_items": ["a1","a2","a3"]
}}"""

        analysis = await get_ai_analysis(prompt)
        pdf_bytes = generate_advisor_report({"metrics": metrics}, analysis)
        pdf_url = _upload_pdf(pdf_bytes, report_id)

        if pdf_url:
            supabase.table("advisor_reports").update({"pdf_url": pdf_url}).eq(
                "id", report_id
            ).execute()

        return pdf_url
    except Exception as e:
        logger.warning("pdf.generation_failed", report_id=report_id, error=str(e))
        return None


def _ensure_portfolio_access(portfolio_id: str, user: JWTUser) -> None:
    try:
        portfolio_result = (
            supabase.table("portfolios")
            .select("id, user_id")
            .eq("id", portfolio_id)
            .single()
            .execute()
        )
    except Exception as exc:
        raise HTTPException(404, f"Portfolio not found: {exc}") from exc

    portfolio = portfolio_result.data
    if not portfolio:
        raise HTTPException(404, "Portfolio not found.")

    if portfolio.get("user_id") and portfolio.get("user_id") != user.id:
        raise HTTPException(403, "You do not have access to this portfolio.")


# ── Endpoints ──────────────────────────────────────────────────────────────────


@router.post("/api/reports/checkout")
async def create_checkout(
    body: CheckoutRequest, user: JWTUser | None = Depends(get_optional_user)
):
    """
    Create a Stripe Checkout session.
    Returns { checkout_url, report_id } for the frontend to redirect.
    """
    if not STRIPE_SECRET_KEY:
        raise HTTPException(503, "Stripe is not configured on this server.")

    plan = body.plan
    if plan not in ("single", "unlimited"):
        raise HTTPException(400, "plan must be 'single' or 'unlimited'")

    # Advisor monthly plan should use STRIPE_PRICE_ADVISOR_MONTHLY (Railway env).
    # Keep STRIPE_PRICE_UNLIMITED as backwards-compatible fallback.
    if plan == "single":
        price_id = STRIPE_PRICE_SINGLE
    else:
        price_id = STRIPE_PRICE_ADVISOR_MONTHLY or STRIPE_PRICE_UNLIMITED
    if not price_id:
        raise HTTPException(
            503, f"Stripe price ID for plan '{plan}' is not configured."
        )

    effective_advisor_id = "anonymous"
    if user:
        effective_advisor_id = user.id
    elif body.advisor_id != "anonymous":
        raise HTTPException(401, "Authentication required for advisor checkout.")

    portfolio_id = body.portfolio_id
    report_id = None

    # ── For single-report plan: ensure we have a portfolio + pending report ───
    if plan == "single":
        if portfolio_id and user:
            _ensure_portfolio_access(portfolio_id, user)

        # If no portfolio_id but positions provided, create a temp portfolio
        if not portfolio_id and body.positions:
            try:
                metrics = calculate_portfolio_metrics(body.positions)
                port_result = (
                    supabase.table("portfolios")
                    .insert(
                        {
                            "user_id": user.id if user else None,
                            "name": f"Report Portfolio {datetime.datetime.utcnow().strftime('%Y-%m-%d')}",
                            "total_value": metrics["total_value"],
                        }
                    )
                    .execute()
                )
                portfolio_id = port_result.data[0]["id"]

                for pos in metrics["positions"]:
                    supabase.table("portfolio_positions").insert(
                        {
                            "portfolio_id": portfolio_id,
                            "symbol": pos["symbol"],
                            "shares": pos["shares"],
                        }
                    ).execute()
            except Exception as e:
                raise HTTPException(422, f"Could not create portfolio: {e}") from e

        if not portfolio_id:
            raise HTTPException(
                400, "portfolio_id or positions required for single report plan"
            )

        # Create pending advisor_report record
        try:
            report_result = (
                supabase.table("advisor_reports")
                .insert(
                    {
                        "portfolio_id": portfolio_id,
                        "advisor_id": (
                            None
                            if effective_advisor_id == "anonymous"
                            else effective_advisor_id
                        ),
                        "is_paid": False,
                    }
                )
                .execute()
            )
            report_id = report_result.data[0]["id"]
        except Exception as e:
            raise HTTPException(500, f"Could not create report record: {e}") from e

    # ── Validate referral token → apply 20% Stripe coupon ─────────────────────
    discounts = []
    if body.ref_token and STRIPE_REFERRAL_COUPON_ID:
        try:
            ref_check = (
                supabase.table("dna_scores")
                .select("share_token")
                .eq("share_token", body.ref_token)
                .limit(1)
                .execute()
            )
            if ref_check.data:
                discounts = [{"coupon": STRIPE_REFERRAL_COUPON_ID}]
        except Exception:
            logger.warning("Referral token validation failed", exc_info=True)

    # ── Create Stripe Checkout session ────────────────────────────────────────
    try:
        session_params: dict = {
            "line_items": [{"price": price_id, "quantity": 1}],
            "mode": "payment" if plan == "single" else "subscription",
            "success_url": body.success_url + "&session_id={CHECKOUT_SESSION_ID}",
            "cancel_url": body.cancel_url,
            "metadata": {
                "plan": plan,
                "portfolio_id": portfolio_id or "",
                "report_id": report_id or "",
                "advisor_id": effective_advisor_id,
                "ref_token": body.ref_token or "",
            },
            "allow_promotion_codes": not bool(
                discounts
            ),  # no promo codes if coupon applied
        }
        if discounts:
            session_params["discounts"] = discounts

        # FIXED: run blocking Stripe call in a thread to avoid holding the event loop (502 timeout fix)
        session = await asyncio.to_thread(
            lambda: stripe.checkout.Session.create(**session_params)
        )
    except stripe.StripeError as e:
        raise HTTPException(502, f"Stripe error: {e.user_message}") from e

    # Funnel event: checkout initiated
    await track(
        "checkout_initiated",
        {
            "plan": plan,
            "has_referral": bool(discounts),
            "ref_token": body.ref_token or "",
        },
    )

    # Log referral use
    if discounts and body.ref_token:
        await track("referral_used", {"ref_token": body.ref_token, "plan": plan})

    return {
        "checkout_url": session.url,
        "session_id": session.id,
        "report_id": report_id,
        "referral_discount": bool(discounts),
    }


@router.post("/api/stripe/webhook")
async def stripe_webhook(request: Request, background_tasks: BackgroundTasks):
    """
    Stripe webhook handler.

    Security:
      - Validates stripe-signature header before processing any event.
      - Rejects replays with CRITICAL alert on signature failure.
      - Idempotency: each Stripe event_id is processed at most once via
        the stripe_processed_events Supabase table.

    Handles: checkout.session.completed
      - single plan  → marks report as paid, queues PDF generation in background
      - unlimited    → upgrades user subscription_tier to 'pro'
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, STRIPE_WEBHOOK_SECRET
        )
    except stripe.SignatureVerificationError as e:
        # CRITICAL: potential replay attack or misconfigured webhook secret
        msg = (
            f":rotating_light: *CRITICAL — Stripe webhook signature validation FAILED*\n"
            f"Path: `{request.url.path}`  IP: `{request.client.host if request.client else 'unknown'}`\n"
            f"Error: `{e}`"
        )
        sentry_sdk.capture_exception(
            e,
            extras={
                "severity": "critical",
                "ip": request.client.host if request.client else "unknown",
            },
        )
        await notify_alerts(msg)
        logger.critical("stripe.webhook_signature_invalid", error=str(e))
        raise HTTPException(400, "Invalid Stripe signature") from e
    except Exception as e:
        raise HTTPException(400, f"Webhook error: {e}") from e

    # ── Idempotency: skip already-processed events ─────────────────────────────
    event_id = event["id"]
    try:
        existing = (
            supabase.table("stripe_processed_events")
            .select("event_id")
            .eq("event_id", event_id)
            .limit(1)
            .execute()
        )
        if existing.data:
            logger.info(
                "stripe.webhook_duplicate_skipped",
                event_id=event_id,
                event_type=event["type"],
            )
            return {"status": "ok"}
        supabase.table("stripe_processed_events").insert(
            {"event_id": event_id, "event_type": event["type"]}
        ).execute()
    except Exception as e:
        logger.warning("stripe.idempotency_check_failed", error=str(e))
        # Fail open: proceed even if idempotency table is unavailable

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        meta = session.get("metadata", {})
        plan = meta.get("plan")
        # Funnel event: payment confirmed
        await track(
            "payment_completed",
            {
                "plan": plan,
                "amount_total": session.get("amount_total"),
                "ref_token": meta.get("ref_token", ""),
            },
        )
        report_id = meta.get("report_id") or None
        portfolio_id = meta.get("portfolio_id") or None
        advisor_id = meta.get("advisor_id")
        stripe_customer_id = session.get("customer")

        if plan == "single" and report_id:
            # Mark paid synchronously — fast DB call
            supabase.table("advisor_reports").update({"is_paid": True}).eq(
                "id", report_id
            ).execute()
            # Queue PDF generation as background task so we return 200 to Stripe
            # immediately — PDF generation can take 3-30 seconds.
            if portfolio_id:
                background_tasks.add_task(
                    _generate_and_store_pdf, portfolio_id, report_id
                )

        elif plan == "unlimited" and advisor_id and advisor_id != "anonymous":
            # Upgrade subscription status and store Stripe customer ID
            try:
                supabase.table("user_profiles").update(
                    {
                        "subscription_tier": "advisor",
                        "subscription_status": "active",
                        "stripe_customer_id": stripe_customer_id,
                        "trial_started_at": None,
                    }
                ).eq("id", advisor_id).execute()
                # Immediately invalidate cached subscription status for this user
                invalidate_subscription_cache(advisor_id)
            except Exception as e:
                sentry_sdk.set_tag("stripe_event_type", "subscription_upgrade")
                sentry_sdk.capture_exception(e)

    elif event["type"] == "customer.subscription.deleted":
        # Downgrade if subscription cancelled
        sub = event["data"]["object"]
        customer_id = sub.get("customer")
        try:
            customer = await asyncio.to_thread(
                lambda: stripe.Customer.retrieve(customer_id)
            )
            advisor_id = customer.get("metadata", {}).get("advisor_id")
            if advisor_id:
                supabase.table("user_profiles").update(
                    {
                        "subscription_status": "expired",
                    }
                ).eq("id", advisor_id).execute()
                invalidate_subscription_cache(advisor_id)
        except Exception as e:
            sentry_sdk.set_tag("stripe_event_type", "subscription_deleted")
            sentry_sdk.capture_exception(e)

    return {"status": "ok"}


@router.get("/api/reports/fulfill")
async def fulfill_report(
    report_id: str, user: JWTUser | None = Depends(get_optional_user)
):
    """
    Called from the frontend success page.
    If the report is paid but has no PDF yet, generates it now.
    Returns { pdf_url } or triggers generation.
    """
    try:
        result = (
            supabase.table("advisor_reports")
            .select("id, portfolio_id, advisor_id, is_paid, pdf_url")
            .eq("id", report_id)
            .single()
            .execute()
        )
    except Exception as e:
        raise HTTPException(404, "Report not found.") from e
    record = result.data
    if not record:
        raise HTTPException(404, "Report not found.")
    if record.get("advisor_id"):
        if not user:
            raise HTTPException(401, "Authentication required for this report.")
        if record.get("advisor_id") != user.id:
            raise HTTPException(404, "Report not found.")
    if not record["is_paid"]:
        raise HTTPException(
            402, "Payment not yet confirmed. Please wait a moment and retry."
        )

    # Already has PDF
    if record.get("pdf_url"):
        return {"pdf_url": record["pdf_url"], "ready": True}

    # Generate now
    pdf_url = await _generate_and_store_pdf(record["portfolio_id"], report_id)
    if not pdf_url:
        raise HTTPException(500, "PDF generation failed. Please contact support.")

    return {"pdf_url": pdf_url, "ready": True}


@router.get("/api/payments/plans")
async def get_plans():
    """Return available plan details (for the pricing UI)."""
    return {
        "plans": [
            {
                "id": "free",
                "name": "DNA Score",
                "price": 0,
                "currency": "usd",
                "interval": None,
                "description": "Behavioral investor profile, strengths, weaknesses, recommendation",
                "features": [
                    "Investor DNA Score (0-100)",
                    "Investor type classification",
                    "3 key strengths",
                    "2 risk areas",
                    "Shareable card",
                ],
            },
            {
                "id": "single",
                "name": "Advisor Report",
                "price": 2900,
                "currency": "usd",
                "interval": "one_time",
                "description": "Full 10-page professional PDF report",
                "features": [
                    "Everything in Free",
                    "10-page PDF report",
                    "AI risk assessment",
                    "Sector allocation analysis",
                    "Market outlook",
                    "Action plan",
                    "White-label branding",
                ],
            },
            {
                "id": "unlimited",
                "name": "Pro Advisor",
                "price": 9900,
                "currency": "usd",
                "interval": "month",
                "description": "Unlimited reports for advisor teams",
                "features": [
                    "Everything in Single Report",
                    "Unlimited reports/month",
                    "Custom logo & colours",
                    "Priority AI (Claude primary)",
                    "API access",
                    "Client dashboard",
                ],
            },
        ]
    }
