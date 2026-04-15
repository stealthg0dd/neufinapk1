# Neufin-Web — Complete Routing Map

Generated: 2026-03-29

---

## PUBLIC ROUTES (No auth required)

### ROUTE: /

FILE: app/page.tsx
AUTH: Not required
LINKS TO: /upload, /auth, /auth?next=/vault, /features, /blog, /market, /leaderboard, /research, /privacy
MIDDLEWARE: Skipped (not in PROTECTED list)
NOTES: Landing page with investor + advisor CTAs

---

### ROUTE: /auth

FILE: app/auth/page.tsx
AUTH: Not required
OAUTH: Google via supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback?next=...` } })
MAGIC LINK: supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=...` } })
PASSWORD: supabase.auth.signInWithPassword / signUp
CALLBACK: /auth/callback
REDIRECTS TO: `next` param (default: /vault) via onAuthStateChange SIGNED_IN event
MIDDLEWARE: Skipped

---

### ROUTE: /auth/callback

FILE: app/auth/callback/page.tsx
AUTH: Not required
HANDLES: OAuth PKCE code exchange + magic-link hash fragment
FLOW:

1. Check URL for ?error= → show error state
2. Register onAuthStateChange listener (waits for SIGNED_IN/TOKEN_REFRESHED)
3. Fast path: getSession() — if session already exists, redirect immediately
4. On SIGNED_IN: claim anonymous dnaResult, check onboarding_complete
   5a. New user (no onboarding_complete): → /onboarding (stores original `next` in localStorage)
   5b. Existing user: → `next` param (default: /vault)
   REDIRECTS TO: /onboarding (new users) OR `?next` param (default: /vault)
   MIDDLEWARE: Skipped

---

### ROUTE: /upload

FILE: app/upload/page.tsx
AUTH: Not required (works for guests)
LINKS TO: /results (after upload success), /auth (if wants to save)
STORES: dnaResult in localStorage
MIDDLEWARE: Skipped

---

### ROUTE: /results

FILE: app/results/page.tsx + app/results/ResultsContent.tsx
AUTH: Not required
REDIRECTS TO: /upload (if no dnaResult in localStorage)
MIDDLEWARE: Skipped

---

### ROUTE: /features

FILE: app/features/page.tsx
AUTH: Not required
MIDDLEWARE: Skipped

---

### ROUTE: /blog

FILE: app/blog/page.tsx + app/blog/layout.tsx
AUTH: Not required
MIDDLEWARE: Skipped

---

### ROUTE: /blog/behavioral-finance-sea-sme

### ROUTE: /blog/disposition-effect-singapore

### ROUTE: /blog/mas-compliant-fintech

### ROUTE: /blog/plaid-portfolio-analysis

### ROUTE: /blog/sea-wealth-management-ai

FILES: app/blog/[slug]/page.tsx
AUTH: Not required
MIDDLEWARE: Skipped

---

### ROUTE: /market

FILE: app/market/page.tsx + app/market/MarketClient.tsx
AUTH: Not required
MIDDLEWARE: Skipped

---

### ROUTE: /leaderboard

FILE: app/leaderboard/page.tsx + app/leaderboard/LeaderboardClient.tsx
AUTH: Not required
MIDDLEWARE: Skipped

---

### ROUTE: /research

FILE: app/research/page.tsx
AUTH: Not required
MIDDLEWARE: Skipped

---

### ROUTE: /privacy

FILE: app/privacy/page.tsx
AUTH: Not required
MIDDLEWARE: Skipped

---

### ROUTE: /share/[token]

FILE: app/share/[token]/page.tsx
AUTH: Not required (public share link)
MIDDLEWARE: Skipped

---

### ROUTE: /referrals

FILE: app/referrals/page.tsx
AUTH: Not required (reads ?ref= param)
MIDDLEWARE: Skipped

---

### ROUTE: /reports/success

FILE: app/reports/success/page.tsx
AUTH: Not required
MIDDLEWARE: Skipped

---

## PROTECTED ROUTES (Auth required)

