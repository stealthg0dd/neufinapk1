"""
scripts/setup_stripe_products.py
---------------------------------
Creates Stripe Products and Prices for all NeuFin subscription tiers.

Usage:
    cd neufin-backend
    STRIPE_SECRET_KEY=sk_live_... python scripts/setup_stripe_products.py

    # Or with a .env file:
    python scripts/setup_stripe_products.py

Output:
    Prints the price IDs to update in routers/vault.py PLANS constant
    and to add as Railway environment variables.

Created products:
  - NeuFin Retail Investor    $29/month  (recurring)
  - NeuFin Financial Advisor  $299/month (recurring)
  - NeuFin Enterprise / API   $999/month (recurring)
  - NeuFin Advisor Report     $49        (one-time)
"""

import os
import sys

# Load .env if present
try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

import stripe

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
if not stripe.api_key:
    print("ERROR: STRIPE_SECRET_KEY environment variable is required.", file=sys.stderr)
    sys.exit(1)

if stripe.api_key.startswith("sk_test_"):
    print("⚠️  Using TEST mode Stripe key. Run with sk_live_... for production.\n")
else:
    print("🔑 Using LIVE Stripe key.\n")


def create_product_and_price(
    product_name: str,
    description: str,
    amount_cents: int,
    currency: str = "usd",
    recurring: bool = True,
    interval: str = "month",
    metadata: dict | None = None,
) -> dict:
    """Create a Stripe Product + Price and return both IDs."""
    product = stripe.Product.create(
        name=product_name,
        description=description,
        metadata=metadata or {},
    )

    price_params = {
        "product": product.id,
        "unit_amount": amount_cents,
        "currency": currency,
    }
    if recurring:
        price_params["recurring"] = {"interval": interval}

    price = stripe.Price.create(**price_params)
    return {"product_id": product.id, "price_id": price.id}


def main():
    results = {}

    print("Creating Stripe products and prices...\n")

    # ── Retail Investor — $29/month ────────────────────────────────────────────
    print("1/4 Retail Investor ($29/month)...")
    results["retail"] = create_product_and_price(
        product_name="NeuFin Retail Investor",
        description="Unlimited DNA analyses, swarm analysis, and portfolio tracking.",
        amount_cents=2900,
        recurring=True,
        metadata={"plan": "retail", "tier": "b2c"},
    )
    print(f"   ✓ price_id: {results['retail']['price_id']}\n")

    # ── Financial Advisor — $299/month ─────────────────────────────────────────
    print("2/4 Financial Advisor ($299/month)...")
    results["advisor"] = create_product_and_price(
        product_name="NeuFin Financial Advisor",
        description=(
            "Multi-client dashboard, 10 white-label PDF reports/month, "
            "swarm analysis, and advisor branding."
        ),
        amount_cents=29900,
        recurring=True,
        metadata={"plan": "advisor", "tier": "b2b"},
    )
    print(f"   ✓ price_id: {results['advisor']['price_id']}\n")

    # ── Enterprise / API — $999/month ──────────────────────────────────────────
    print("3/4 Enterprise / API ($999/month)...")
    results["enterprise"] = create_product_and_price(
        product_name="NeuFin Enterprise / API",
        description=(
            "Full API access (10,000 calls/day), unlimited reports, "
            "multi-client dashboard, and dedicated support."
        ),
        amount_cents=99900,
        recurring=True,
        metadata={"plan": "enterprise", "tier": "api_platform"},
    )
    print(f"   ✓ price_id: {results['enterprise']['price_id']}\n")

    # ── Individual Advisor Report — $49 one-time ───────────────────────────────
    print("4/4 Individual Advisor Report ($49 one-time)...")
    results["advisor_report_onetime"] = create_product_and_price(
        product_name="NeuFin Advisor Report",
        description="Single 10-page white-label PDF portfolio report with AI analysis.",
        amount_cents=4900,
        recurring=False,
        metadata={"plan": "report_onetime", "tier": "b2c"},
    )
    print(f"   ✓ price_id: {results['advisor_report_onetime']['price_id']}\n")

    # ── Output ─────────────────────────────────────────────────────────────────
    sep = "=" * 60
    print(sep)
    print("✅  All Stripe products and prices created successfully!")
    print(sep)
    print()
    print("Add these as Railway environment variables:")
    print()
    print(f"  STRIPE_PRICE_RETAIL_MONTHLY={results['retail']['price_id']}")
    print(f"  STRIPE_PRICE_ADVISOR_MONTHLY={results['advisor']['price_id']}")
    print(f"  STRIPE_PRICE_ENTERPRISE_MONTHLY={results['enterprise']['price_id']}")
    print(
        f"  STRIPE_PRICE_ADVISOR_REPORT_ONETIME={results['advisor_report_onetime']['price_id']}"
    )
    print()
    print("Update routers/vault.py PLANS constant stripe_price_id values:")
    print()
    print(f"  retail.stripe_price_id      = \"{results['retail']['price_id']}\"")
    print(f"  advisor.stripe_price_id     = \"{results['advisor']['price_id']}\"")
    print(f"  enterprise.stripe_price_id  = \"{results['enterprise']['price_id']}\"")
    print()
    print("Update docs/STRIPE_SETUP.md with the price IDs above.")
    print(sep)

    return results


if __name__ == "__main__":
    main()
