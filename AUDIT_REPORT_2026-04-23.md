# NeuFin — Full Codebase Audit Report
**Date:** 2026-04-23
**Auditor:** GitHub Copilot (Claude Sonnet 4.6)
**Branch audited:** `main` / `develop` (post E1–E7 emergency fixes)

---

## 1. Executive Summary

**Health score: 5.5 / 10**

> A real product with real infrastructure, but carrying significant security gaps in frontend auth enforcement, catastrophic migration fragmentation, no distributed rate limiting, in-process-only caches, a deprecated agent service still deployed, and critical admin bypass logic. The backend itself is well-structured; the frontend has grown organically and shows it.

### Biggest Risks (P0/P1)

| # | Risk | Severity |
|---|------|----------|
| 1 | **Admin layout fallback-to-OK when `NEXT_PUBLIC_API_URL` is unset** — any unauthenticated user can access `/admin/*` in misconfigured deployments | CRITICAL |
| 2 | **No `middleware.ts`** — zero server-side route protection; dashboard content SSRs before client redirect fires | HIGH |
| 3 | **In-process rate limiting and caches** — dies on every deploy, wrong on multi-worker setups | HIGH |
| 4 | **`BYPASS_AUTH_IN_DEV=true` has no production guard** beyond env var convention | HIGH |
| 5 | **Migration chaos** — 5 different migration systems, no single source of truth | HIGH |
| 6 | **`AuthDebugPanel.tsx` leaks auth tokens to browser console** in production builds | HIGH |
| 7 | **Advisor router uses `get_current_user` (not `get_subscribed_user`)** — all advisor endpoints reachable by expired-trial users | MEDIUM |
| 8 | **`neufin-agent` is marked DEPRECATED but still has live Railway/Vercel deploy configs** | MEDIUM |
| 9 | **Single root `error.tsx` only** — no error boundaries on dashboard, admin, or research sub-routes | MEDIUM |
| 10 | **Duplicate Supabase client files** (`lib/supabase.ts` vs `lib/supabase-client.ts`) | LOW |

### Quick Wins

1. Add `middleware.ts` with Supabase session check — 1 file, eliminates the entire FOUC/SSR auth gap
2. Delete `if (!base) { return "ok"; }` in `app/admin/layout.tsx` — removes admin bypass
3. Delete or conditionally gate `AuthDebugPanel.tsx` behind `NODE_ENV !== 'production'`
4. Replace all in-process IP rate-limit counters with `upstash/ratelimit` or `slowapi` + Redis
5. Consolidate migrations to a single `alembic` + Supabase migration directory

---

## 2. File Tree & Structure Analysis

```
neufin/                          ← monorepo root
├── .github/
│   ├── workflows/
│   │   ├── ci-backend.yml
│   │   ├── ci-mobile.yml
│   │   ├── ci-web.yml
│   │   ├── deploy-backend.yml
│   │   ├── deploy-web.yml
│   │   ├── release-gate.yml
│   │   └── security-scan.yml
│   ├── SECRETS.md               ⚠️ secrets documentation committed to repo
│   ├── CODEOWNERS
│   └── dependabot.yml
├── docs/                        ← cross-service docs
├── infrastructure/
│   ├── docker/
│   ├── kubernetes/              ← backend-deployment.yaml (unused? Railway is actual deploy)
│   └── terraform/railway.tf     ← Terraform for Railway (duplicates railway.json)
├── migrations/                  ← ⚠️ ROOT-LEVEL migrations (chaos — see §7)
├── monitoring/grafana-dashboard.json
├── neufin-agent/                ← ⚠️ DEPRECATED but still deployed
├── neufin-backend/              ← FastAPI
│   ├── alembic/versions/        ← Alembic migrations (4 files)
│   ├── config.py                ← ⚠️ DUPLICATE — core/config.py is the real one
│   ├── core/config.py           ← Pydantic settings (authoritative)
│   ├── database.py              ← Supabase client singleton
│   ├── db/migrations/           ← Raw SQL (2 files)
│   ├── main.py                  ← App factory + all middleware
│   ├── migrations/              ← More raw SQL (2 files)
│   ├── routers/                 ← 21 router files
│   ├── services/                ← 50+ service files including control_tower/, research/, repo_intel/
│   ├── supabase/                ← Supabase-specific migrations
│   └── supabase_migrations*.sql ← ⚠️ 9+ raw SQL files at package root
└── neufin-web/                  ← Next.js 14 App Router
    ├── app/
    │   ├── (auth)/              ← Route group: login, signup
    │   ├── api/                 ← 80+ route handlers
    │   ├── admin/               ← Admin portal (separate from /dashboard/admin)
    │   ├── dashboard/           ← Main app
    │   └── ...23 other route segments
    ├── components/              ← Flat dump of 60+ components
    ├── lib/                     ← Utilities, hooks, api client
    └── qa/                      ← Playwright specs
```

### Structure Problems

**`neufin-web/components/` is a flat god-folder.** 60+ files with no sub-organization except a partial `dashboard/`, `auth/`, `landing/`, and `research/` sub-folder. Most components live at the top level making navigation and ownership unclear.

**Two admin portals exist:** `/admin/*` (separate layout with SSR auth check) and `/dashboard/admin/*` (client-side, uses `get_ops_user`). This split is confusing and increases attack surface.

**`neufin-backend/config.py` at the package root is a dead duplicate** of `neufin-backend/core/config.py`. Importing the wrong one silently loads different defaults.

**5 migration systems in one project** (see §7 for full breakdown).

**`neufin-agent/`** has `DEPRECATED.md` but `railway.json`, `vercel.json`, `Procfile`, and a `.github/workflows/ci.yml` all suggest it's still running. The README says it's been deprecated in favour of the backend swarm service.

---

## 3. Routing & API Layer

### 3a. Next.js App Router — Pages

