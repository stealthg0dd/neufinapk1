# NeuFin Frontend & Dashboard Audit
**Date:** 10 April 2026
**Scope:** `neufin-web/` primary audit, with linked backend causes in `neufin-backend/`

---

## Executive Summary

The backend has substantial functionality, but the **web UX is split across multiple partially disconnected product flows**:

1. `upload -> results` = guest DNA analysis flow
2. `dashboard/portfolio` = authenticated DNA + charts flow
3. `swarm` = separate institutional / multi-agent IC analysis flow
4. `vault` / `reports/success` = report history + post-payment delivery flow

These flows are **not unified in routing, storage, or state handoff**, which is why the product feels broken even though many backend features exist.

### Current assessment
- **Architecture quality:** strong backend capability, weak frontend orchestration
- **User experience:** fragmented and confusing
- **Production reliability:** not yet stable for institutional-grade advisor workflow
- **Main failure pattern:** long-running synchronous work (AI + market data + PDF generation) inside request/response pages

---

## Verified Live Reproduction Evidence

### 1) Holdings chart endpoint
Verified with live request:

```text
GET https://neufin-web.vercel.app/api/portfolio/chart/TSM?period=3mo
status=404
{"error":"not_found","message":"No data for TSM", ...}
```

### 2) Research inconsistency
Verified with live requests:

```text
GET /api/research/blog?page=1&limit=5   -> 200, []
GET /api/research/notes?limit=5         -> 200, returns live notes
```

This confirms the dashboard can show notes while the public research hub can still appear empty.

### 3) Swarm analysis timeout/hang
A minimal live POST to `/api/swarm/analyze` did **not return within the terminal run window** and had to be interrupted. This matches the user-facing timeout / `502` behavior.

---

## Frontend Route Map & What Each Tab Actually Does

| Area | Route | Intended purpose | Current reality | Status |
|---|---|---|---|---|
| Landing | `/` | Marketing + entry point | Works, but not tied cleanly to auth/dashboard state | 🟡 |
| Auth | `/auth`, `/login`, `/signup`, `/auth/callback` | Sign in / onboarding | Duplicated route patterns and cookie-sync race risk | 🟡 |
| Home | `/dashboard` | Advisor cockpit / daily overview | Mostly wired; shows regime + notes summary | 🟢 |
| Portfolio | `/dashboard/portfolio` | Portfolio upload + advisor workflow | Runs DNA analysis only, not full swarm/IC memo flow | 🟡 |
| Swarm | `/swarm` | Multi-agent portfolio intelligence | Real institutional analysis page, but slow/hanging | 🟡 |
| Vault | `/vault` | Saved analysis/report history | Partially useful, but conceptually overlaps with reports | 🟡 |
| Reports | `/reports/success` | Post-payment delivery page | Incorrectly used as a navigation destination | 🔴 |
| Research | `/research` | Public research intelligence feed | Empty because it uses `/api/research/blog` | 🔴 |
| Dashboard Research | `/dashboard/research` | In-dashboard research page | Only a redirect/stub to `/research` | 🔴 |
| IC Memos | `/dashboard/reports` | Report center | Just a stub pointing users to `/vault` | 🔴 |
| Deals | `/dashboard/deals` | Pipeline/deal workspace | “Coming soon” placeholder | 🔴 |
| Alerts | `/dashboard/alerts` | Portfolio alerts | “Coming soon” placeholder | 🔴 |
| Analytics | `/dashboard/analytics` | Analytics workspace | “Coming soon” placeholder | 🔴 |
| Billing | `/dashboard/billing` | Billing / Stripe portal | Wired | 🟢 |
| Settings | `/dashboard/settings` | Account settings | Wired | 🟢 |
| Developer | `/developer` | API/developer workspace | Wired, but separate from core advisor flow | 🟡 |

---

## Major Product Issues by Feature

### 1) Portfolio upload and dashboard analysis are **not the same as** the institutional swarm analysis

**Evidence**
- `neufin-web/app/dashboard/portfolio/page.tsx` posts to `POST /api/analyze-dna`
- `neufin-web/app/swarm/page.tsx` separately calls `POST /api/swarm/analyze`

**Impact**
- User uploads a portfolio in the dashboard and expects a full multi-agent IC report.
- Instead, the dashboard only shows DNA metrics + chart blocks.
- The “real” multi-agent reasoning lives on another page (`/swarm`).

**Why users feel it is broken**
- The product promise is “agentic swarm institutional research”, but the main dashboard upload flow is only the lighter DNA pipeline.
- This creates a mismatch between expectation and what shows up immediately after upload.

**Severity:** High

---

### 2) State handoff between tabs/pages is inconsistent

