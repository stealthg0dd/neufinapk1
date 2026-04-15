# NeuFin Web — Route Reference

> **Audience**: Engineering and ops team.
> **Source of truth**: `middleware.ts` enforces all access rules listed here.
> Last updated: Prompt 9 (April 2026)

---

## Access Tiers

| Tier              | Description                                        | Enforced by                                       |
| ----------------- | -------------------------------------------------- | ------------------------------------------------- |
| **Public**        | No authentication required                         | `PUBLIC_PREFIXES` in `middleware.ts`              |
| **Authenticated** | Valid Supabase JWT required (cookie or Bearer)     | `middleware.ts` + per-endpoint `get_current_user` |
| **Advisor-only**  | Valid JWT **and** `user_profiles.role = "advisor"` | `ADVISOR_ONLY_PREFIXES` in `middleware.ts`        |

---

## Pages

### Public pages (no auth required)

| Route               | Description                               |
| ------------------- | ----------------------------------------- |
| `/`                 | Landing page                              |
| `/upload`           | CSV portfolio upload + guest DNA analysis |
| `/results`          | DNA score results                         |
| `/results/[id]`     | Shareable result page                     |
| `/features`         | Feature showcase                          |
| `/blog`             | Blog listing                              |
| `/blog/[slug]`      | Blog post                                 |
| `/market`           | Public market data                        |
| `/leaderboard`      | Public DNA score leaderboard              |
| `/research`         | Research articles                         |
| `/privacy`          | Privacy policy                            |
| `/share/[id]`       | Shared portfolio page                     |
| `/referrals/[code]` | Referral landing page                     |
| `/reports/checkout` | Stripe checkout initiation                |
| `/reports/fulfill`  | Report download after payment             |
| `/auth`             | Login / sign-up                           |
| `/auth/callback`    | OAuth / magic-link PKCE callback          |

### Authenticated pages (any valid session)

| Route                 | Description                                |
| --------------------- | ------------------------------------------ |
| `/dashboard`          | Main portfolio dashboard                   |
| `/dashboard/billing`  | Subscription + billing management          |
| `/dashboard/cos`      | CTech Chief of Staff command centre        |
| `/dashboard/settings` | User account settings                      |
| `/dashboard/agent-os` | Agent OS monitoring dashboard (infra view) |
| `/onboarding`         | Post-signup onboarding flow                |
| `/swarm`              | Swarm analysis page                        |
| `/reports/success`    | Post-purchase success / report download    |

### Advisor-only pages (role = "advisor" required)

> Non-advisor users are redirected to `/dashboard`. Not linked from public navigation.

| Route                | Description                                                            |
| -------------------- | ---------------------------------------------------------------------- |
| `/dashboard/admin`   | Internal user admin panel — manage users, extend trials, resend emails |
| `/dashboard/revenue` | Revenue dashboard — Stripe stats, funnel, recent purchases             |

---

## API Routes

### Public API routes (no auth required)

All `/api/*` routes bypass middleware — they manage their own auth.

| Route                      | Method   | Description                                                     |
| -------------------------- | -------- | --------------------------------------------------------------- |
| `/api/analyze-dna`         | POST     | Guest DNA analysis (rate-limited: 3/IP/24h for unauthenticated) |
| `/api/dna/share/[id]`      | GET      | Shareable DNA score                                             |
| `/api/dna/leaderboard`     | GET      | Public leaderboard                                              |
| `/api/reports/checkout`    | POST     | Initiate Stripe checkout                                        |
| `/api/reports/fulfill`     | GET      | Download a paid PDF report                                      |
| `/api/stripe/webhook`      | POST     | Stripe webhook (signature-validated)                            |
| `/api/payments/plans`      | GET      | List public pricing plans                                       |
| `/api/portfolio/chart/[…]` | GET      | Public portfolio chart data                                     |
| `/api/referrals/[…]`       | GET      | Referral tracking                                               |
| `/api/emails/[…]`          | POST     | Email capture / waitlist                                        |
| `/api/advisors/[…]`        | GET      | Public advisor profiles                                         |
| `/api/market/[…]`          | GET      | Market data                                                     |
| `/api/analytics/track`     | POST     | Client-side PostHog event bridge                                |
| `/api/swarm/[…]`           | GET      | Public swarm analysis results                                   |
| `/api/auth/status`         | GET      | Auth status ping (returns null if unauthenticated)              |
| `/api/health`              | GET      | API health check                                                |
| `/api/agent-os/[…path]`    | GET/POST | Server-side proxy to Agent OS (injects API key)                 |
| `/api/neufin/health`       | GET      | NeuFin infra health from router-system                          |

### Authenticated API routes (Bearer token required)

| Route                | Method   | Description                                 |
| -------------------- | -------- | ------------------------------------------- |
| `/api/vault/[…]`     | GET/POST | Portfolio vault — authenticated user's data |
| `/api/portfolio/[…]` | GET/POST | Portfolio management                        |
| `/api/swarm/start`   | POST     | Start a swarm analysis run                  |
| `/api/reports/[…]`   | GET/POST | Report management                           |

### Advisor-only API routes (role = "advisor" required)

| Route                                         | Method | Description                              |
| --------------------------------------------- | ------ | ---------------------------------------- |
| `/api/admin/users`                            | GET    | List all user profiles with stats        |
| `/api/admin/users/[userId]?extend-trial`      | POST   | Extend a user's trial                    |
| `/api/admin/users/[userId]?resend-onboarding` | POST   | Resend onboarding email                  |
| `/api/revenue/stats`                          | GET    | Stripe + Supabase revenue dashboard data |

---

## Middleware Flow

```
Request
  │
  ├─ pathname === '/'         → ALLOW (landing page)
  │
  ├─ PUBLIC_PREFIXES match?  → ALLOW (no token check)
  │
  ├─ No neufin-auth cookie?  → REDIRECT /auth?next=<pathname>
  │
  ├─ JWT expired or invalid? → REDIRECT /auth?next=<pathname> + clear cookie
  │
  ├─ ADVISOR_ONLY_PREFIXES   → Check user_profiles.role == "advisor"
  │    match?                     NO? → REDIRECT /dashboard
  │
  └─ ALLOW
```

### ADVISOR_ONLY_PREFIXES (as of Prompt 9)

- `/dashboard/admin`
- `/dashboard/revenue`

---

## Cookie Auth Decision

The `neufin-auth` cookie is **intentionally preserved** alongside the `sb-access-token` cookie and `Authorization: Bearer` header.

**Rationale:** The Next.js App Router SSR pages (advisor dashboard, report pages) perform server-side data fetches that automatically forward cookies. The `neufin-auth` cookie is written by `lib/sync-auth-cookie.ts` and carries the same Supabase JWT. Removing it would break SSR auth without any security benefit — both cookies are validated identically via the Supabase `/auth/v1/user` endpoint.

---

## Required Environment Variables

| Variable                        | Used by                                    |
| ------------------------------- | ------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase client, middleware                |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase client, middleware                |
| `SUPABASE_SERVICE_ROLE_KEY`     | Admin API routes, middleware advisor check |
| `NEXT_PUBLIC_POSTHOG_KEY`       | PostHog analytics                          |
| `NEXT_PUBLIC_POSTHOG_HOST`      | PostHog host                               |
| `AGENT_OS_URL`                  | Agent OS proxy                             |
| `AGENT_OS_API_KEY`              | Agent OS proxy                             |
| `STRIPE_SECRET_KEY`             | Revenue stats API route                    |
| `NEXT_PUBLIC_APP_URL`           | Magic link redirect base URL               |