| Route | File | Auth Guard |
|-------|------|------------|
| `/` | `app/page.tsx` | Public |
| `/(auth)/login` | `app/(auth)/login/page.tsx` | Public |
| `/(auth)/signup` | `app/(auth)/signup/page.tsx` | Public |
| `/auth` | `app/auth/page.tsx` | Public |
| `/auth/callback` | `app/auth/callback/page.tsx` | Public |
| `/about` | `app/about/page.tsx` | Public |
| `/blog` | `app/blog/page.tsx` | Public |
| `/blog/[slug]` | `app/blog/layout.tsx` + individual pages | Public |
| `/features` | `app/features/page.tsx` | Public |
| `/pricing` | `app/pricing/page.tsx` | Public |
| `/pricing/success` | `app/pricing/success/page.tsx` | Public |
| `/partners` | `app/partners/page.tsx` | Public |
| `/market` | `app/market/page.tsx` | Public |
| `/research` | `app/research/page.tsx` | Public |
| `/research/[slug]` | `app/research/[slug]/page.tsx` | Public |
| `/upload` | `app/upload/page.tsx` | Public ⚠️ |
| `/results` | `app/results/page.tsx` | Public ⚠️ |
| `/leaderboard` | `app/leaderboard/page.tsx` | Public |
| `/share/[token]` | `app/share/[token]/page.tsx` | Public |
| `/referrals` | `app/referrals/page.tsx` | Public |
| `/feedback` | `app/feedback/page.tsx` | Public |
| `/vault` | `app/vault/page.tsx` | Public ⚠️ |
| `/swarm` | `app/swarm/page.tsx` | Public ⚠️ |
| `/upgrade` | `app/upgrade/page.tsx` | Public |
| `/onboarding` | `app/onboarding/page.tsx` | Soft (OnboardingGate client-side) |
| `/dashboard` | `app/dashboard/page.tsx` | **Client-side only** via DashboardShell |
| `/dashboard/portfolio` | `app/dashboard/portfolio/page.tsx` | Client-side only |
| `/dashboard/research` | `app/dashboard/research/page.tsx` | Client-side only |
| `/dashboard/swarm` | `app/dashboard/swarm/page.tsx` | Client-side only |
| `/dashboard/agent-os` | `app/dashboard/agent-os/page.tsx` | Client-side only |
| `/dashboard/agent-studio` | `app/dashboard/agent-studio/page.tsx` | Client-side only |
| `/dashboard/quant` | `app/dashboard/quant/page.tsx` | Client-side only |
| `/dashboard/reports` | `app/dashboard/reports/page.tsx` | Client-side only |
| `/dashboard/billing` | `app/dashboard/billing/page.tsx` | Client-side only |
| `/dashboard/settings` | `app/dashboard/settings/page.tsx` | Client-side only |
| `/dashboard/analytics` | `app/dashboard/analytics/page.tsx` | Client-side only |
| `/dashboard/revenue` | `app/dashboard/revenue/page.tsx` | Client-side only |
| `/dashboard/admin` | `app/dashboard/admin/page.tsx` | Client-side only |
| `/dashboard/admin/leads` | `app/dashboard/admin/leads/page.tsx` | Client-side only |
| `/admin` | `app/admin/page.tsx` | **SSR check** ✓ (but has bypass bug) |
| `/admin/users` | `app/admin/users/page.tsx` | SSR check (same bug) |
| `/admin/users/[id]` | `app/admin/users/[id]/page.tsx` | SSR check |
| `/admin/partners` | `app/admin/partners/page.tsx` | SSR check |
| `/admin/api-keys` | `app/admin/api-keys/page.tsx` | SSR check |
| `/admin/revenue` | `app/admin/revenue/page.tsx` | SSR check |
| `/admin/reports` | `app/admin/reports/page.tsx` | SSR check |
| `/admin/ops` | `app/admin/ops/page.tsx` | SSR check |
| `/admin/system` | `app/admin/system/page.tsx` | SSR check |
| `/advisor/dashboard` | `app/advisor/dashboard/page.tsx` | None detected ⚠️ |
| `/advisor/clients/new` | `app/advisor/clients/new/page.tsx` | None detected ⚠️ |
| `/developer` | `app/developer/page.tsx` | None detected ⚠️ |
| `/developer/keys` | `app/developer/keys/page.tsx` | None detected ⚠️ |
| `/sample/dna-report` | `app/sample/dna-report/page.tsx` | Public |
| `/contact-sales` | `app/contact-sales/page.tsx` | Public |

**⚠️ NO `middleware.ts`** — there is zero server-side request interception. Every auth check is either SSR-in-layout or client-side useEffect.

**⚠️ Dashboard auth FOUC**: `DashboardShell` renders a blank `<div className="min-h-screen bg-app" />` while loading — but SSR will already have emitted HTML for child page content before the client hydrates and fires the redirect. A web crawler or someone with JS disabled sees full page content.

**⚠️ `/advisor/*` and `/developer/*` pages** — no auth guard detectable at the page or layout level. These surface-level pages are effectively public.

### 3b. Next.js API Route Handlers

