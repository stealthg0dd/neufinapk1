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

import stripe
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from database import supabase
from services.calculator import calculate_portfolio_metrics
from services.pdf_generator import generate_advisor_report
from services.ai_router import get_ai_analysis
from services.analytics import track
from config import (
    STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
    STRIPE_PRICE_SINGLE, STRIPE_PRICE_UNLIMITED,
    STRIPE_REFERRAL_COUPON_ID,
    APP_BASE_URL,
)
import uuid
import datetime

router = APIRouter(tags=["payments"])

stripe.api_key = STRIPE_SECRET_KEY


# ── Request models ─────────────────────────────────────────────────────────────

class CheckoutRequest(BaseModel):
    plan: str                          # "single" | "unlimited"
    positions: Optional[list[dict]] = None  # anonymous flow: pass positions directly
    portfolio_id: Optional[str] = None     # authenticated flow: existing portfolio
    advisor_id: str = "anonymous"
    ref_token: Optional[str] = None        # referral token → apply 20% coupon
    success_url: str = f"{APP_BASE_URL}/results?checkout_success=1"
    cancel_url:  str = f"{APP_BASE_URL}/results"


# ── Helpers ────────────────────────────────────────────────────────────────────

def _upload_pdf(pdf_bytes: bytes, report_id: str) -> Optional[str]:
    filename = f"{datetime.datetime.utcnow().strftime('%Y/%m/%d')}/report-{report_id[:8]}.pdf"
    try:
        supabase.storage.from_("advisor-reports").upload(
            path=filename, file=pdf_bytes,
            file_options={"content-type": "application/pdf"},
        )
        return supabase.storage.from_("advisor-reports").get_public_url(filename)
    except Exception as e:
        print(f"[Storage] upload failed: {e}")
        return None


