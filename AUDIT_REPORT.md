# NEUFIN PRODUCTION READINESS AUDIT REPORT
**Date:** March 26, 2026
**Scope:** neufin-backend/, neufin-web/, neufin-mobile/ (complete source inspection)

---

## SECTION 1 — BROKEN FUNCTIONALITY

### 1.1 Google OAuth Flow (Supabase + Next.js Callback)

**Feature Name:** Google OAuth Authentication Flow

**Affected Files:**
- `neufin-web/app/auth/page.tsx`
- `neufin-web/app/auth/callback/page.tsx`
- `neufin-backend/services/jwt_auth.py`
- `neufin-backend/main.py` (lines 122–159)

**Root Cause:** Flow is functional end-to-end. PKCE code exchange handled by Supabase JS via `onAuthStateChange`, 10-second fallback timer prevents infinite spinner, anonymous record claim on login.

**Status:** FUNCTIONAL — No breaking issues.

**Fix Complexity:** N/A

---

### 1.2 JWT Auth Middleware (Soft Attach vs Hard Reject)

**Feature Name:** JWT Authentication Middleware Behavior

**Affected Files:**
- `neufin-backend/main.py` (lines 122–159) — soft attach
- `neufin-backend/services/auth_dependency.py` — hard reject per endpoint
- `neufin-backend/services/jwt_auth.py` — token verification

**Root Cause:** Design is intentional. Middleware soft-attaches JWT to `request.state.user` for all requests. Protected endpoints call `Depends(get_current_user)` which raises 401. Public endpoints have no dependency. No inconsistency — dual-layer design is correct.

**Status:** FUNCTIONAL — Working as designed.

**Fix Complexity:** N/A

---

### 1.3 Android App — Hardcoded & Demo Data

**Feature Name:** Mobile App Data Sources

| Screen / File | Hardcoded Value | Impact | Complexity |
|---|---|---|---|
| `neufin-mobile/lib/api.ts:1` | `const API = 'https://neufin101-production.up.railway.app'` | Cannot point to staging without rebuild | XS |
| `neufin-mobile/screens/ResultsScreen.tsx:14` | Same URL duplicated | Two sources of truth | XS |
| `neufin-mobile/screens/UploadScreen.tsx:15–19` | Sample CSV (AAPL/MSFT/GOOGL/NVDA) | Intentional UX aid | N/A |
| `neufin-mobile/screens/PortfolioSyncScreen.tsx` | DEMO_PORTFOLIOS constant — 3 mock portfolios | Intentional demo mode | N/A |
| `neufin-mobile/screens/AnalysisScreen.tsx` | DEMO_REPORT constant — mock swarm output | Intentional demo mode | N/A |
| `neufin-mobile/screens/SwarmReportScreen.tsx` | DEMO_SWARM constant | Intentional demo mode | N/A |
| `neufin-mobile/screens/SwarmAlertsScreen.tsx` | DEMO_REPORT_ALERTS + DEMO_ALERTS constants | Intentional demo mode | N/A |

**Note:** All screens currently use demo data because auth was removed to fix the loading-screen hang. This is intentional for the current build.

**Fix Complexity:** XS (API URL consolidation); demo mode is intentional

---

### 1.4 Stripe Webhook → PDF Generation → User Notification Chain

**Feature Name:** Payment Processing & PDF Report Fulfillment

**Affected Files:**
- `neufin-backend/routers/payments.py` (lines 225–289) — webhook handler
- `neufin-backend/routers/payments.py` (lines 53–104) — `_generate_and_store_pdf()`
- `neufin-backend/routers/reports.py` (lines 53–156) — PDF generation

**Chain Trace:**
1. `POST /api/reports/checkout` → creates pending advisor_report (is_paid=False), returns Stripe checkout_url
2. User pays → Stripe fires `checkout.session.completed` webhook
3. Webhook marks report paid + calls `_generate_and_store_pdf()` (awaited)
4. Frontend polls `GET /api/reports/fulfill?report_id=...` for pdf_url

**Breaking Issues:**

**Issue 1 — PDF Generation Race Condition** (payments.py:257–262)
- PDF generation is awaited inside webhook handler. If `/api/reports/fulfill` is called before webhook completes, pdf_url is null.
- **Severity:** MEDIUM

**Issue 2 — Missing Notification Service**
- No email or push notification when PDF is ready.
- User relies entirely on success page polling the fulfill endpoint.
- **Severity:** MEDIUM

**Issue 3 — Silent Failure on PDF Error**
- If `_generate_and_store_pdf()` throws, error is logged but report remains paid with null pdf_url.
- User is charged but cannot access their report.
- **Severity:** HIGH