### ROUTE: /dashboard

FILE: app/dashboard/page.tsx
AUTH: Required
PROTECTED BY:

- Middleware: checks `neufin-auth` or `sb-access-token` HTTP cookie → redirect /auth?next=/dashboard
- Client-side useEffect: `if (!authLoading && !user) router.replace('/auth?next=/dashboard')`
- Double-guarded (middleware + useEffect)
  USES: useAuth() → { user, loading, token }
  READS: sessionStorage 'dnaResult' for portfolio data
  LINKS TO: /upload, /vault
  MIDDLEWARE: Matched by /dashboard/:path\*

---

### ROUTE: /dashboard/agent-os

FILE: app/dashboard/agent-os/page.tsx
AUTH: Required (inherited via middleware matcher /dashboard/:path*)
MIDDLEWARE: Matched by /dashboard/:path*

---

### ROUTE: /dashboard/cos

FILE: app/dashboard/cos/page.tsx
AUTH: Required (inherited)
MIDDLEWARE: Matched by /dashboard/:path\*

---

### ROUTE: /vault

FILE: app/vault/page.tsx
AUTH: Required
PROTECTED BY:

- Middleware: cookie check → redirect /auth?next=/vault
- Client-side: `if (!authLoading && !user)` → shows sign-in CTA (does NOT auto-redirect, just renders a locked state)
  USES: useAuth() → { user, token }
  LINKS TO: /auth?next=/vault, /upload, /share/[token], /upload?rerun=[token]
  MIDDLEWARE: Matched by /vault/:path\*

---

### ROUTE: /swarm

FILE: app/swarm/page.tsx
AUTH: Required
PROTECTED BY:

- Middleware ONLY — no client-side auth redirect guard
- Uses useUser() → { isPro, token } — no redirect if not logged in
- ⚠️ If middleware fails (cookie missing), user reaches page with no session
  READS: localStorage 'dnaResult' for portfolio context
  MIDDLEWARE: Matched by /swarm/:path\*

---

### ROUTE: /onboarding

FILE: app/onboarding/page.tsx
AUTH: Required
PROTECTED BY:

- Middleware: cookie check → redirect /auth?next=/onboarding
- Client-side: `if (!authLoading && !token) router.replace('/auth?next=/onboarding...')`
  REDIRECTS TO: /vault (investors) or /advisor/dashboard (advisors) after completion
  READS: localStorage 'onboarding_next' for post-onboarding destination
  MIDDLEWARE: Matched by /onboarding/:path\*

---

### ROUTE: /advisor/dashboard

FILE: app/advisor/dashboard/page.tsx
AUTH: Required
PROTECTED BY:

- Middleware: cookie check
- Client-side: useAuth()
  MIDDLEWARE: Matched by /advisor/:path\*

---

### ROUTE: /advisor/settings

FILE: app/advisor/settings/page.tsx
AUTH: Required (inherited)
MIDDLEWARE: Matched by /advisor/:path\*

---

## API ROUTES

### ROUTE: /api/dashboard

FILE: app/api/dashboard/route.ts
AUTH: Backend-validated

### ROUTE: /api/agent-os/[...path]

FILE: app/api/agent-os/[...path]/route.ts
AUTH: Proxied to Railway backend

### ROUTE: /api/agent-os/status

FILE: app/api/agent-os/status/route.ts

### ROUTE: /api/github/[repo]

FILE: app/api/github/[repo]/route.ts

### ROUTE: /api/tasks

FILE: app/api/tasks/route.ts

---

## MIDDLEWARE CONFIG

```
matcher: ['/dashboard/:path*', '/vault/:path*', '/swarm/:path*', '/onboarding/:path*', '/advisor/:path*']
```

Token lookup order:

1. Cookie: `neufin-auth`
2. Cookie: `sb-access-token`
3. Header: `Authorization: Bearer <token>`

On missing token → redirect /auth?next=<pathname>
On invalid token → redirect /auth?next=<pathname>&reason=token_invalid (clears stale cookies)
On backend unreachable → allow through (falls back to client-side guards)