async def _generate_and_store_pdf(portfolio_id: str, report_id: str) -> Optional[str]:
    """Run full PDF generation pipeline and update the advisor_reports record."""
    try:
        positions_result = (
            supabase.table("portfolio_positions")
            .select("symbol, shares, cost_basis")
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
            supabase.table("advisor_reports").update({"pdf_url": pdf_url}).eq("id", report_id).execute()

        return pdf_url
    except Exception as e:
        print(f"[PDF] generation failed for report {report_id}: {e}")
        return None


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/api/reports/checkout")
async def create_checkout(body: CheckoutRequest):
    """
    Create a Stripe Checkout session.
    Returns { checkout_url, report_id } for the frontend to redirect.
    """
    if not STRIPE_SECRET_KEY:
        raise HTTPException(503, "Stripe is not configured on this server.")

    plan = body.plan
    if plan not in ("single", "unlimited"):
        raise HTTPException(400, "plan must be 'single' or 'unlimited'")

    price_id = STRIPE_PRICE_SINGLE if plan == "single" else STRIPE_PRICE_UNLIMITED
    if not price_id:
        raise HTTPException(503, f"Stripe price ID for plan '{plan}' is not configured.")

    portfolio_id = body.portfolio_id
    report_id    = None

    # ── For single-report plan: ensure we have a portfolio + pending report ───
    if plan == "single":
        # If no portfolio_id but positions provided, create a temp portfolio
        if not portfolio_id and body.positions:
            try:
                metrics = calculate_portfolio_metrics(body.positions)
                port_result = supabase.table("portfolios").insert({
                    "user_id":     body.advisor_id if body.advisor_id != "anonymous" else None,
                    "name":        f"Report Portfolio {datetime.datetime.utcnow().strftime('%Y-%m-%d')}",
                    "total_value": metrics["total_value"],
                }).execute()
                portfolio_id = port_result.data[0]["id"]

                for pos in metrics["positions"]:
                    supabase.table("portfolio_positions").insert({
                        "portfolio_id": portfolio_id,
                        "symbol":       pos["symbol"],
                        "shares":       pos["shares"],
                        "cost_basis":   pos.get("cost_basis"),
                    }).execute()
            except Exception as e:
                raise HTTPException(422, f"Could not create portfolio: {e}")

        if not portfolio_id:
            raise HTTPException(400, "portfolio_id or positions required for single report plan")

        # Create pending advisor_report record
        try:
            report_result = supabase.table("advisor_reports").insert({
                "portfolio_id": portfolio_id,
                "advisor_id":   body.advisor_id if body.advisor_id != "anonymous" else None,
                "is_paid":      False,
            }).execute()
            report_id = report_result.data[0]["id"]
        except Exception as e:
            raise HTTPException(500, f"Could not create report record: {e}")

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
            pass  # invalid ref — no coupon

    # ── Create Stripe Checkout session ────────────────────────────────────────
    try:
        session_params: dict = dict(
            line_items=[{"price": price_id, "quantity": 1}],
            mode="payment" if plan == "single" else "subscription",
            success_url=body.success_url + "&session_id={CHECKOUT_SESSION_ID}",
            cancel_url=body.cancel_url,
            metadata={
                "plan":         plan,
                "portfolio_id": portfolio_id or "",
                "report_id":    report_id or "",
                "advisor_id":   body.advisor_id,
                "ref_token":    body.ref_token or "",
            },
            allow_promotion_codes=not bool(discounts),  # no promo codes if coupon applied
        )
        if discounts:
            session_params["discounts"] = discounts

        session = stripe.checkout.Session.create(**session_params)
    except stripe.StripeError as e:
        raise HTTPException(502, f"Stripe error: {e.user_message}")

    # Funnel event: checkout initiated
    await track("checkout_initiated", {
        "plan":       plan,
        "has_referral": bool(discounts),
        "ref_token":  body.ref_token or "",
    })

    # Log referral use
    if discounts and body.ref_token:
        await track("referral_used", {"ref_token": body.ref_token, "plan": plan})

    return {
        "checkout_url": session.url,
        "session_id":   session.id,
        "report_id":    report_id,
        "referral_discount": bool(discounts),
    }


@router.post("/api/stripe/webhook")
async def stripe_webhook(request: Request):
    """
    Stripe webhook handler.
    Handles: checkout.session.completed
      - single plan  → marks report as paid, triggers PDF generation
      - unlimited    → upgrades user subscription_tier to 'pro'
    """
    payload   = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except stripe.SignatureVerificationError:
        raise HTTPException(400, "Invalid Stripe signature")
    except Exception as e:
        raise HTTPException(400, f"Webhook error: {e}")

    if event["type"] == "checkout.session.completed":
        session  = event["data"]["object"]
        meta     = session.get("metadata", {})
        plan     = meta.get("plan")
        # Funnel event: payment confirmed
        await track("payment_completed", {
            "plan":        plan,
            "amount_total": session.get("amount_total"),
            "ref_token":   meta.get("ref_token", ""),
        })
        report_id    = meta.get("report_id") or None
        portfolio_id = meta.get("portfolio_id") or None
        advisor_id   = meta.get("advisor_id")

        if plan == "single" and report_id:
            # Mark paid
            supabase.table("advisor_reports").update({"is_paid": True}).eq("id", report_id).execute()
            # Generate PDF asynchronously (Stripe timeout is 30s — PDF gen is ~3-8s)
            if portfolio_id:
                await _generate_and_store_pdf(portfolio_id, report_id)

        elif plan == "unlimited" and advisor_id and advisor_id != "anonymous":
            # Upgrade subscription tier
            try:
                supabase.table("user_profiles").update({
                    "subscription_tier": "pro",
                    "trial_ends_at":     None,
                }).eq("id", advisor_id).execute()
            except Exception as e:
                print(f"[Webhook] subscription upgrade failed: {e}")

    elif event["type"] == "customer.subscription.deleted":
        # Downgrade if subscription cancelled
        sub = event["data"]["object"]
        customer_id = sub.get("customer")
        try:
            # Look up advisor_id from Stripe customer metadata
            customer = stripe.Customer.retrieve(customer_id)
            advisor_id = customer.get("metadata", {}).get("advisor_id")
            if advisor_id:
                supabase.table("user_profiles").update({
                    "subscription_tier": "free",
                }).eq("id", advisor_id).execute()
        except Exception as e:
            print(f"[Webhook] subscription downgrade failed: {e}")

    return {"status": "ok"}


@router.get("/api/reports/fulfill")
async def fulfill_report(report_id: str):
    """
    Called from the frontend success page.
    If the report is paid but has no PDF yet, generates it now.
    Returns { pdf_url } or triggers generation.
    """
    try:
        result = (
            supabase.table("advisor_reports")
            .select("id, portfolio_id, is_paid, pdf_url")
            .eq("id", report_id)
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(404, "Report not found.")

    record = result.data
    if not record:
        raise HTTPException(404, "Report not found.")
    if not record["is_paid"]:
        raise HTTPException(402, "Payment not yet confirmed. Please wait a moment and retry.")

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
                "id":          "free",
                "name":        "DNA Score",
                "price":       0,
                "currency":    "usd",
                "interval":    None,
                "description": "Behavioral investor profile, strengths, weaknesses, recommendation",
                "features":    ["Investor DNA Score (0–100)", "Investor type classification",
                                "3 key strengths", "2 risk areas", "Shareable card"],
            },
            {
                "id":          "single",
                "name":        "Advisor Report",
                "price":       2900,
                "currency":    "usd",
                "interval":    "one_time",
                "description": "Full 10-page professional PDF report",
                "features":    ["Everything in Free", "10-page PDF report", "AI risk assessment",
                                "Sector allocation analysis", "Market outlook",
                                "Action plan", "White-label branding"],
            },
            {
                "id":          "unlimited",
                "name":        "Pro Advisor",
                "price":       9900,
                "currency":    "usd",
                "interval":    "month",
                "description": "Unlimited reports for advisor teams",
                "features":    ["Everything in Single Report", "Unlimited reports/month",
                                "Custom logo & colours", "Priority AI (Claude primary)",
                                "API access", "Client dashboard"],
            },
        ]
    }