| Method | Path | Auth | Handler |
|--------|------|------|---------|
| GET | `/api/admin/access` | Proxied to backend | `app/api/admin/access/route.ts` |
| GET | `/api/admin/control-tower` | Proxied | `app/api/admin/control-tower/route.ts` |
| GET | `/api/admin/dashboard` | Proxied | `app/api/admin/dashboard/route.ts` |
| GET | `/api/admin/leads` | Proxied | `app/api/admin/leads/route.ts` |
| PATCH | `/api/admin/leads/[leadId]` | Proxied | auto |
| GET | `/api/admin/leads/stats` | Proxied | auto |
| GET | `/api/admin/users` | Proxied | `app/api/admin/users/route.ts` |
| GET/DELETE | `/api/admin/users/[userId]` | Proxied | auto |
| POST | `/api/admin/users/[userId]/extend-trial` | Proxied | auto |
| POST | `/api/admin/users/[userId]/plan` | Proxied | auto |
| POST | `/api/admin/users/[userId]/suspend` | Proxied | auto |
| POST | `/api/admin/users/[userId]/reset-password` | Proxied | auto |
| POST | `/api/admin/users/[userId]/resend-onboarding` | Proxied | auto |
| GET | `/api/admin/partners` | Proxied | auto |
| GET | `/api/admin/partners/[id]/usage` | Proxied | auto |
| POST | `/api/admin/partners/[id]/rotate-key` | Proxied | auto |
| GET | `/api/admin/api-keys` | Proxied | auto |
| POST | `/api/admin/api-keys/issue` | Proxied | auto |
| POST | `/api/admin/api-keys/[keyId]/revoke` | Proxied | auto |
| POST | `/api/admin/api-keys/[keyId]/rate-limit` | Proxied | auto |
| GET | `/api/admin/revenue` | Proxied | auto |
| GET | `/api/admin/reports` | Proxied | auto |
| GET | `/api/admin/system` | Proxied | auto |
| POST | `/api/auth/set-cookie` | None | `app/api/auth/set-cookie/route.ts` |
| GET | `/api/dashboard` | Supabase session | `app/api/dashboard/route.ts` |
| GET | `/api/neufin/health` | None (public) | `app/api/neufin/health/route.ts` |
| GET | `/api/market/ticker` | None | `app/api/market/ticker/route.ts` |
| GET | `/api/portfolio/list` | Supabase session | auto |
| POST | `/api/portfolio/upload` | Supabase session | auto |
| POST | `/api/portfolio/analyze` | Supabase session | auto |
| GET | `/api/portfolio/[id]/metrics` | Supabase session | auto |
| GET | `/api/portfolio/[id]/value-history` | Supabase session | auto |
| GET | `/api/portfolio/chart/[ticker]` | None ⚠️ | auto |
| POST | `/api/payments/checkout` | Optional | auto |
| POST | `/api/stripe/webhook` | Stripe signature | `app/api/stripe/webhook/route.ts` |
| POST | `/api/swarm/analyze` | Optional | auto |
| GET | `/api/swarm/status/[job_id]` | Optional | auto |
| GET | `/api/swarm/result/[job_id]` | Optional | auto |
| POST | `/api/swarm/chat` | Optional | auto |
| POST | `/api/swarm/global-chat` | Optional | auto |
| POST | `/api/swarm/export-pdf` | Required | auto |
| GET | `/api/swarm/report/[id]` | Optional | auto |
| GET | `/api/swarm/report/latest` | Required | auto |
| GET | `/api/research/notes` | Proxied | `app/api/research/notes/route.ts` |
| GET | `/api/research/notes/[id]` | Proxied | auto |
| GET | `/api/research/regime` | Proxied | auto |
| GET | `/api/agent-os/status` | None ⚠️ | `app/api/agent-os/status/route.ts` |
| GET/POST | `/api/agent-os/[...path]` | None ⚠️ | `app/api/agent-os/[...path]/route.ts` |
| GET | `/api/subscription/status` | Supabase session | auto |
| GET | `/api/developer/keys` | Supabase session | auto |
| POST | `/api/developer/keys` | Supabase session | auto |
| DELETE | `/api/developer/keys/[keyId]` | Supabase session | auto |
| GET | `/api/revenue/stats` | Supabase session | auto |
| POST | `/api/feedback` | None (public) | auto |
| GET | `/api/leads` | None | `app/api/leads/route.ts` |
| POST | `/api/reports/checkout` | Optional | auto |
| POST | `/api/reports/generate` | Supabase session | auto |
| GET | `/api/reports/fulfill` | None ⚠️ | auto |
| POST | `/api/quant/analyze` | Supabase session | auto |
| GET | `/api/profile/branding` | Supabase session | auto |
| PATCH | `/api/profile/white-label` | Supabase session | auto |
| POST | `/api/profile/logo` | Supabase session | auto |
| POST | `/api/tasks` | Unknown | `app/api/tasks/route.ts` |
| GET | `/api/vault/history` | Supabase session | auto |
| GET | `/api/github/[repo]` | None ⚠️ | `app/api/github/[repo]/route.ts` |
| GET | `/api/referrals/validate/[ref]` | None (public) | auto |
| GET | `/api/partners/demo` | None ⚠️ | auto |

**⚠️ `/api/agent-os/[...path]`** — catch-all proxy with no auth check. Everything forwarded to the agent OS service.

**⚠️ `/api/reports/fulfill`** — GET with no auth. Fulfillment endpoint should at minimum validate a signed token.

**⚠️ `/api/github/[repo]`** — exposes GitHub repo metadata proxy with no rate limiting or auth.

**⚠️ `/api/auth/set-cookie`** — sets `neufin-auth` HttpOnly cookie. No CSRF protection, no origin validation documented.

### 3c. FastAPI (neufin-backend) Endpoints

#### `/api/dna` — `routers/dna.py`
| Method | Path | Auth |
|--------|------|------|
| POST | `/api/dna/generate` | None (guest-limited) |
| GET | `/api/dna/share/{token}` | None |
| GET | `/api/dna/leaderboard` | None |

#### `/api/portfolio` — `routers/portfolio.py`
| Method | Path | Auth |
|--------|------|------|
| POST | `/api/portfolio/claim` | `get_current_user` |
| POST | `/api/portfolio/create` | `get_current_user` |
| GET | `/api/portfolio/{portfolio_id}/metrics` | `get_current_user` |
| POST | `/api/portfolio/signals` | `get_current_user` |
| GET | `/api/portfolio/{portfolio_id}/sentiment` | `get_current_user` |
| GET | `/api/portfolio/list` | `get_current_user` |
| GET | `/api/portfolio/user/{user_id}` | `get_current_user` |
| GET | `/api/portfolio/chart/{symbol}` | `get_current_user` |
| POST | `/api/portfolio/risk-report` | `get_current_user` |
| GET | `/api/portfolio/value-history` | `get_current_user` |
| POST | `/api/portfolio/validate-tickers` | `get_current_user` |
| POST | `/api/portfolio/verify-prices` | `get_current_user` |