**Fix Complexity:** M (Background job queue + email notification + retry mechanism)

---

### 1.5 Missing Backend API Endpoints Referenced in Mobile

**Feature Name:** Mobile API Contract

**Missing Endpoint #1: `GET /api/portfolio/list`**
- Referenced: `neufin-mobile/lib/api.ts:64`
  ```typescript
  const res = await fetch(`${API}/api/portfolio/list`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  ```
- Backend: Not found in any router. Closest is `/api/portfolio/user/{user_id}` which requires UUID in path.
- **Impact:** Mobile app cannot load user's saved portfolios after login — core feature broken.
- **Fix Complexity:** S

**Missing Endpoint #2: `GET /api/swarm/report/latest`**
- Referenced: `neufin-mobile/lib/api.ts:85–92`
  ```typescript
  const res = await fetch(`${API}/api/swarm/report/latest`, ...)
  ```
- Backend: Only `/api/swarm/report/{report_id}` exists (requires explicit ID).
- **Impact:** Mobile cannot fetch user's most recent swarm analysis.
- **Fix Complexity:** S

---

### 1.6 Analytics Events Table (Commented Out)

**Feature Name:** Analytics Funnel Tracking

**Affected Files & Lines:**
- `neufin-backend/main.py:225–226` — `dna_upload_started` commented out
- `neufin-backend/main.py:383–384` — `dna_analysis_complete` commented out
- `neufin-backend/services/analytics.py:1–35` — `track()` function exists, swallows all errors silently
- `neufin-backend/routers/payments.py:207` — `track("checkout_initiated")` will fail silently
- `neufin-backend/routers/market.py:198` — `track()` called, will fail silently

**Root Cause:** `analytics_events` table does not exist in Supabase. All `track()` calls either commented out or silently failing.

**Impact:** Zero funnel visibility. Cannot track dna_upload → checkout → payment → report_fulfilled.

**Fix Complexity:** S (Create table, uncomment 2 lines in main.py)

---

### 1.7 GET /api/swarm/report/latest (Confirmed Missing)

See Section 1.5, Issue #2.

**Status:** CONFIRMED MISSING — 404 for all mobile clients.

**Fix Complexity:** S

---

### 1.8 GET /api/portfolio/list (Confirmed Missing)

See Section 1.5, Issue #1.

**Status:** CONFIRMED MISSING — breaks authenticated portfolio listing on mobile.

**Fix Complexity:** S

---

## SECTION 2 — SECURITY VULNERABILITIES

### 2.1 Hardcoded Secrets & API Keys

**Scan Result:** No hardcoded secrets found in source code.

- All keys loaded from environment variables via `neufin-backend/config.py`
- No `.env` files committed (`.env.example` only)
- JWT keys fetched from JWKS endpoint, never hardcoded
- Mobile contains no tokens

**Status:** SECURE ✓

---

### 2.2 CORS Misconfiguration

**Affected File:** `neufin-backend/main.py:69–119`

**Finding 1 — Overly Broad Vercel Regex** (MEDIUM)
```python
allow_origin_regex = r"https://[a-zA-Z0-9\-]+\.vercel\.app"
```
- Matches **any** Vercel deployment globally, including forks, malicious repos, and PR previews from contributors
- Combined with `allow_credentials=True`, allows cookie/auth-bearing requests from untrusted origins
- Should be scoped: `r"https://neufinapk1[a-zA-Z0-9\-]*\.vercel\.app"` or explicit list

**Finding 2 — No Staging Domain in Allowlist** (LOW)
- Vercel PR previews hit production backend (no staging domain configured)
- `ALLOWED_ORIGINS` env var provides override capability (line 71–75) — partial mitigation

**Fix Complexity:** S

---

### 2.3 Endpoints Missing Authentication

**Affected File:** `neufin-backend/routers/portfolio.py`

| Endpoint | Issue | Severity |
|---|---|---|
| `GET /api/portfolio/user/{user_id}` (line 270) | Any caller with a UUID can list another user's portfolios — no ownership check | MEDIUM |
| `GET /api/portfolio/{portfolio_id}/sentiment` (line 245) | Exposes any portfolio's sentiment data by UUID | LOW |
| `POST /api/portfolio/signals` (line 183) | Accepts `user_id` from request body; no JWT validation; attacker can attribute signals to other users | MEDIUM |

**Fix Complexity:** M

---

### 2.4 Rate Limiting Gaps

**Finding:** Zero rate limiting on any endpoint. No SlowAPI, no nginx throttle, no custom middleware.

**High-Risk Unprotected Endpoints:**

