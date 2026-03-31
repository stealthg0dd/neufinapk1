# Neufin QA Checklist
**Target:** https://neufin-web.vercel.app
**Last updated:** 2026-03-31
**Tester:** _______________
**Build / commit:** _______________

---

## How to use this checklist

1. Work through each section in order — earlier sections are dependencies for later ones.
2. Mark each row `✅ Pass`, `❌ Fail`, or `🚫 Blocked` (cannot be tested due to a prior failure or missing prerequisite).
3. For failures, record the **exact error message** shown on screen (or a brief screenshot description) in the Notes column.
4. After all sections, complete the **Summary** table at the bottom.
5. Prioritise failures: **P0** = blocks the core user journey · **P1** = degraded experience · **P2** = cosmetic / minor

---

## Prerequisites

Before starting, have the following ready:

- A fresh browser profile (or Incognito window) with no cached session
- A Supabase dashboard session (for Section E manual simulation)
- Stripe test card: `4242 4242 4242 4242` · exp `12/34` · CVC `123`
- Two test CSV files:
  - **standard.csv** — `AAPL,100\nMSFT,50\nNVDA,30\nSQ,20` (headers: `symbol,shares`)
  - **concentration.csv** — `NVDA,500\nSMCI,300\nAMD,200\nMETA,200` (tech-heavy)
  - **bad_ticker.csv** — `AAPL,100\nMSFT,50\nZZZZZ,10`
- Mobile device or emulator with the neufin-mobile APK / TestFlight build installed

---

## Section A — Auth Flow

| ID | Test | Steps | Expected Result | Result | Notes |
|----|------|-------|-----------------|--------|-------|
| A1 | Google OAuth happy path | 1. Clear all cookies and local storage<br>2. Navigate to `https://neufin-web.vercel.app`<br>3. Click **Sign in with Google**<br>4. Complete Google OAuth consent<br>5. Observe landing page | **New user:** redirects to `/onboarding`. **Returning user:** redirects to `/dashboard`. No redirect loop. No "please login again" prompt. `AppHeader` shows Google avatar. | ☐ Pass / ☐ Fail / ☐ Blocked | |
| A2 | Email/password sign-up | 1. Navigate to `/auth`<br>2. Select the **Sign Up** tab<br>3. Enter a fresh email address and a password ≥ 8 characters<br>4. Click **Create Account**<br>5. Observe result | Account created successfully. No "Database error saving new user". Redirects to `/onboarding`. Supabase `user_profiles` table shows a new row with `subscription_status = trial`. | ☐ Pass / ☐ Fail / ☐ Blocked | |
| A3 | Session persistence across hard refresh | 1. Log in (any method)<br>2. Navigate to `/swarm`<br>3. Press **Ctrl+Shift+R** (hard refresh)<br>4. Observe URL | Remains on `/swarm`. Does NOT redirect to `/auth`. Auth token silently refreshed in background. | ☐ Pass / ☐ Fail / ☐ Blocked | |
| A4 | Sign out | 1. While logged in, click the user avatar in the top-right<br>2. Click **Sign Out** in the dropdown<br>3. Attempt to navigate to `/dashboard` manually | Redirects to the landing page on sign-out. Navigating to `/dashboard` after sign-out redirects to `/auth`. No residual auth state or stale token errors. | ☐ Pass / ☐ Fail / ☐ Blocked | |
| A5 | Expired session mid-session handling | 1. Log in<br>2. Open browser DevTools → Application → Cookies<br>3. Delete the Supabase `sb-*` cookies<br>4. Navigate to `/dashboard` and trigger any API call (e.g. click a chart) | Toast message or redirect to `/auth?reason=session_expired`. No white screen or uncaught JS error. `authFetch` 401 handler fires. | ☐ Pass / ☐ Fail / ☐ Blocked | |

---

## Section B — Onboarding