#### `/api/swarm` — `routers/swarm.py`
| Method | Path | Auth |
|--------|------|------|
| POST | `/api/swarm/analyze` | `get_optional_user` ⚠️ |
| GET | `/api/swarm/status/{job_id}` | `get_optional_user` ⚠️ |
| GET | `/api/swarm/result/{job_id}` | `get_optional_user` ⚠️ |
| POST | `/api/swarm/analyze-sync` | `get_optional_user` ⚠️ |
| GET | `/api/swarm/report/latest` | `get_current_user` ✓ |
| GET | `/api/swarm/report/{report_id}` | `get_optional_user` ⚠️ |
| POST | `/api/swarm/chat` | `get_optional_user` ⚠️ |
| POST | `/api/swarm/global-chat` | `get_optional_user` ⚠️ |
| POST | `/api/swarm/export-pdf` | `get_current_user` ✓ |

**⚠️ Swarm analysis endpoints use `get_optional_user`** — these run expensive multi-agent LLM workflows. Any unauthenticated user can spam `/api/swarm/analyze` and `/api/swarm/global-chat` with no rate limiting whatsoever, burning OpenAI/Anthropic quota.

#### `/api/research` — `routers/research.py`
| Method | Path | Auth |
|--------|------|------|
| GET | `/api/research/regime` | `get_current_user` |
| GET | `/api/research/quant-dashboard` | `get_current_user` |
| GET | `/api/research/global-map` | `get_current_user` |
| GET | `/api/research/regime-heatmap` | `get_current_user` |
| GET | `/api/research/notes` | `get_current_user` |
| GET | `/api/research/blog` | None (public) ✓ |
| GET | `/api/research/blog/{slug}` | None (public) ✓ |
| GET | `/api/research/notes/{note_id}` | `get_current_user` |
| GET | `/api/research/signals` | `get_current_user` |
| POST | `/api/research/query` | `get_subscribed_user` ✓ |
| GET | `/api/research/portfolio-context/{portfolio_id}` | `get_current_user` |
| POST | `/api/research/generate` | `get_subscribed_user` ✓ |

#### `/api/advisor` — `routers/advisor.py`
| Method | Path | Auth |
|--------|------|------|
| GET | `/api/advisor/clients` | `get_current_user` ⚠️ |
| POST | `/api/advisor/clients` | `get_current_user` ⚠️ |
| GET | `/api/advisor/clients/{client_id}/analysis` | `get_current_user` ⚠️ |
| GET | `/api/advisor/clients/{client_id}/reports` | `get_current_user` ⚠️ |
| POST | `/api/advisor/reports/batch` | `get_current_user` ⚠️ |

**⚠️ All advisor endpoints use `get_current_user` not `get_subscribed_user`**. A user whose trial has expired (status=`expired`) can still access all advisor CRM functionality. The `routers/advisors.py` PUT `/api/advisors/me` correctly uses `get_subscribed_user`.

#### `/api/agent-studio` — `routers/agent_studio.py`
| Method | Path | Auth |
|--------|------|------|
| GET | `/api/agent-studio/core-agents` | `get_optional_user` ⚠️ |
| POST | `/api/agent-studio/agents` | `get_optional_user` ⚠️ |
| GET | `/api/agent-studio/agents` | `get_optional_user` ⚠️ |
| GET | `/api/agent-studio/agents/{agent_id}/learning` | `get_optional_user` ⚠️ |
| POST | `/api/agent-studio/agents/{agent_id}/learning-event` | `get_optional_user` ⚠️ |
| POST | `/api/agent-studio/agents/{agent_id}/run` | `get_optional_user` ⚠️ |
| GET | `/api/agent-studio/compare` | `get_optional_user` ⚠️ |

**⚠️ Agent Studio is fully public** — unauthenticated users can create agents, run them, and post learning events.

#### Other Routers (summary)

| Router | Prefix | Notable |
|--------|--------|---------|
| `alerts.py` | `/api/alerts` | Test push requires admin ✓ |
| `admin.py` | `""` (explicit full paths) | All require `get_admin_user` ✓ |
| `developer.py` | `/api/developer` | All require `get_current_user` ✓ |
| `leads.py` | No prefix | Admin leads require `get_admin_user` ✓; POST `/api/leads` is public ✓ |
| `market.py` | No prefix | All public endpoints (intentional) |
| `payments.py` | No prefix | Webhook validates Stripe sig ✓ |
| `profile.py` | `/api/profile` | All require `get_current_user` ✓ |
| `quant.py` | `/api/quant` | Requires `get_current_user` ✓ |
| `referrals.py` | No prefix | All public ✓ |
| `reports.py` | `/api/reports` | PDF download is public ⚠️ |
| `revenue.py` | `""` | Requires `get_ops_user` ✓ |
| `risk.py` | `/api/risk` | All require `get_current_user` ✓ |
| `vault.py` | `/api/vault` | All require `get_current_user` ✓ |

### 3d. Routing Problems

**Conflicting prefix patterns:** `admin.py` and `revenue.py` both use `prefix=""` and define full paths manually. This is inconsistent with every other router that uses the prefix parameter. No actual conflict exists today, but it's a maintenance trap.

**`/api/analyze-dna` is defined directly in `main.py` (line ~877)** as a standalone `@app.post` in addition to the `dna.py` router. This means there are TWO DNA analysis endpoints:
- `POST /api/analyze-dna` (in `main.py`) — guest, rate-limited
- `POST /api/dna/generate` (in `routers/dna.py`) — no auth at all