**Evidence**
- `dashboard/portfolio/page.tsx` saves analysis to `localStorage.setItem('neufin-last-analysis', ...)`
- `lib/store.ts`, `swarm/page.tsx`, `results`, and multiple other pages read `localStorage.getItem('dnaResult')`
- Search shows `neufin-last-analysis` is effectively **written but not used elsewhere**

**Impact**
- Analysis done in one page does not reliably appear in another.
- Swarm, vault, and results can feel stale or empty.
- Users feel forced to upload the portfolio again.

**Severity:** Critical UX issue

---

### 3) “Save Analysis” is not a real save flow

**Evidence**
- In `dashboard/portfolio/page.tsx`, the `Save Analysis` button only writes to localStorage.
- No real persistence confirmation or downstream usage is attached to that action.

**Impact**
- The button looks meaningful but does not create a robust cross-page or server-backed workflow.
- This directly contributes to “dashboard is there but not actionable”.

**Severity:** High

---

### 4) Report generation is synchronous and exceeds web request limits

**Frontend evidence**
- `neufin-web/app/reports/success/page.tsx` polls every 3s and gives up after 20 attempts (**60 seconds total**)
- Copy is hard-coded as **“Generating 10-page PDF”** and **“Your 10-page advisor PDF…”**

**Proxy evidence**
- `neufin-web/lib/proxy.ts` aborts upstream fetches after **90 seconds**:
  ```ts
  signal: AbortSignal.timeout(90000)
  ```

**Backend evidence**
- `neufin-backend/routers/reports.py` performs metrics + AI analysis + PDF generation + storage upload in one synchronous request
- `neufin-backend/routers/payments.py` `fulfill_report()` can also synchronously generate the PDF if it is not ready yet

**Impact**
- Long-running AI/PDF work can exceed Vercel/Railway time budgets
- Frontend shows “Payment Confirmed” before backend fulfillment is truly complete
- Users see “Still generating…” and then failure/timeout even after paying

**Severity:** Critical

---

### 5) The report/payment state machine is misleading

**Evidence**
- `payments.py` returns `402 Payment Required` from `/api/reports/fulfill` until the report row has `is_paid = true`
- The success page uses `session_id` in the URL to show **Payment Confirmed 🎉** immediately, even when backend payment fulfillment is not yet verified

**Impact**
- UX says “payment confirmed”, while backend can still reject fulfillment with `402`
- Users interpret this as a broken or fraudulent report flow

**Severity:** Critical

---

### 6) Research page is empty because it uses the wrong / different data path

**Evidence**
- `neufin-web/app/research/page.tsx` fetches `GET /api/research/blog?page=1&limit=60`
- `neufin-web/app/dashboard/page.tsx` fetches `GET /api/research/notes?limit=5`
- Live verification shows:
  - `/api/research/blog` → `[]`
  - `/api/research/notes` → actual live notes

**Impact**
- Dashboard home can show real notes while the research hub appears dead
- Users see “0 notes / No notes available yet” even though research data exists

**Severity:** High

---

### 7) Holdings chart analysis is partially misleading and brittle

**Evidence**
- `portfolio.py` returns `404` when `_candle()` cannot get data
- `dashboard/portfolio/page.tsx` maps timeframe labels as:
  - `1D` → `1mo`
  - `1W` → `1mo`
  - `1M` → `1mo`
  - `3M` → `3mo`
  - `1Y` → `1y`

**Impact**
- The UI suggests true 1-day and 1-week charting, but these buttons do **not** fetch 1-day or 1-week data
- A 404 is shown as “Price data unavailable” with no retry or fallback
- For valid tickers like `TSM`, the chart can still be empty in production

**Severity:** High

---

### 8) Navigation architecture is inconsistent and confusing

#### Dashboard sidebar
From `components/DashboardSidebar.tsx`:
- `Deals` → `/dashboard/deals` → placeholder
- `Research` → `/dashboard/research` → stub link to `/research`
- `IC Memos` → `/dashboard/reports` → stub link to `/vault`
- `Alerts` → placeholder
- `Analytics` → placeholder

#### Top app header
From `components/AppHeader.tsx`:
- `Portfolio` → `/dashboard`
- `Swarm` → `/swarm`
- `Vault` → `/vault`
- `Reports` → `/reports/success`

**Impact**
- There are **two different nav models** for the same product
- “Reports” points to a post-payment success page instead of a real report center
- “IC Memos” and “Vault” overlap conceptually but behave differently

**Severity:** Critical UX issue

---

### 9) Avatar images fail with `400` because external image domains are not configured

**Evidence**
- `AppHeader.tsx` renders `user.user_metadata.avatar_url` via `next/image`
- `next.config.js` has no `images.remotePatterns` configuration for Google avatars / external profile images

**Impact**
- Console fills with `/_next/image?...googleusercontent... 400`
- User profile avatars fail to load
- Makes the dashboard feel broken / low quality