| ID | Test | Steps | Expected Result | Result | Notes |
|----|------|-------|-----------------|--------|-------|
| B1 | New user full onboarding wizard | 1. Sign up with a fresh account (A2 above)<br>2. Observe wizard on `/onboarding`<br>3. Complete Step 1 (choose user type: Investor)<br>4. Complete Step 2 (confirm preferences)<br>5. Upload **standard.csv** in Step 3<br>6. Click **Analyze Portfolio** | DNA score shown in step 3. Investor type label visible. "Go to Dashboard" button appears. Clicking it lands on `/dashboard` with portfolio data (4 tickers). `user_profiles.onboarding_complete` set to `true`. | ☐ Pass / ☐ Fail / ☐ Blocked | |
| B2 | Advisor onboarding path | 1. Sign up fresh account<br>2. Select **Advisor** in wizard Step 1<br>3. Enter firm name and optionally upload a logo<br>4. Complete wizard | No error saving firm name. Redirects to `/dashboard` or advisor-specific landing. `user_profiles` row contains `user_type = advisor` and the entered firm name. | ☐ Pass / ☐ Fail / ☐ Blocked | |
| B3 | Returning user skips onboarding | 1. Log in with an account that has `onboarding_complete = true`<br>2. Observe redirect path | Goes directly to `/dashboard`. Does NOT re-enter `/onboarding`. No flash of the onboarding page. | ☐ Pass / ☐ Fail / ☐ Blocked | |
| B4 | Onboarding guards unauthenticated access | 1. Clear session<br>2. Navigate directly to `/onboarding` | Redirects to `/auth?next=/onboarding`. Does not show a broken wizard or throw an error. | ☐ Pass / ☐ Fail / ☐ Blocked | |

---

## Section C — Dashboard

| ID | Test | Steps | Expected Result | Result | Notes |
|----|------|-------|-----------------|--------|-------|
| C1 | `AppHeader` persistent nav loads | 1. Log in → reach `/dashboard`<br>2. Inspect the sticky header | Logo visible. Nav tabs (Portfolio · Swarm · Vault · Reports) all present and highlight the active route. `TrialBadge` shows days remaining. User avatar renders (Google photo or initials). | ☐ Pass / ☐ Fail / ☐ Blocked | |
| C2 | Portfolio value chart renders | 1. Dashboard after uploading **standard.csv**<br>2. Observe the 30-day portfolio value line chart | Chart renders with real data points. Percentage change (green/red) shown. No "Portfolio history unavailable" error for a fresh portfolio. | ☐ Pass / ☐ Fail / ☐ Blocked | |
| C3 | Holdings list and candlestick chart | 1. Dashboard with **standard.csv** loaded<br>2. Click ticker **AAPL** in the holdings list | Candlestick chart updates to show AAPL 3-month OHLCV bars. OHLC stat row (Open, High, Low, 1d Chg) populates. No spinner stuck indefinitely. | ☐ Pass / ☐ Fail / ☐ Blocked | |
| C4 | SQ stale price badge | 1. Upload **standard.csv** (contains SQ)<br>2. Observe the SQ row in the holdings table | If live price unavailable: amber ⚠ **STALE** badge shown on SQ row. Analysis still completes for the other 3 tickers. Warning banner appears above nav indicating SQ used a cached price. | ☐ Pass / ☐ Fail / ☐ Blocked | |
| C5 | AI insights panel | 1. Dashboard with portfolio loaded<br>2. Observe the right-hand AI insights panel | Recommendation text is present (not placeholder "…" or empty). Strengths list (3 items) and Watch Out list (2 items) are non-empty. "Full DNA Report →" link navigates to `/results`. | ☐ Pass / ☐ Fail / ☐ Blocked | |
| C6 | Trial countdown strip | 1. Day-1 account (fresh sign-up)<br>2. Observe the trial UI element | `TrialBadge` in `AppHeader` shows correct days remaining (e.g. "13d trial"). Does NOT show expired or panic language on day 1. Clicking badge navigates to `/upgrade`. | ☐ Pass / ☐ Fail / ☐ Blocked | |
| C7 | Sector allocation pie chart | 1. Dashboard with **standard.csv**<br>2. Scroll to the bottom sector chart | Pie chart renders with correct slices. Legend labels match tickers' sectors. Tooltip shows dollar value on hover. | ☐ Pass / ☐ Fail / ☐ Blocked | |
| C8 | No portfolio state | 1. Log in with an account that has no portfolio data in sessionStorage<br>2. Navigate to `/dashboard` | Skeleton shimmer shows briefly, then "No portfolio data found" message with a "Upload Portfolio →" CTA. No white screen or JS error. | ☐ Pass / ☐ Fail / ☐ Blocked | |

---

## Section D — Swarm Analysis