**`GET /api/portfolio/user/{user_id}`** accepts a `user_id` path param but uses `get_current_user`. There is no check that the requesting user matches `user_id` — an authenticated user can query any other user's portfolios.

**`GET /api/admin/leads/stats`** — note the `stats` segment comes after `{lead_id}` in lexicographic order but before it in the router file (line 292 vs 207). FastAPI resolves by registration order which is correct here, but fragile if reordered.

---

## 4. (Section 4 merged into §3 per original request structure)

---

## 5. What's Working vs What's Not

### Tests

**Backend — pytest**
```
tests/
├── conftest.py
├── test_analyze_dna_multipart.py
├── test_error_responses.py
├── integration/
│   └── test_health.py
└── unit/
    ├── test_ai_router.py
    ├── test_calculator.py
    ├── test_dna_router.py
    ├── test_fx_format.py
    ├── test_market_currency.py
    ├── test_market_resolver.py
    ├── test_portfolio_region.py
    ├── test_quant_engine.py
    ├── test_report_metrics_currency.py
    └── test_ticker_normalizer.py
```

Coverage is **narrow but present** — only unit tests for isolated utility functions plus one integration health test. Zero tests for:
- Auth flows and JWT verification
- Research/synthesiser pipeline
- Swarm/LangGraph agent execution
- Payment/Stripe webhooks
- Admin endpoints
- Advisor endpoints
- Rate limiting logic

**Frontend — Vitest + Playwright**
```
lib/
├── dashboard-ia.test.ts
├── display-text.test.ts
├── finance-content.test.ts
├── research-normalizer.test.ts
└── research-personalization.test.ts
__tests__/components/
├── PaywallOverlay.test.tsx
└── PortfolioPie.test.tsx
qa/
├── neufin-web.spec.ts       (Playwright E2E)
├── smoke-production.spec.ts
├── smoke-staging.spec.ts
└── ui-contrast-smoke.spec.ts
```

Coverage similarly narrow — utility functions and two component tests. Zero tests for:
- Auth login/signup flows
- Dashboard page rendering
- Research article rendering (where the bug-prone implication parsing lives)
- Upload CSV flow
- Swarm chat widget
- Admin panel functionality

### Build Scripts

```json
"dev":           "next dev"            // ✓ standard
"build":         "next build"          // ✓ standard
"start":         "next start"          // ✓
"lint":          "eslint . --ext .ts,.tsx"   // ✓
"test:unit":     "vitest run"          // ✓
"smoke:staging": "playwright test qa/smoke-staging.spec.ts"
"smoke:prod":    "playwright test qa/smoke-production.spec.ts"
```

No `test:coverage`, no pre-commit hook integration, no TypeScript strict-mode check in CI (only ESLint).

**Statically detectable build issues:**

```typescript
// neufin-web/app/partners/page.tsx line 343–345
// These console.log calls are inside a code snippet string — INTENTIONAL (displayed in demo code block)
// Not a real runtime log — FALSE ALARM, but misleading to audit
console.log("DNA Score: ",  result.dna_score)
```

```typescript
// neufin-web/app/api/stripe/webhook/route.ts lines 122–535
// 10+ console.log calls in production webhook handler — should be replaced with structured logger
console.log("[webhook] stripe-signature present:", Boolean(sig));
console.log(`[webhook] Received: ${event.type}`);
```

```typescript
// neufin-web/components/AuthDebugPanel.tsx lines 169–191
// Logs full auth token (first 40 chars), user object, all cookies to console
console.log("Token (first 40):", token?.slice(0, 40));
console.log("Cookies:", cookieMap);
```

**`AuthDebugPanel.tsx` is the most dangerous**: it logs partial JWT tokens and full cookie maps in production. There is no `NODE_ENV` guard. If this component is mounted anywhere in a production layout, it emits sensitive data to every user's browser console.

**Runtime red flags:**

```typescript
// neufin-web/app/dashboard/layout.tsx
// Server component that calls getResearchRegime() — if the backend is down,
// it silently swallows the error and passes null regime.
// The try/catch is correct but there's no indication to the user that regime data is unavailable.
try {
  regime = await getResearchRegime();
} catch {
  regime = null;  // silent degradation — no logging
}
```

```typescript
// neufin-web/lib/product-navigation.ts line 54
// TODO Phase 3: remove CTech AG internal pages entirely.
// This TODO has no ticket reference and "Phase 3" has no definition.
```

---

## 6. (Section 6 merged — see §8 for other critical angles)

---

## 7. Missing / Incomplete / Inconsistent Parts

### Migration Fragmentation — Critical

Five separate migration systems exist with no master state tracking:

| Location | Count | Type |
|----------|-------|------|
| `/migrations/` (root) | 5 `.sql` files | Raw Supabase SQL |
| `/neufin-backend/supabase_migrations*.sql` | 9+ files | Raw SQL (v1–v9) |
| `/neufin-backend/supabase_setup_complete.sql` | 1 file | Setup dump |
| `/neufin-backend/db/migrations/` | 2 `.sql` files | Raw SQL |
| `/neufin-backend/migrations/` | 2 `.sql` files | Raw SQL |
| `/neufin-backend/alembic/versions/` | 4 Python files | Alembic migrations |

**There is no way to determine the current schema state** from these files without manually running each in order. The `db/MIGRATION_STATUS.md` file exists but cannot be authoritative across all 5 systems.

The `db/apply_pending_migrations.sql` file implies manual SQL execution is the actual deployment workflow — this is a production incident waiting to happen.

### Partially Implemented Features

**`/app/dashboard/deals/page.tsx`** — exists as a route but not listed in any navigation menu (checked `DashboardSidebar`). Deals feature appears stub or hidden.

**`/app/dashboard/cos/page.tsx`** — "COS" (Cost of Sales?) page exists but not in sidebar navigation. Unclear if this is intentional or forgotten.