| Endpoint | Risk | Impact |
|---|---|---|
| `POST /api/analyze-dna` | Concurrent large CSVs → OOM, API quota exhaustion | HIGH |
| `POST /api/swarm/analyze` | Parallel swarm runs → expensive AI API costs | HIGH |
| `POST /api/swarm/chat` | Spam → expensive AI calls | MEDIUM |
| `GET /api/portfolio/chart/{symbol}` | Rapid requests → Finnhub/AV rate limit blackout | MEDIUM |
| `POST /api/reports/checkout` | Fake Stripe session spam | LOW |

**Fix Complexity:** M (SlowAPI or per-IP throttle middleware)

---

### 2.5 Prompt Injection Risks

**Status:** Partially mitigated.

**Protected:** `POST /api/swarm/chat` and `POST /api/swarm/global-chat` — regex guard blocks jailbreak patterns + credential shapes (`sk-*`, `eyJ*`, `AKIA*`)

**Unprotected:** `POST /api/analyze-dna` (main.py:310–327) — user-supplied CSV symbols interpolated directly into AI prompt. Minimal practical risk (symbols constrained to `\w+` by CSV parsing), but not sanitized.

**Fix Complexity:** S

---

### 2.6 Sensitive Data in Logs

**Scan Result:** No sensitive data logged.

- JWT values never logged (only rejection messages)
- API keys not echoed in startup logs
- User PII (email, names) not logged in request handlers

**Status:** SECURE ✓

---

## SECTION 3 — ENTERPRISE GAPS

### 3.1 CI/CD Infrastructure

**Present:**
- `neufin-backend/Dockerfile` + `railway.toml` — Railway push-to-deploy
- `docker-compose.yml` — local dev
- Vercel automatic deploy on push (frontend)

**Missing:**
- No `.github/workflows/` — no GitHub Actions
- No automated test gate before deploy
- No build status badge
- No deployment preview blocking (Vercel deploys even if tests fail)

**Impact:** Broken code ships directly to production on `git push`.

**Fix Complexity:** M

---

### 3.2 Error Monitoring

**Missing:** No Sentry, Rollbar, Bugsnag, or equivalent.

**Current state:**
- Backend errors → `print(..., file=sys.stderr)` → Railway log stream
- Frontend errors → Next.js default error boundary
- Mobile crashes → no crash reporter

**Impact:** Production errors only discoverable by manually checking Railway/Vercel logs. No alerting, no stack trace aggregation, no error trends.

**Fix Complexity:** M (Sentry SDK for all three layers)

---

### 3.3 API Versioning

**Finding:** All routes use `/api/...` with no version prefix.

**Impact:** Cannot make breaking API changes without breaking all existing clients simultaneously. No deprecation path.

**Fix Complexity:** M (Add `/api/v1/` prefix, maintain backward-compatible redirects)

---

### 3.4 Staging Environment

**Finding:** No dedicated staging environment.

**Current:**
- Production Railway backend at `neufin101-production.up.railway.app`
- Vercel PR previews → **hit production backend**
- No staging Supabase instance
- No staging Stripe keys

**Impact:**
1. Cannot test breaking backend changes without risking production data
2. No safe environment to test payment flows
3. PR previews run against real user data

**Fix Complexity:** L

---

### 3.5 Admin Capabilities

**Present:**
- `GET /health` — basic health check
- `GET /api/admin/health` — feature/provider status

**Missing:**
- User management (list, suspend, delete accounts)
- Analytics query interface
- Audit logs (who accessed what)
- Payment refund/chargeback handling
- Manual data correction endpoints
- Feature flags

**Fix Complexity:** L

---

### 3.6 Test Coverage

| Layer | Test Files | Coverage Estimate |
|---|---|---|
| Backend | `tests/test_analyze_dna_multipart.py`, `scripts/smoke_test.py`, `scripts/prod_smoke_test.py` | ~5% |
| Web Frontend | None | 0% |
| Mobile | None | 0% |

**No CI integration** — tests are not run automatically on commit.

**Fix Complexity:** L

---

## SECTION 4 — TECHNICAL DEBT

### 4.1 Duplicate Code

**Issue 1 — API URL duplicated in mobile** (LOW)
- `neufin-mobile/lib/api.ts:1`
- `neufin-mobile/screens/ResultsScreen.tsx:14`
- Both define same hardcoded Railway URL. ResultsScreen should import from api.ts.
- **Fix Complexity:** XS

**Issue 2 — No code duplication in backend routers** — shared services (calculator, ai_router, pdf_generator) are correctly imported and reused.

---

### 4.2 Inconsistent Error Handling

**Three patterns across backend:**