| ID | Test | Steps | Expected Result | Result | Notes |
|----|------|-------|-----------------|--------|-------|
| D1 | Swarm launch from dashboard with portfolio | 1. Dashboard with **standard.csv** loaded<br>2. Click **LAUNCH SWARM ANALYSIS** or navigate to `/swarm`<br>3. Wait up to 90 seconds | `/swarm` loads. Portfolio auto-populated (no "provide positions" prompt). 6 agent cards animate in sequentially with real AI outputs (not demo text). Consensus bar populates at completion. | ☐ Pass / ☐ Fail / ☐ Blocked | |
| D2 | Swarm without portfolio | 1. Clear session storage<br>2. Navigate directly to `/swarm`<br>3. Observe page | "Upload a portfolio first" prompt displayed with a link to `/upload` or `/onboarding`. No 401 / 400 error shown to user. No blank page or uncaught exception. | ☐ Pass / ☐ Fail / ☐ Blocked | |
| D3 | Swarm completion metrics | 1. Let swarm complete fully (D1 above)<br>2. Inspect each of the 6 agent cards | Each card shows: agent name, verdict (BUY / HOLD / SELL / REDUCE), confidence %, and a ≥2-sentence rationale. No card stuck in "Analyzing…" after 90 seconds. | ☐ Pass / ☐ Fail / ☐ Blocked | |
| D4 | Swarm chat widget post-completion | 1. After swarm completes (D3)<br>2. Open the chat widget or input field<br>3. Type: "What is the biggest risk in my portfolio?" | Chat responds with context-aware answer referencing the swarm output. Does NOT return "provide thesis_context" error. Response references at least one ticker from the portfolio. | ☐ Pass / ☐ Fail / ☐ Blocked | |
| D5 | Swarm with concentration risk portfolio | 1. Re-run swarm with **concentration.csv** (all tech)<br>2. Read agent outputs | At least 2 of the 6 agents flag concentration / correlation risk. Consensus score is not 100. No agent produces empty output. | ☐ Pass / ☐ Fail / ☐ Blocked | |

---

## Section E — Payments & Paywall

| ID | Test | Steps | Expected Result | Result | Notes |
|----|------|-------|-----------------|--------|-------|
| E1 | Report download during active trial | 1. Log in as a trial user (< 14 days old)<br>2. Navigate to `/results` or `/dashboard`<br>3. Click **Download Professional Report · $29** | Trial users: button proceeds without a paywall. If paywalled in trial, this is a regression. Report generation begins. (Note: full PDF delivery tested in E3.) | ☐ Pass / ☐ Fail / ☐ Blocked | |
| E2 | PaywallOverlay appears post-trial | 1. In Supabase dashboard: set the test account's `trial_started_at` to 15 days ago (e.g. `NOW() - INTERVAL '15 days'`)<br>2. Hard-refresh the dashboard<br>3. Click **Download Full Report** | `PaywallOverlay` appears with the amber lock UI. Two CTAs visible: single report ($29) and Pro subscription ($99/mo). Clicking either redirects to Stripe Checkout — not a blank screen or console error. | ☐ Pass / ☐ Fail / ☐ Blocked | |
| E3 | Post-payment success redirect | 1. On Stripe Checkout (from E2): use test card `4242 4242 4242 4242` · exp `12/34` · CVC `123`<br>2. Complete payment<br>3. Observe redirect | Redirects to `/dashboard?payment=success` (or `/results?checkout_success=1`). Success banner or confetti visible. Report PDF download link appears. Stripe dashboard shows payment recorded. | ☐ Pass / ☐ Fail / ☐ Blocked | |
| E4 | Stripe billing portal | 1. Log in as Pro subscriber (or simulate via Supabase `subscription_status = active`)<br>2. Navigate to `/dashboard/billing`<br>3. Click **Manage Subscription** | Stripe Customer Portal opens in the same tab. Shows subscription details and payment method. Returning to the app after portal navigates back to `/dashboard/billing`. | ☐ Pass / ☐ Fail / ☐ Blocked | |
| E5 | Referral discount applies | 1. Obtain a valid referral share token from an existing DNA score record<br>2. Navigate to `/?ref={token}`<br>3. Click "Download Report" | Stripe Checkout page shows a 20% discount applied automatically. Line item shows original price struck through. `ref_token` confirmed in Supabase `dna_scores`. | ☐ Pass / ☐ Fail / ☐ Blocked | |

---

## Section F — User Profile & Settings