**`/app/dashboard/revenue/page.tsx`** — exists at dashboard level AND there's a separate `/admin/revenue/page.tsx`. Both call different API endpoints but may display the same data.

**`services/celery_app.py`** — Celery is configured in the codebase but there is no Celery worker in `docker-compose.yml`, Railway deployment, or any process manager config. Background tasks use FastAPI's `BackgroundTasks` (synchronous thread pool), not Celery. The `celery_app.py` is dead code.

**`neufin-agent/`** — The `DEPRECATED.md` states the agent has been replaced by the backend's swarm service. However:
- `railway.json` still references deployment
- `vercel.json` still present
- `Procfile` still present
- `.github/workflows/ci.yml` still runs CI for it
- `main.py` still imports and runs
This is a confusing and wasteful active deployment of deprecated code.

### API Contract Mismatches (Frontend ↔ Backend)

**Frontend `/api/agent-os/status/route.ts` vs backend:**
The frontend has a dedicated `/api/agent-os/status` route AND a catch-all `/api/agent-os/[...path]` proxy. The static `status` route will be shadowed by the dynamic catch-all in some Next.js versions. This should be verified.

**`/app/api/portfolio/chart/[ticker]/route.ts`** — no auth on frontend proxy, but `GET /api/portfolio/chart/{symbol}` on backend requires `get_current_user`. The frontend proxy doesn't forward the auth cookie, meaning this endpoint will always return 401 from the backend. This chart endpoint is likely always broken.

**Research regime endpoint:**
- Frontend: `app/api/research/regime/route.ts` proxies to backend
- Backend: `GET /api/research/regime` requires `get_current_user`
- But `app/dashboard/layout.tsx` calls `getResearchRegime()` as a server component without guaranteed auth context → will silently fail every time for SSR pre-auth render

### Missing Documentation

