# Neufin — Architecture

## System Overview (C4 Context)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            EXTERNAL USERS                                │
│   Retail Investors    Financial Advisors    Mobile Users                 │
└──────────┬───────────────────┬────────────────────┬─────────────────────┘
           │                   │                    │
           ▼                   ▼                    ▼
┌──────────────────┐  ┌────────────────┐  ┌─────────────────────┐
│  neufin-web      │  │  neufin-web    │  │   neufin-mobile     │
│  (Next.js)       │  │  /advisor      │  │   (Expo/RN Android) │
│  Vercel          │  │  dashboard     │  │   EAS Build / APK   │
└────────┬─────────┘  └───────┬────────┘  └──────────┬──────────┘
         │                    │                       │
         └────────────────────┴───────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │   neufin-backend (FastAPI)    │
              │   Railway — Docker container  │
              │   neufin101-production.       │
              │   up.railway.app              │
              │                               │
              │  10 Routers · 40+ Endpoints   │
              │  7 AI Agents (LangGraph)      │
              │  4 AI Providers (fallback)    │
              │  6 Market Data Providers      │
              └──────────┬────────────────────┘
                         │
         ┌───────────────┼────────────────┐
         ▼               ▼                ▼
┌──────────────┐  ┌────────────┐  ┌─────────────────┐
│  Supabase    │  │  Stripe    │  │  External APIs   │
│  PostgreSQL  │  │  Payments  │  │  Polygon/FMP     │
│  Auth (JWT)  │  │  Webhooks  │  │  Finnhub/AV      │
│  Storage     │  │            │  │  FRED / Expo     │
└──────────────┘  └────────────┘  └─────────────────┘
```

## Component Map (C4 Container)

### neufin-backend

```
neufin-backend/
├── main.py                  FastAPI app, CORS, auth middleware, /analyze-dna
├── config.py                All env vars (API keys, Stripe, Supabase, market)
├── database.py              Supabase client, Fernet field encryption
│
├── routers/
│   ├── dna.py               POST /api/dna/generate, GET /api/dna/share/{token}
│   │                        GET /api/dna/leaderboard
│   ├── portfolio.py         Portfolio CRUD, chart data, signals, risk report
│   ├── swarm.py             Agent swarm analyze, chat, global-chat, report fetch
│   ├── payments.py          Stripe checkout, webhook, fulfillment, plans
│   ├── reports.py           PDF generation, download, advisor reports
│   ├── vault.py             Auth-gated history, claim, subscription, portal
│   ├── advisors.py          Advisor profile CRUD, lookup by share_token
│   ├── referrals.py         Referral validation, email subscription, digest
│   ├── alerts.py            Push token register, recent alerts, broadcast
│   └── market.py            Market health stats, score trend, analytics track
│
└── services/
    ├── agent_swarm.py       LangGraph 7-agent orchestration (regime→synth)
    ├── ai_router.py         Claude→Gemini→Groq→OpenAI fallback chain
    ├── calculator.py        Multi-provider price fetch, scoring components
    ├── risk_engine.py       Pearson correlation, HHI, Effective Num of Bets
    ├── stress_tester.py     Historical scenario stress testing (3 scenarios)
    ├── pdf_generator.py     ReportLab 10-page white-label advisor reports
    ├── jwt_auth.py          Supabase JWT verify (JWKS + HS256 fallback)
    ├── auth_dependency.py   FastAPI Depends(get_current_user) hard-reject
    ├── analytics.py         Fire-and-forget event tracking
    ├── market_cache.py      Redis→Supabase→in-process 3-tier cache
    └── celery_app.py        Async task queue (optional, not yet active)
```

### Database Schema (Supabase PostgreSQL)

```
┌─────────────────┐    ┌──────────────────┐    ┌────────────────────┐
│   user_profiles │    │    portfolios     │    │ portfolio_positions│
│─────────────────│    │──────────────────│    │────────────────────│
│ id (UUID, PK)   │◄──┐│ id (UUID, PK)    │◄──┐│ id (UUID, PK)      │
│ advisor_name    │   ││ user_id (FK)      │   ││ portfolio_id (FK)  │
│ firm_name       │   ││ session_id        │   ││ symbol             │
│ logo_base64     │   ││ name              │   ││ shares             │
│ brand_color     │   ││ total_value       │   ││ cost_basis (enc.)  │
│ subscription_tier│  └┘ created_at        │   └┘                   │
│ stripe_customer_id│  └──────────────────┘    └────────────────────┘
└─────────────────┘

┌──────────────────┐    ┌──────────────────┐    ┌────────────────────┐
│    dna_scores    │    │  swarm_reports   │    │  advisor_reports   │
│──────────────────│    │──────────────────│    │────────────────────│
│ id (UUID, PK)    │    │ id (UUID, PK)    │    │ id (UUID, PK)      │
│ user_id          │    │ user_id          │    │ portfolio_id       │
│ session_id       │    │ session_id       │    │ advisor_id         │
│ dna_score 0-100  │    │ dna_score        │    │ pdf_url            │
│ investor_type    │    │ regime           │    │ is_paid            │
│ share_token      │    │ briefing         │    │ created_at         │
│ view_count       │    │ agent_trace[]    │    └────────────────────┘
└──────────────────┘    └──────────────────┘

