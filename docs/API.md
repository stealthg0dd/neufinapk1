# Neufin — API Reference

Base URL: `https://neufin101-production.up.railway.app`

All authenticated endpoints require `Authorization: Bearer <supabase_jwt>` header.
All responses are `application/json`. Errors follow `{ "detail": "string" }`.

---

## Authentication

| Header | Value |
|--------|-------|
| `Authorization` | `Bearer <supabase_access_token>` |

JWTs are issued by Supabase Auth (Google OAuth). Tokens expire after 1 hour; refresh via `supabase.auth.refreshSession()`.

---

## Public Endpoints (no auth)

### POST /api/analyze-dna

Analyzes a portfolio CSV and returns a DNA score. No authentication required.

**Request:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | CSV file | Yes | Columns: `symbol`, `shares`, `cost_basis` (optional) |
| `session_id` | string | No | Anonymous session ID to associate results |

**CSV Format:**
```csv
symbol,shares,cost_basis
AAPL,10,150.00
MSFT,5,280.00
GOOGL,3,
```

**Response 200:**
```json
{
  "dna_score": 74,
  "investor_type": "Balanced Growth",
  "strengths": ["Well-diversified across sectors", "Low correlation cluster"],
  "weaknesses": ["High beta exposure (1.4)", "Concentrated in tech"],
  "recommendation": "Consider adding defensive positions in XLU or XLP.",
  "hhi_score": 18,
  "beta_score": 16,
  "tax_alpha_score": 12,
  "correlation_score": 28,
  "share_token": "a3f8bc12",
  "record_id": "uuid-string"
}
```

---

### GET /api/dna/share/{token}

Retrieves a shared DNA result by public token (8 chars).

**Response 200:** Same shape as POST /api/analyze-dna plus `view_count`.

**Response 404:** `{ "detail": "Share token not found" }`

---

### GET /api/dna/leaderboard

Top 10 DNA scores (public, anonymized).

**Response 200:**
```json
[
  { "investor_type": "Momentum Trader", "dna_score": 91, "view_count": 43 },
  ...
]
```

---

### GET /api/market/health

Current market health stats and macro regime.

**Response 200:**
```json
{
  "regime": "growth",
  "cpi_yoy": 3.2,
  "market_score": 72,
  "score_trend": [68, 70, 71, 72],
  "updated_at": "2025-01-15T14:30:00Z"
}
```

---

## Portfolio Endpoints (auth required)

### GET /api/portfolio/list

Returns all portfolios for the authenticated user.

**Response 200:**
```json
[
  {
    "id": "uuid",
    "name": "My Tech Portfolio",
    "total_value": 58420.00,
    "created_at": "2025-01-10T09:00:00Z"
  }
]
```

### POST /api/portfolio/create

Creates a new portfolio from CSV upload.

**Request:** `multipart/form-data`

| Field | Type | Required |
|-------|------|----------|
| `file` | CSV | Yes |
| `name` | string | No (defaults to "My Portfolio") |

**Response 201:**
```json
{ "id": "uuid", "name": "My Tech Portfolio", "total_value": 58420.00 }
```

### GET /api/portfolio/{portfolio_id}/metrics

Full portfolio metrics including DNA score breakdown.

**Response 200:**
```json
{
  "portfolio_id": "uuid",
  "total_value": 58420.00,
  "dna_score": 74,
  "hhi": 0.18,
  "weighted_beta": 1.2,
  "sharpe_ratio": 1.4,
  "positions": [
    { "symbol": "AAPL", "shares": 10, "current_price": 185.20, "weight": 0.32 }
  ]
}
```

### POST /api/portfolio/signals

Returns buy/sell signals for a portfolio's holdings.

**Request:**
```json
{ "portfolio_id": "uuid" }
```

**Response 200:**
```json
{
  "signals": [
    { "symbol": "AAPL", "signal": "hold", "confidence": 0.72, "rationale": "..." }
  ]
}
```

### GET /api/portfolio/{portfolio_id}/sentiment

News sentiment for portfolio holdings.

**Response 200:**
```json
{
  "overall_sentiment": "cautious",
  "items": [
    { "symbol": "AAPL", "headline": "...", "sentiment": "positive", "score": 0.8 }
  ]
}
```

---

## Swarm Agent Endpoints (auth required)

### POST /api/swarm/analyze

Triggers the 7-agent LangGraph swarm analysis. Async — may take 30–60 seconds.

**Request:**
```json
{ "portfolio_id": "uuid" }
```

**Response 200:**
```json
{
  "report_id": "uuid",
  "regime": "growth",
  "briefing": "IC Briefing: ...",
  "investment_thesis": "...",
  "agent_trace": [
    { "agent": "market_regime", "output": "...", "duration_ms": 1240 }
  ],
  "dna_score": 74
}
```

### GET /api/swarm/report/latest

Returns the most recent swarm report for the authenticated user.

**Response 200:** Same shape as POST /api/swarm/analyze.

**Response 404:** `{ "detail": "No reports found" }`

### POST /api/swarm/chat

Single-turn chat with the swarm AI against the user's portfolio context.

**Request:**
```json
{ "message": "Should I rebalance toward bonds given current CPI?", "portfolio_id": "uuid" }
```

**Response 200:**
```json
{ "reply": "Given CPI at 3.2% and a growth regime, a 10% allocation shift toward TLT..." }
```

### POST /api/swarm/global-chat

Public swarm chat (no portfolio context, no auth).

**Request:**
```json
{ "message": "What is the current market regime?" }
```