- No OpenAPI/Swagger doc published (FastAPI auto-generates at `/docs` but it's unclear if this is exposed in production)
- No type-safe API client — the frontend uses plain `fetch` with manual type casting throughout `lib/api.ts`
- No `CONTRIBUTING.md`
- `docs/API.md` appears to be manually maintained — it's certainly out of sync with the 80+ actual endpoints
- No changelog automation (CHANGELOG.md appears manually written)

---

## 8. Other Critical Angles

### Authentication & Authorization

**Architecture:**
- Supabase handles identity (Google OAuth + email/password)
- JWTs verified server-side via JWKS with 1-hour cache + HS256 fallback
- Cookie-based session: `neufin-auth` + `sb-access-token`
- Custom `get_current_user` / `get_admin_user` / `get_subscribed_user` / `get_ops_user` dependency chain

**What works:**
- JWKS-based JWT verification with key rotation support ✓
- ES256 and HS256 algorithm support ✓
- Algorithm pre-check (prevents algorithm confusion attacks) ✓
- `verify_aud` enforced ✓
- Subscription tier gating via `get_subscribed_user` on AI endpoints ✓
- Admin check with DB role + email allowlist fallback ✓
- 60-second JWT leeway (reasonable for clock skew) ✓

**Problems:**

```python
# neufin-backend/services/auth_dependency.py — BYPASS AUTH BUG
# If BYPASS_AUTH_IN_DEV=true is accidentally set in a Railway production env,
# all auth is bypassed and every request returns a dummy user
if _BYPASS_AUTH:
    return JWTUser(id="dev-bypass-user", email="dev@local")
```
There is no check that `ENVIRONMENT != "production"` before honoring this flag.

```typescript
// neufin-web/app/admin/layout.tsx — ADMIN BYPASS BUG
function backendBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "";  // returns "" if unset
}
// ...
if (!base) {
  return "ok";  // ← If NEXT_PUBLIC_API_URL is not set, ALL access is granted
}
```
This is a hard security bug. If the env var is missing (e.g., fresh Vercel preview deployment without env vars configured), every visitor can access every `/admin/*` page.

```typescript
// DashboardShell.tsx — SSR FOUC
// Dashboard layout is a server component but DashboardShell is "use client"
// SSR renders children content → hydration fires → useEffect redirect
// There is a window where unauthenticated users see dashboard content
useEffect(() => {
  if (!loading && !user) router.replace("/login");
}, [loading, user, router]);
```

**No CSRF protection** on the cookie-setting endpoint (`/api/auth/set-cookie`). Requests setting `neufin-auth` cookie have no origin/referer validation or CSRF token.

**`get_current_user` silently starts trials** (`_ensure_trial_started_at`) on every authenticated request — this is correct business logic but could be surprising and could cause phantom trial starts if a token is replayed.

### Database / ORM Layer

**Stack:** Supabase (PostgreSQL) via `supabase-py` SDK. No SQLAlchemy ORM. Raw PostgREST queries.

**Problems:**

No parameterized queries — all queries go through the PostgREST client which handles injection at the library level, but this makes it impossible to write complex queries efficiently (no JOINs, no CTEs). Several endpoints make N+1 queries (e.g., advisor client list fetching analysis for each client in a loop).

```python
# neufin-backend/database.py — single global Supabase client
# This is a synchronous client used in async FastAPI handlers
# The supabase-py sync client is blocking; it runs in the thread pool
# Under high load this will exhaust the thread pool
supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
```

The Supabase client uses the **service role key** (bypasses RLS) for all backend operations. There is no per-request RLS enforcement at the backend level — all data access authorization is manual code. A bug in any query filter leaks data.

**Schema state is unknown** without manually reconciling all 5 migration systems (see §7).

**Alembic is configured** (`alembic/env.py`) but only has 4 migration files and targets a `DATABASE_URL` env var. Supabase is the actual database. It's unclear if Alembic actually runs in production or if it's aspirational.

### Error Handling & Logging

**Backend:**
- `structlog` with JSON formatting in production ✓
- `trace_id` injected per-request via middleware ✓
- Sentry integration with user context ✓
- `X-Trace-Id` response header ✓

**Problems:**
- Most route handlers catch broad `Exception` and return generic 500 — no distinction between retryable vs non-retryable errors
- No standardized error response schema (some return `{"detail": str}`, others return `{"code": str, "message": str}`, others return raw strings)
- FastAPI's default validation error format (422) is exposed directly — leaks internal field names

**Frontend:**
- Only ONE `error.tsx` at `app/error.tsx` — no sub-route error boundaries
- No error boundary around dashboard, admin, or research sub-trees
- Stripe webhook handler uses `console.log` throughout instead of structured logging

```typescript
// app/error.tsx — the only error boundary in the entire app
console.error("[Neufin error boundary]", error);  // logs to server console ✓
// But no sub-route boundaries means one bad component crashes the entire page
```

### State Management (Frontend)

- Auth state: React Context (`lib/auth-context.tsx`) — singleton `useAuth()` hook ✓
- Portfolio data: local `useState` + direct API calls in components — no global cache
- Research data: component-local `useState` — no SWR/React Query
- Dashboard data: per-page `useEffect` + fetch — no deduplication

**No data-fetching library** (SWR, React Query, TanStack Query). Every page component manages its own loading/error states independently, leading to inconsistent UX patterns and redundant API calls when navigating between dashboard pages.

### Caching & Rate Limiting

**Caching:**
| Layer | Implementation | Problem |
|-------|---------------|---------|
| Market data (5-min) | In-process `dict` | Dies on every deploy; wrong with multiple workers |
| Leaderboard (5-min) | In-process `dict` | Same |
| JWKS (1-hour) | In-process `dict` | Same — each worker fetches independently |
| Subscription status (60s) | In-process `dict` | Same — bypassed on every restart |

All caches are in-process Python dicts. Railway deploys with a rolling restart which means **every deploy flushes all caches simultaneously**, causing a thundering herd against Supabase and external APIs.

**Rate Limiting:**
| Endpoint | Limit | Implementation |
|----------|-------|---------------|
| `POST /api/analyze-dna` (guest) | 3/IP/24h | In-process `dict` counter ⚠️ |
| All swarm/LLM endpoints | None | ❌ |
| All authenticated endpoints | None | ❌ |
| Admin API | None | ❌ (relies on admin auth only) |

The guest DNA rate limit counter is stored in-process, meaning:
1. It resets on every deployment
2. It's per-worker (if multiple uvicorn workers: each allows 3, effective limit = 3×workers)
3. Railway auto-restarts bypass it entirely

### Testing Strategy

**Coverage summary:** Estimated < 15% on backend, < 10% on frontend. Critical paths (auth, payments, research synthesis, swarm execution) have zero test coverage.

**No contract tests** between frontend API route handlers and the FastAPI backend.

**No load/performance tests** despite the product having expensive LLM operations.

**Playwright smoke tests** cover happy paths only — no negative tests, no auth failure cases, no error state testing.

### Accessibility

- `DashboardShell` mobile nav drawer has `role="dialog" aria-modal="true"` ✓
- No `aria-label` audit possible statically for all 60+ components
- No `lang` attribute visible in `layout.tsx` `<html>` tag (should be `lang="en"`)
- No skip-to-main-content link
- No keyboard navigation tests in Playwright suite
- Static blog pages appear to have no semantic heading hierarchy audit

```tsx
// neufin-web/app/layout.tsx
<html className={`${geistSans.variable} ${geistMono.variable}`}>
// Missing lang="en" — screen readers may not announce content language correctly
```

### SEO

- `app/sitemap.ts` exists ✓
- `not-found.tsx` at root ✓
- `robots.txt` — not found in file search (should verify)
- OG meta tags present on landing pages ✓
- Blog pages are static and crawlable ✓
- Dashboard pages correctly excluded from crawlers (client-side auth)

### Scalability & Deployment Readiness

**Docker:**
- `neufin-backend/Dockerfile` present ✓
- `output: "standalone"` in Next.js config ✓
- `docker-compose.yml` at root and in `neufin-backend/` and `infrastructure/docker/`

**Railway (backend):**
- `railway.toml` ✓
- `nixpacks.toml` for build ✓
- Healthcheck at `/health` ✓

**Vercel (frontend):**
- Deployed from `main` branch
- `.vercel/project.json` committed ✓ (acceptable — contains only project ID)

**Scalability Problems:**
1. **No Redis** — all caches are in-process, all rate limiting is in-process. Cannot horizontally scale.
2. **Single Supabase sync client** — blocking I/O in async handlers. Should use `supabase-py` async client or `asyncpg` directly.
3. **Background tasks via FastAPI `BackgroundTasks`** — runs in the same thread pool as request handlers. Heavy AI/PDF generation tasks can starve request handling.
4. **LangGraph swarm** runs synchronously within request handlers (or `BackgroundTasks`). Under load, all uvicorn workers will be occupied waiting for LLM responses.
5. **No queue** — jobs submitted to swarm analysis are tracked in-memory (Supabase polling). A crash loses all in-flight jobs.

### CI/CD

**Workflows:**

| Workflow | Trigger | Does |
|----------|---------|------|
| `ci-backend.yml` | Push to `main`/`develop` | pytest + ruff |
| `ci-web.yml` | Push to `main`/`develop` | ESLint (no `next build`!) |
| `ci-mobile.yml` | Push | Unknown |
| `deploy-backend.yml` | Push to `main` | Railway deploy |
| `deploy-web.yml` | Push to `main` | Vercel deploy |
| `release-gate.yml` | Release created | Unknown |
| `security-scan.yml` | Push | Bandit (Python) |

**CI/CD Problems:**
- `ci-web.yml` runs ESLint but NOT `next build` — TypeScript errors and import failures won't be caught
- No frontend test run in CI (`vitest run` not in any workflow)
- No `npm run build` in CI means broken builds can reach production
- `SECRETS.md` in `.github/` directory — documents secret names, which is fine, but verify it contains no actual secret values
- `dependabot.yml` is configured ✓

**Environment Separation:**
- `ENVIRONMENT` env var used in backend (`development | staging | production`) ✓
- `BYPASS_AUTH_IN_DEV` flag exists ⚠️ (no production guard)
- No staging-specific Next.js config
- No feature flags system

---

## 9. Next Steps for Me

Run these commands to deepen or verify the audit:

### Verify the admin bypass bug
```bash
# Simulate what happens when NEXT_PUBLIC_API_URL is unset
cd neufin-web
NEXT_PUBLIC_API_URL="" node -e "console.log(process.env.NEXT_PUBLIC_API_URL ?? '')"
# Should print empty string — admin layout will return "ok" and grant access
```

### Check for actual TypeScript build errors
```bash
cd neufin-web
npx tsc --noEmit 2>&1 | head -60
# CI doesn't run this — find out what errors exist in production code
```

### Run backend tests with coverage
```bash
cd neufin-backend
source .venv/bin/activate
pytest --cov=. --cov-report=term-missing --ignore=.venv 2>&1 | tail -40
```

### Find all files that import AuthDebugPanel
```bash
grep -rn "AuthDebugPanel" /Users/varunsrivastava/projects/neufin/neufin-web --include="*.tsx" --include="*.ts"
# If it appears in any layout or page, it's leaking tokens in production
```

### Verify robots.txt exists
```bash
ls /Users/varunsrivastava/projects/neufin/neufin-web/public/robots.txt 2>/dev/null || echo "MISSING"
```

### Check for duplicate route conflicts in FastAPI
```bash
cd neufin-backend
source .venv/bin/activate
python -c "
from main import app
routes = [(r.methods, r.path) for r in app.routes if hasattr(r, 'methods')]
from collections import Counter
counts = Counter((m, p) for methods, p in routes for m in (methods or []))
print([x for x in counts.items() if x[1] > 1])
"
```

### Find N+1 queries in routers
```bash
grep -rn "for.*in.*result\|for.*in.*data\|\.execute()" \
  /Users/varunsrivastava/projects/neufin/neufin-backend/routers --include="*.py" \
  --exclude-dir=__pycache__ | grep -v "^Binary" | head -40
```

### Audit what AuthDebugPanel logs
```bash
grep -n "console\." /Users/varunsrivastava/projects/neufin/neufin-web/components/AuthDebugPanel.tsx
```

### Check if celery is actually used anywhere
```bash
grep -rn "celery_app\|@app\.task\|\.delay()\|\.apply_async" \
  /Users/varunsrivastava/projects/neufin/neufin-backend --include="*.py" \
  --exclude-dir=.venv --exclude-dir=__pycache__
```

### Verify the portfolio user_id authorization hole
```bash
# Check routers/portfolio.py GET /user/{user_id} for user_id == current_user.id check
grep -A 20 "user/{user_id}" /Users/varunsrivastava/projects/neufin/neufin-backend/routers/portfolio.py
```

### Check if the frontend CI workflow runs tests
```bash
cat /Users/varunsrivastava/projects/neufin/.github/workflows/ci-web.yml
```

### Full ruff lint of backend (excluding .venv)
```bash
cd neufin-backend
source .venv/bin/activate
ruff check . --exclude .venv --statistics 2>&1 | tail -20
```

### ESLint check on frontend
```bash
cd neufin-web
npx eslint . --ext .ts,.tsx --max-warnings 0 2>&1 | tail -30
```

---

## Priority Action Items

| Priority | Item | File | Effort |
|----------|------|------|--------|
| P0 | Fix admin bypass — remove `if (!base) return "ok"` | `neufin-web/app/admin/layout.tsx:15` | 5 min |
| P0 | Add `middleware.ts` with Supabase session guard | New file | 2 hours |
| P0 | Gate `AuthDebugPanel` behind `NODE_ENV !== 'production'` or delete it | `components/AuthDebugPanel.tsx` | 15 min |
| P0 | Add production guard for `BYPASS_AUTH_IN_DEV` | `services/jwt_auth.py` | 5 min |
| P1 | Replace swarm `get_optional_user` with `get_current_user` + subscription gate | `routers/swarm.py` | 1 hour |
| P1 | Fix advisor router to use `get_subscribed_user` | `routers/advisor.py` | 30 min |
| P1 | Secure Agent Studio endpoints | `routers/agent_studio.py` | 30 min |
| P1 | Add `next build` to `ci-web.yml` | `.github/workflows/ci-web.yml` | 15 min |
| P1 | Add `lang="en"` to `<html>` in layout.tsx | `app/layout.tsx` | 2 min |
| P2 | Add `vitest run` to `ci-web.yml` | `.github/workflows/ci-web.yml` | 15 min |
| P2 | Replace `console.log` in webhook handler with structured logger | `app/api/stripe/webhook/route.ts` | 1 hour |
| P2 | Consolidate migrations to alembic + single Supabase migration dir | All migration files | 1 day |
| P2 | Add user_id ownership check to `GET /api/portfolio/user/{user_id}` | `routers/portfolio.py` | 30 min |
| P2 | Delete dead `services/celery_app.py` or wire up actual Celery worker | `services/celery_app.py` | 1 hour |
| P2 | Deprecate / undeploy `neufin-agent` completely | `neufin-agent/` | 1 hour |
| P3 | Add Redis for rate limiting + distributed caching | New infra | 1 day |
| P3 | Switch Supabase client to async client | `database.py` | 4 hours |
| P3 | Add React Query / SWR for frontend data fetching | Frontend-wide | 2 days |
| P3 | Organize `components/` into feature-based sub-folders | Frontend-wide | 4 hours |
| P3 | Add auth + payment coverage to test suites | Tests | 2 days |