┌──────────────────────┐    ┌───────────────────────────┐
│ push_alert_subs      │    │ macro_shift_alerts        │
│──────────────────────│    │───────────────────────────│
│ expo_push_token (PK) │    │ id (UUID, PK)             │
│ symbols[]            │    │ title, body               │
│ user_label           │    │ regime, cpi_yoy           │
└──────────────────────┘    │ affected_symbols[]        │
                            └───────────────────────────┘
```

## DNA Scoring Model

```
Input: CSV (symbol, shares, cost_basis?)
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│                    4-COMPONENT MODEL                     │
│                                                         │
│  ① HHI Concentration  (0–25 pts)                       │
│     Herfindahl-Hirschman Index on position weights      │
│     Perfect diversification = 25; single stock = 0     │
│                                                         │
│  ② Weighted Beta      (0–25 pts)                       │
│     Portfolio beta vs market × position weights         │
│     β=1.0 target; penalty for β>1.5 or β<0.5           │
│                                                         │
│  ③ Tax Alpha          (0–20 pts)                       │
│     Cost-basis loss harvesting potential                │
│     Only scores if cost_basis column present            │
│                                                         │
│  ④ Correlation        (0–30 pts)                       │
│     Pearson clusters on top-5 holdings (60-day returns) │
│     Critic agent triggers quant revision if ρ > 0.80   │
└─────────────────────────────────────────────────────────┘
         │
         ▼
    DNA Score 0–100
    + investor_type (5 archetypes)
    + AI narrative (strengths, weaknesses, recommendation)
    + share_token (8-char, public link)
```

## Agent Swarm Architecture

```
START
  │
  ▼
market_regime_node    ← FRED CPI data
  │    regime: growth|inflation|recession|stagflation|risk-off
  ▼
strategist_node       ← Finnhub company news + FRED
  │    sentiment: constructive|cautious|bearish
  ▼
quant_analyst_node    ← HHI, beta, Sharpe, Pearson clusters
  │    ┌─ if avg_corr > 0.80 → revisit (max 1 revision)
  ▼   │
tax_architect_node    ← per-position LT-CGT @ 20%
  │
  ▼
risk_sentinel_node    ← independent risk watchdog
  │
  ▼
alpha_scout_node      ← opportunities outside current holdings
  │
  ▼
critic_node           ← challenges quant ←───────────┘
  │
  ▼
synthesizer_node      ← IC Briefing + Investment Thesis
  │
 END → persisted to swarm_reports table
       + push alert if High Inflation regime
```

## Market Data Provider Fallback Chain

```
Price Requests
├── 1. Polygon.io     (batch snapshot, ≤150 tickers)
├── 2. Finnhub        (single quote, 300 req/day free)
├── 3. FMP            (batch fallback)
├── 4. TwelveData     (single, 800 req/day)
├── 5. MarketStack    (single, 1000 req/mo)
└── 6. Alpha Vantage  (single, 25 req/day)

Beta Requests
└── Alpha Vantage OVERVIEW endpoint

Candles / OHLCV
├── 1. Finnhub
└── 2. Alpha Vantage TIME_SERIES_DAILY

Macro (CPI)
└── FRED Federal Reserve API

Company News
└── Finnhub

Circuit Breaker: provider blacklisted 60s on rate-limit detection
Price Cache TTL: 3600s in-process | 86400s Redis | 86400s Supabase
```

## AI Provider Fallback Chain

```
Prompt
├── 1. Claude (Anthropic) — primary, highest quality
├── 2. Gemini (Google)   — secondary
├── 3. Groq              — tertiary, fastest
└── 4. OpenAI            — reserved fallback

All calls: async, timeout-guarded, JSON-only responses
Cost tracking available via Agent OS integration
```

## Authentication Flow

```
Web:
  1. User clicks "Sign in with Google"
  2. supabase.auth.signInWithOAuth({ provider: 'google' }) → PKCE redirect
  3. Google OAuth callback → /auth/callback
  4. onAuthStateChange('SIGNED_IN') → session established
  5. claimAnonymousRecord(recordId) → associates guest data

Mobile:
  1. supabase.auth.signInWithOAuth() → opens browser
  2. After auth → redirects to neufin://auth/callback
  3. App.tsx deep-link handler → completes PKCE exchange

Backend:
  1. Every request → auth_middleware → soft-attach JWT to request.state.user
  2. Protected endpoints → Depends(get_current_user) → hard 401 if missing
  3. JWT verified via Supabase JWKS + 60s clock-skew leeway
```

## Monetization Architecture

```
Free Tier
└── DNA Score: POST /api/analyze-dna → score + AI narrative (no auth required)

$29 One-Time (Single Report)
└── POST /api/reports/checkout?plan=single
    → Stripe Checkout (price_1TARztGVXReXuoyMFGbIXEbn)
    → checkout.session.completed webhook
    → _generate_and_store_pdf()
    → Supabase Storage: advisor-reports bucket
    → signed URL returned via GET /api/reports/fulfill

$99/month (Unlimited)
└── POST /api/reports/checkout?plan=unlimited
    → Stripe Subscription (price_1TAS1MGVXReXuoyM1WNAZMZP)
    → Unlimited report generation
    → Stripe Customer Portal via POST /api/vault/stripe-portal

B2B Advisor White-Label (rides $99/mo)
└── PUT /api/advisors/me → brand_color, logo_base64, firm_name
    → PDFs rendered with custom branding
    → Client share links show AdvisorCTA card
    → Referral token → 20% discount (REFER20 coupon)
```