**Response 200:**
```json
{ "reply": "Current regime: Growth. CPI trending down from 3.8% to 3.2%..." }
```

---

## Reports Endpoints (auth required)

### POST /api/reports/checkout

Creates a Stripe Checkout session for report purchase.

**Query params:**

| Param | Values | Description |
|-------|--------|-------------|
| `plan` | `single` \| `unlimited` | Report plan |

**Request:**
```json
{ "portfolio_id": "uuid" }
```

**Response 200:**
```json
{ "checkout_url": "https://checkout.stripe.com/pay/..." }
```

### GET /api/reports/fulfill

Returns signed PDF URL after successful payment. Called after Stripe redirects back.

**Query params:** `session_id` (Stripe checkout session ID)

**Response 200:**
```json
{ "pdf_url": "https://storage.supabase.co/..." }
```

### GET /api/reports/{report_id}/download

Direct report download (must own report or have unlimited subscription).

**Response 200:** `application/pdf` binary stream.

### GET /api/reports/advisor/{advisor_id}

Lists all reports generated by a specific advisor.

**Response 200:**
```json
[
  { "id": "uuid", "portfolio_id": "uuid", "pdf_url": "...", "created_at": "..." }
]
```

---

## Vault Endpoints (auth required)

### GET /api/vault/history

Returns authenticated user's full analysis history.

**Response 200:**
```json
{
  "dna_scores": [...],
  "swarm_reports": [...],
  "advisor_reports": [...]
}
```

### POST /api/vault/claim

Claims an anonymous DNA score record to the authenticated user's account.

**Request:**
```json
{ "record_id": "uuid" }
```

**Response 200:**
```json
{ "claimed": true }
```

### GET /api/vault/subscription

Returns current subscription status.

**Response 200:**
```json
{
  "tier": "unlimited",
  "stripe_customer_id": "cus_...",
  "current_period_end": "2025-02-15T00:00:00Z"
}
```

### POST /api/vault/stripe-portal

Creates a Stripe Customer Portal session for subscription management.

**Response 200:**
```json
{ "portal_url": "https://billing.stripe.com/..." }
```

---

## Advisor Endpoints (auth required, unlimited tier)

### GET /api/advisors/me

Returns the authenticated advisor's profile.

**Response 200:**
```json
{
  "id": "uuid",
  "advisor_name": "Jane Smith",
  "firm_name": "Smith Capital",
  "brand_color": "#1a73e8",
  "logo_base64": "data:image/png;base64,...",
  "share_token": "a3f8bc12"
}
```

### PUT /api/advisors/me

Updates advisor white-label branding.

**Request:**
```json
{
  "advisor_name": "Jane Smith",
  "firm_name": "Smith Capital",
  "brand_color": "#1a73e8",
  "logo_base64": "data:image/png;base64,..."
}
```

**Response 200:** Updated profile object.

### GET /api/advisors/lookup/{share_token}

Public endpoint — looks up advisor by share token (for client-facing link rendering).

**Response 200:** Advisor profile (no PII beyond public fields).

---

## Alerts Endpoints

### POST /api/alerts/register

Registers an Expo push token for macro shift alerts.

**Request:**
```json
{
  "expo_push_token": "ExponentPushToken[...]",
  "symbols": ["AAPL", "MSFT", "SPY"],
  "user_label": "My Portfolio"
}
```

**Response 200:** `{ "registered": true }`

### GET /api/alerts/recent

Returns recent macro shift alerts.

**Query params:** `limit` (default 20, max 100)

**Response 200:**
```json
[
  {
    "id": "uuid",
    "title": "CPI Surge: Inflation Regime Detected",
    "body": "CPI YoY at 4.1% — portfolio rebalancing recommended.",
    "regime": "inflation",
    "cpi_yoy": 4.1,
    "affected_symbols": ["TLT", "GLD"],
    "created_at": "2025-01-15T08:00:00Z"
  }
]
```

### POST /api/alerts/broadcast

**Admin only** — Broadcasts a macro shift alert to all registered tokens.

**Request:**
```json
{
  "title": "...",
  "body": "...",
  "regime": "inflation",
  "cpi_yoy": 4.1,
  "affected_symbols": ["TLT", "GLD"]
}
```

---

## Payments Webhooks (Stripe → Backend)

### POST /api/payments/webhook

Stripe webhook receiver. Verifies `Stripe-Signature` header.

Handled events:
- `checkout.session.completed` → generates PDF, updates subscription tier
- `customer.subscription.deleted` → downgrades to free tier
- `invoice.payment_failed` → logs failure

**Do not call manually.** Configure in Stripe Dashboard → Webhooks.

---

## Referrals

### POST /api/referrals/validate

Validates a referral code and returns Stripe coupon.

**Request:**
```json
{ "referral_code": "REFER20" }
```

**Response 200:**
```json
{ "valid": true, "discount_percent": 20, "stripe_coupon": "REFER20" }
```

### POST /api/referrals/subscribe

Subscribes an email to the Neufin digest.

**Request:**
```json
{ "email": "user@example.com", "referral_code": "REFER20" }
```

---

## Error Codes

| Status | Meaning |
|--------|---------|
| 400 | Bad request — invalid CSV, missing fields |
| 401 | Unauthorized — missing or invalid JWT |
| 403 | Forbidden — insufficient subscription tier |
| 404 | Resource not found |
| 429 | Rate limit exceeded |
| 500 | Internal server error — check logs |
| 503 | AI provider unavailable — all 4 providers failed |
