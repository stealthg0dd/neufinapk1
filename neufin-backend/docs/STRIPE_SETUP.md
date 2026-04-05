# Stripe Setup Guide — NeuFin Commercial Tiers

This document explains the NeuFin Stripe product configuration for all three
revenue tiers.

## Running the Setup Script

```bash
cd neufin-backend

# With live key (production)
STRIPE_SECRET_KEY=sk_live_... python scripts/setup_stripe_products.py

# With test key (staging / development)
STRIPE_SECRET_KEY=sk_test_... python scripts/setup_stripe_products.py
```

The script creates four products in your Stripe dashboard and prints the
resulting Price IDs. **Run this once per Stripe account** (test and live
separately).

---

## Products Created

| Product                     | Type      | Amount   | Environment Variable                       |
|-----------------------------|-----------|----------|--------------------------------------------|
| NeuFin Retail Investor      | Recurring | $29/mo   | `STRIPE_PRICE_RETAIL_MONTHLY`              |
| NeuFin Financial Advisor    | Recurring | $299/mo  | `STRIPE_PRICE_ADVISOR_MONTHLY`             |
| NeuFin Enterprise / API     | Recurring | $999/mo  | `STRIPE_PRICE_ENTERPRISE_MONTHLY`          |
| NeuFin Advisor Report       | One-time  | $49      | `STRIPE_PRICE_ADVISOR_REPORT_ONETIME`      |

Legacy products (pre-tier model):

| Product                     | Type      | Amount   | Environment Variable                       |
|-----------------------------|-----------|----------|--------------------------------------------|
| Single Advisor Report       | One-time  | $29      | `STRIPE_PRICE_SINGLE_REPORT`               |
| Pro Advisor (unlimited)     | Recurring | $99/mo   | `STRIPE_PRICE_UNLIMITED_MONTHLY`           |

---

## After Running the Script

### 1. Set Railway environment variables

```
STRIPE_PRICE_RETAIL_MONTHLY=price_...
STRIPE_PRICE_ADVISOR_MONTHLY=price_...
STRIPE_PRICE_ENTERPRISE_MONTHLY=price_...
STRIPE_PRICE_ADVISOR_REPORT_ONETIME=price_...
```

### 2. Update `routers/vault.py` PLANS constant

Replace the `stripe_price_id` placeholders in `PLANS` with the actual
price IDs printed by the script:

```python
PLANS = {
    "retail": {
        ...
        "stripe_price_id": "price_<RETAIL_PRICE_ID>",
        ...
    },
    "advisor": {
        ...
        "stripe_price_id": "price_<ADVISOR_PRICE_ID>",
        ...
    },
    "enterprise": {
        ...
        "stripe_price_id": "price_<ENTERPRISE_PRICE_ID>",
        ...
    },
}
```

### 3. Configure Stripe Webhook

In the Stripe Dashboard → Developers → Webhooks, add an endpoint pointing to:

```
https://your-railway-domain.railway.app/api/stripe/webhook
```

Select these events:
- `checkout.session.completed`
- `customer.subscription.deleted`
- `customer.subscription.updated`

Copy the signing secret and set it as `STRIPE_WEBHOOK_SECRET` in Railway.

---

## Subscription Tier Model

```
TIER 1 — B2C Freemium
  free     : 3 DNA analyses/month, no swarm, no reports, no API
  retail   : $29/mo — unlimited DNA, swarm analysis

TIER 2 — B2B SaaS (Financial Advisors)
  advisor  : $299/mo — everything in retail + 10 advisor reports/month,
             multi-client dashboard, white-label branding

TIER 3 — API Platform (Fintechs / Institutions)
  enterprise: $999/mo — everything in advisor + unlimited reports,
              full data API access (10,000 calls/day), API key management
```

---

## Price IDs (Populate after running setup script)

> Update this section after running `scripts/setup_stripe_products.py`.

| Plan       | Stripe Price ID (Test)                | Stripe Price ID (Live) |
|------------|---------------------------------------|------------------------|
| retail     | `price_1TIuPkGVXReXuoyMrADQfcSQ`     | *(run script with live key)* |
| advisor    | `price_1TIuPlGVXReXuoyMICYnUmXR`     | *(run script with live key)* |
| enterprise | `price_1TIuPlGVXReXuoyMgx5yT4Bu`     | *(run script with live key)* |
| report     | `price_1TIuPmGVXReXuoyM1JgzMrO9`     | *(run script with live key)* |