**Pattern 1 — Raise HTTPException** (most routers — correct)
```python
except Exception as e:
    raise HTTPException(status_code=500, detail=str(e))
```
- Leaks internal error details in `detail` field — should sanitize.

**Pattern 2 — Silent log and continue** (analytics.py, parts of payments.py)
```python
except Exception as e:
    print(f"[Service] failed: {e}")
    # continues silently
```
- Appropriate for non-critical paths (analytics), dangerous for payment/PDF paths.

**Pattern 3 — Nested try with no rollback** (payments.py:66–104)
- PDF marked paid before generation completes; no rollback on failure.
- User charged, report unavailable.

**Fix Complexity:** M

---

### 4.3 Dead Code / Unused Imports

**Disabled (intentional, pending):**
- `main.py:225,383` — analytics track calls (pending table creation)
- `database.py` — Fernet encryption graceful fallback
- `market_cache.py` — Redis tier graceful fallback

**No genuine dead code or unused imports detected.** All commented-out code is annotated with reason.

---

### 4.4 Missing TypeScript Types

**Web frontend components with loose typing:**
- `neufin-web/components/RiskMatrix.tsx` — `any` in props/chart data
- `neufin-web/components/AgentChat.tsx` — untyped message objects
- `neufin-web/components/SlidingChatPane.tsx` — untyped props
- `neufin-web/components/CommandPalette.tsx` — `any` for command items
- `neufin-web/components/GlobalChatWidget.tsx` — untyped API responses
- `neufin-web/components/PortfolioPie.tsx` — untyped chart data

**Fix Complexity:** S

---

### 4.5 TODOs / Disabled Code Inventory

| File | Line | Note |
|---|---|---|
| `main.py` | 225, 383 | Analytics disabled — awaiting `analytics_events` table |
| `payments.py` | 201 | Comment about Stripe async fix (resolved) |
| `stress_tester.py` | multiple | Hardcoded scenarios — intentional |
| `market_cache.py` | header | Redis disabled — graceful fallback |
| `database.py` | 48–75 | Fernet optional — graceful fallback |

No unresolved TODOs or FIXMEs found.

---

## MASTER PRIORITY TABLE

| Priority | Finding | Severity | Complexity |
|---|---|---|---|
| **P0** | Missing `/api/portfolio/list` (mobile broken) | CRITICAL | S |
| **P0** | Missing `/api/swarm/report/latest` (mobile broken) | CRITICAL | S |
| **P0** | Stripe PDF silent failure — user charged, no report | HIGH | M |
| **P1** | Portfolio endpoints missing auth (data leak) | MEDIUM | M |
| **P1** | CORS regex too broad (any Vercel app) | MEDIUM | S |
| **P1** | Zero rate limiting on expensive endpoints | MEDIUM | M |
| **P1** | No error monitoring (Sentry) | MEDIUM | M |
| **P1** | No CI/CD pipeline | HIGH | M |
| **P2** | analytics_events table missing | MEDIUM | S |
| **P2** | Prompt injection in DNA endpoint | LOW | S |
| **P2** | API URL duplicated in mobile | LOW | XS |
| **P2** | TypeScript strict types missing (web) | LOW | S |
| **P3** | No staging environment | HIGH | L |
| **P3** | No API versioning | MEDIUM | M |
| **P3** | No admin endpoints | MEDIUM | L |
| **P3** | Test coverage < 5% | MEDIUM | L |
| **P3** | Inconsistent error handling patterns | LOW | M |

---

## RECOMMENDED FIX SEQUENCE

### Sprint 1 — Production Blockers (this week)
1. Add `GET /api/portfolio/list` (auth-gated, returns user's portfolios)
2. Add `GET /api/swarm/report/latest` (auth-gated, returns most recent by user)
3. Fix Stripe PDF silent failure (add error state + user notification)

### Sprint 2 — Security Hardening (next 2 weeks)
4. Add ownership checks to 3 portfolio endpoints
5. Narrow CORS regex to project-specific Vercel pattern
6. Add SlowAPI rate limiting to DNA, swarm, and chart endpoints
7. Set up Sentry (backend + frontend + mobile)

### Sprint 3 — Observability & Quality (1 month)
8. Create `analytics_events` table + enable funnel tracking
9. Set up GitHub Actions CI (lint → test → deploy gate)
10. Add API versioning prefix `/api/v1/`

### Sprint 4 — Scale & Operations (2–3 months)
11. Provision staging environment (Railway + Supabase + Stripe test mode)
12. Build admin API surface
13. Increase test coverage to 60%+

---

*Report generated: March 26, 2026 | Full source inspection across 3 layers | 40+ endpoints audited*