| ID | Test | Steps | Expected Result | Result | Notes |
|----|------|-------|-----------------|--------|-------|
| F1 | Avatar dropdown on every page | 1. Log in<br>2. Visit `/dashboard`, `/swarm`, `/vault` in sequence<br>3. Check top-right header on each page | `AppHeader` is present on all dashboard-routed pages. Avatar (Google photo or initials fallback) and dropdown (Account Settings · Subscription · Sign Out) are visible and functional on each page. | ☐ Pass / ☐ Fail / ☐ Blocked | |
| F2 | Billing page loads with correct plan | 1. Click avatar → **Subscription**<br>2. Observe `/dashboard/billing` | Page shows the user's current plan label (Free Trial / Neufin Pro / Trial Expired). Days remaining shown for trial users. DNA score history list populates if history exists. | ☐ Pass / ☐ Fail / ☐ Blocked | |
| F3 | Account Settings — display name update | 1. Click avatar → **Account Settings**<br>2. Change display name to "QA Tester"<br>3. Click **Save Changes** | Success message "Display name updated." appears. Refreshing the page shows the new name persisted. No JS error in console. | ☐ Pass / ☐ Fail / ☐ Blocked | |
| F4 | Account Settings — password change | 1. On `/dashboard/settings`<br>2. Enter a new password (≥ 8 chars) and confirm it<br>3. Click **Update Password** | "Password updated." confirmation shown. Signing out and signing back in with the new password succeeds. Mismatched confirm password shows inline error "Passwords do not match." | ☐ Pass / ☐ Fail / ☐ Blocked | |
| F5 | Delete account modal confirmation | 1. On `/dashboard/settings` → Danger Zone<br>2. Click **Delete Account**<br>3. Observe modal | Delete modal opens. **Delete Forever** button disabled until "DELETE" is typed exactly. Typing "DELETE" enables the button. Cancelling closes modal without action. | ☐ Pass / ☐ Fail / ☐ Blocked | |

---

## Section G — Error States & Resilience

| ID | Test | Steps | Expected Result | Result | Notes |
|----|------|-------|-----------------|--------|-------|
| G1 | Unknown ticker graceful handling | 1. Upload **bad_ticker.csv** (contains `ZZZZZ`)<br>2. Observe results page | Analysis completes for AAPL and MSFT. Yellow warning banner appears: "Some tickers were excluded: ZZZZZ (price unavailable)." No hard error blocks the page. DNA score calculated from the 2 valid tickers. | ☐ Pass / ☐ Fail / ☐ Blocked | |
| G2 | Network offline — dashboard skeleton | 1. Log in and reach `/dashboard`<br>2. Open DevTools → Network → set to **Offline**<br>3. Hard-refresh the page | Skeleton shimmer components (`DashboardSkeleton`) appear in place of live charts. Each section shows a graceful "Unable to load" message rather than a white screen. Zero uncaught JS errors in the console. | ☐ Pass / ☐ Fail / ☐ Blocked | |
| G3 | Sign-up with duplicate email | 1. Navigate to `/auth` → Sign Up tab<br>2. Enter an email that already has an account<br>3. Submit | Clear, user-friendly error message displayed (e.g. "An account with this email already exists. Sign in instead."). NOT a raw "Database error" or generic 500 message. Sign-in link in the error message navigates to the login form. | ☐ Pass / ☐ Fail / ☐ Blocked | |
| G4 | Global error boundary triggers | 1. In a staging / preview deployment only — temporarily introduce a render error in a page component<br>2. Navigate to that page | `app/error.tsx` catches the error. "Something went wrong" screen shown with Try Again and Go Home buttons. Error ID (digest) displayed in fine print. Sentry captures the exception (verify in Sentry dashboard). | ☐ Pass / ☐ Fail / ☐ Blocked | |
| G5 | 404 page | 1. Navigate to `https://neufin-web.vercel.app/this-does-not-exist` | Custom `not-found.tsx` renders: "404 — Page not found" message, Go Home and Dashboard links. Does NOT show the Vercel default 404 page. | ☐ Pass / ☐ Fail / ☐ Blocked | |
| G6 | Rate limit toast (429) | 1. Trigger rapid repeated API calls (e.g. click "New Analysis" quickly 10+ times)<br>2. Observe if backend returns 429 | `react-hot-toast` shows "Too many requests — please wait a moment" in the bottom-right. No white screen. Toast auto-dismisses after ~4 seconds. | ☐ Pass / ☐ Fail / ☐ Blocked | |
| G7 | Missing env var surfaced in logs | 1. Check Vercel deployment logs (Functions tab) for the latest production deploy | No `[ENV] Missing required environment variables:` lines in the server logs. All 4 required `NEXT_PUBLIC_*` vars are set. | ☐ Pass / ☐ Fail / ☐ Blocked | |

---

## Section H — Mobile App (neufin-mobile)

> **Prerequisite:** neufin-mobile APK (Android) or TestFlight build installed on a physical device or emulator. Backend URL must point to production Railway deployment.