**Severity:** Medium

---

### 10) Auth/session persistence remains fragile

**Evidence**
- `middleware.ts` protects routes based on the `neufin-auth` cookie
- `AuthProvider` mirrors Supabase local session into that cookie via `syncAuthCookie()`
- `app/auth/callback/page.tsx` redirects to `/dashboard` as soon as session exists, without explicitly waiting for the cookie sync to complete
- There are still **two sign-in entry routes**: `/auth` and `/login`

**Impact**
- Opening a new tab can still feel logged out until cookie sync catches up
- Silent redirects back to login are possible
- SSO persistence does not feel enterprise-grade yet

**Severity:** High

---

### 11) Dashboard scroll position is likely being preserved instead of reset

**Evidence**
- `components/dashboard/DashboardShell.tsx` renders the main content in a persistent scroll container:
  ```tsx
  <main className="flex-1 overflow-y-auto p-6">
  ```
- There is no route-change effect that resets scroll to top on dashboard navigation

**Likely impact**
- On revisit / route transitions, users can land in the middle or bottom of the previous scroll position (for example near “Holdings Chart Analysis”)

**Status:** Likely root cause, not yet browser-traced end-to-end

**Severity:** Medium

---

### 12) Build shields are hiding frontend quality debt

**Evidence**
In `next.config.js`:
```js
typescript: { ignoreBuildErrors: true },
eslint: { ignoreDuringBuilds: true },
```

**Impact**
- Broken behavior can ship without the build pipeline stopping it
- This increases production drift and makes regressions easier to deploy

**Severity:** Medium engineering risk

---

## What Each User-Facing Area Is Supposed To Be

| Tab / area | Intended role | Current issue |
|---|---|---|
| `Portfolio` | Upload portfolio, see DNA, charts, next actions | Not unified with swarm / IC memo flow |
| `Swarm` | Institutional multi-agent analysis | Slow / can hang / not automatically triggered from main upload flow |
| `Vault` | Persistent history of prior analyses and deliverables | Overlaps with reports; terminology not clear |
| `Reports` | Final PDFs / IC memos | Currently points to the post-payment success page, not a report hub |
| `Research` | Live market/research intelligence | Uses endpoint that is empty in production |
| `IC Memos` | Advisor-grade memos | Just a redirect shell; no first-class memo center |
| `Deals` / `Alerts` / `Analytics` | Future product modules | Shipped in nav before being real |

---

## Root Cause Themes

### Theme A — Product flow fragmentation
NeuFin web currently behaves like **three products stitched together** instead of one coherent workflow:
- guest DNA product
- advisor dashboard product
- institutional swarm/IC product

### Theme B — Long synchronous backend work
Swarm analysis, price fetching, and PDF generation are still treated as request/response actions instead of background jobs with durable status tracking.

### Theme C — Mismatched storage and navigation contracts
Different pages store/read different localStorage keys and route users to different concepts (`vault`, `reports`, `swarm`, `results`) for what feels like the same task.

---

## Priority Fix Plan

### P0 — Must fix first
1. **Unify the main analysis flow**
   - `dashboard/portfolio` should either:
     - trigger swarm analysis automatically after DNA completes, or
     - clearly separate “Quick DNA” vs “Full IC Briefing” in one page
2. **Replace the current PDF/report flow with async job status tracking**
   - background job + `/api/reports/{id}/status`
   - remove hard 60s failure UX
3. **Fix navigation**
   - remove or disable placeholder tabs from primary nav
   - stop pointing `Reports` to `/reports/success`
4. **Use one analysis storage contract**
   - standardize on one persisted object shape and one storage key / server source of truth

### P1 — Next
5. Fix research hub to use the correct live endpoint or repair `/api/research/blog`
6. Fix chart timeframe mapping (`1D`, `1W`, `1M`) and add retry/fallback UI
7. Add external image config for avatars
8. Consolidate auth to one canonical sign-in route and make cookie sync deterministic

### P2 — polish / enterprise hardening
9. Force dashboard scroll reset to top on route change
10. Replace hard-coded “10-page” copy with dynamic institutional report messaging
11. Re-enable strict build quality gates once type/lint debt is addressed

---

## Final Conclusion

**This is not primarily a backend capability problem.**
It is a **frontend orchestration, routing, and async UX problem**.

The underlying platform already contains:
- market regime logic
- research notes
- swarm analysis
- portfolio analytics
- PDF generation
- billing/auth infrastructure

But the web app currently exposes them through **inconsistent routes, partial placeholders, mismatched state storage, and synchronous request flows that time out under real usage**.

If the next work cycle focuses on:
1. one unified analysis journey,
2. async report/swarm jobs,
3. nav cleanup,
4. auth/session hardening,

then the dashboard can become coherent very quickly.