| ID | Test | Steps | Expected Result | Result | Notes |
|----|------|-------|-----------------|--------|-------|
| H1 | Mobile login — Google OAuth | 1. Open the app on a fresh install<br>2. Tap **Continue with Google**<br>3. Complete Google OAuth in the system browser | App authenticates successfully. Returns to app and lands on portfolio list or onboarding screen. No "redirect URI mismatch" error. No blank screen post-OAuth. | ☐ Pass / ☐ Fail / ☐ Blocked | |
| H2 | Portfolio sync — web upload visible on mobile | 1. Upload **standard.csv** on the web app<br>2. Open the mobile app (may require app restart)<br>3. Navigate to portfolio list | The same 4 tickers (AAPL, MSFT, NVDA, SQ) appear in mobile without re-uploading. Prices and weights match the web dashboard (allowing for market-hour price movement). | ☐ Pass / ☐ Fail / ☐ Blocked | |
| H3 | Swarm report on mobile | 1. Run a swarm analysis on the web (D1)<br>2. Open the mobile app → navigate to Swarm section | Swarm report visible with all 6 agent cards. Data is the same as the web output. No "demo" or placeholder values. Report loads within 5 seconds (cached from server). | ☐ Pass / ☐ Fail / ☐ Blocked | |
| H4 | Mobile sign-out | 1. While logged in on mobile, tap the profile icon<br>2. Tap **Sign Out** | User is signed out. Navigating to a protected screen redirects to the login screen. No residual session data shown. | ☐ Pass / ☐ Fail / ☐ Blocked | |

---

## Section I — Cross-cutting Checks

| ID | Test | Steps | Expected Result | Result | Notes |
|----|------|-------|-----------------|--------|-------|
| I1 | CORS — API calls succeed from production domain | 1. Log in on `https://neufin-web.vercel.app`<br>2. Open DevTools → Network<br>3. Perform any API action (e.g. upload CSV)<br>4. Check network requests | No `CORS` errors in the console. All `api/` requests to the Railway backend return 2xx. `Access-Control-Allow-Origin` header is present on responses. | ☐ Pass / ☐ Fail / ☐ Blocked | |
| I2 | Sentry receiving errors | 1. Log in to sentry.io → Neufin project<br>2. Check Issues from the last 24 hours | No new unhandled exceptions appearing from normal usage flows (A1–G7). If E4 was tested with a deliberate error, confirm it appears in Sentry with user context attached. | ☐ Pass / ☐ Fail / ☐ Blocked | |
| I3 | Mobile responsiveness | 1. On a desktop browser, resize to 375px width (iPhone SE)<br>2. Navigate through `/dashboard`, `/results`, `/swarm` | No horizontal scroll. All buttons reachable. Tables switch to mobile card layout. `AppHeader` nav collapses or remains usable. | ☐ Pass / ☐ Fail / ☐ Blocked | |
| I4 | Page load performance | 1. Open Chrome DevTools → Lighthouse<br>2. Run audit on `/` (landing) and `/dashboard` | Landing page LCP < 2.5 s. Dashboard FCP < 3 s on a simulated 4G connection. No render-blocking resources flagged as critical. | ☐ Pass / ☐ Fail / ☐ Blocked | |

---

## Summary

Complete this table after all sections are tested.

| Section | Total Tests | ✅ Pass | ❌ Fail | 🚫 Blocked |
|---------|-------------|---------|---------|-----------|
| A — Auth | 5 | | | |
| B — Onboarding | 4 | | | |
| C — Dashboard | 8 | | | |
| D — Swarm | 5 | | | |
| E — Payments | 5 | | | |
| F — User Profile | 5 | | | |
| G — Error States | 7 | | | |
| H — Mobile | 4 | | | |
| I — Cross-cutting | 4 | | | |
| **TOTAL** | **47** | | | |

---

## Failure Log

List every failure here with priority, exact error, and reproduction steps.

| ID | Priority | Exact Error / Screenshot Description | Reproduction Steps | Assigned To | Fixed? |
|----|----------|--------------------------------------|--------------------|-------------|--------|
| | P0 / P1 / P2 | | | | ☐ |
| | P0 / P1 / P2 | | | | ☐ |
| | P0 / P1 / P2 | | | | ☐ |

**Priority definitions:**
- **P0** — Blocks the core user journey (auth, upload, DNA score). Must fix before any release.
- **P1** — Degrades a key feature (Swarm, payments, mobile sync). Fix within 1 sprint.
- **P2** — Cosmetic, copy, or minor UX issue. Schedule for next available slot.

---

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| QA Tester | | | |
| Engineering Lead | | | |
| Product Owner | | | |
