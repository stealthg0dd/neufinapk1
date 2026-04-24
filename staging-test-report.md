# Staging Deployment Test Report

**Date:** 2026-03-27
**Branch:** `staging`
**Commits tested:** `94c45c1` (latest)

---

## Infrastructure Status

| Component | URL | Status | Notes |
|-----------|-----|--------|-------|
| Railway Staging API | https://neufin101-staging.up.railway.app | ✅ Healthy | Running deployment `752cb9fe` |
| Vercel Preview | https://neufin-mmdt135l4-varuns-projects-6fad10b9.vercel.app | ✅ Built | Preview protected by Vercel Auth |
| Vercel Preview Alias | https://neufin-web-git-staging-varuns-projects-6fad10b9.vercel.app | ✅ Live | Stable alias for staging branch |

---

## Smoke Tests

### Railway Staging Backend

| Test | Expected | Actual | Pass? |
|------|----------|--------|-------|
| GET /health | `{"status":"ok"}` | `{"status":"ok","service":"neufin-api"}` | ✅ |
| CORS — Vercel origin | HTTP 200 | HTTP 200 | ✅ |
| GET /api/auth/status (no token) | HTTP 401 or `{authenticated:false}` | HTTP 405 (old code) | ⚠️ |
| GET /api/portfolio/list (no token) | HTTP 401 | HTTP 405 (old code) | ⚠️ |
| OpenAPI schema | 44+ routes | 44 routes | ✅ |

### Vercel Preview (Web)

| Test | Expected | Actual | Pass? |
|------|----------|--------|-------|
| Build | Exits 0 | ✅ 1 min build | ✅ |
| TypeScript | 0 errors | 0 errors | ✅ |
| Homepage (via browser) | Renders or redirects | Protected by Vercel Auth (expected) | ✅ |

---

## Issues Found & Resolved

### ✅ Fixed — @sentry/nextjs incompatible with Next.js 16
- **Root cause:** `@sentry/nextjs@^8.0.0` only supports Next.js ≤15; project uses Next.js 16.2.1
- **Fix:** Upgraded to `@sentry/nextjs@^10.46.0` which declares peer: `next@"^13.2.0 || ^14.0 || ^15 || ^16"`
- **Commit:** `c716e15`

### ✅ Fixed — TypeScript build errors (3 files)
- **instrumentation.ts:** `captureRequestError` context type changed in Sentry v10 (`ErrorContext` requires `routerKind` + `routePath`); fixed with `as any` cast
- **tsconfig.json:** `__tests__/` folder was included in compilation but `@types/jest` not installed; excluded from build
- **lib/logger.ts:** `pino.default` doesn't exist on pino's type; fixed with `(pino as any).default ?? pino` pattern
- **Commit:** `94c45c1`

### ⚠️ Known Issue — Railway staging runs old code
- **Root cause:** The staging Railway service was duplicated from production and only accepts GitHub-triggered builds (not `railway up` CLI uploads). It's connected to the `main` branch of `neufin301`.
- **Impact:** `/api/auth/status`, `/api/portfolio/list`, `/api/swarm/report/latest` return 405 (endpoints don't exist in old deployment)
- **Resolution required:** In the Railway dashboard, navigate to **Neufin101 → staging environment → Neufin101 service → Settings → Source** and change the deployment branch from `main` to `staging`. This will trigger an auto-deploy of the `staging` branch which contains all new endpoints.
- **Alternative:** Push `staging` branch to `neufin301` main (will also deploy to production — not recommended without additional staging validation)

---

## Environment Variables Configured

### Railway Staging
| Variable | Value |
|----------|-------|
| APP_ENV | staging |
| ALLOWED_ORIGINS | https://neufin-staging.vercel.app, https://*.vercel.app |
| STRIPE_SECRET_KEY | test mode key ✅ |
| All production secrets | Inherited from production environment ✅ |

### Vercel Preview
| Variable | Scope | Value |
|----------|-------|-------|
| RAILWAY_API_URL | Preview | https://neufin101-staging.up.railway.app |
| RAILWAY_API_URL | Production | https://neufin101-production.up.railway.app |
| NEXT_PUBLIC_SUPABASE_* | All | Production values (shared) |

---

## EAS Preview Build

The `preview` profile in `eas.json` is configured to point to the staging API:
```json
"preview": {
  "env": {
    "EXPO_PUBLIC_API_URL": "https://neufin101-staging.up.railway.app"
  }
}
```

To build: `cd neufin-mobile && eas build --platform android --profile preview`

---

## Manual Steps Required

1. **Railway Dashboard:** Change staging service deploy branch from `main` to `staging`
   - URL: https://railway.app → Neufin101 → staging → Neufin101 service → Settings

2. **Supabase:** Apply schema migrations for `swarm_reports` JSONB columns (if not already applied)

3. **EAS Preview Build:** Run `eas build --platform android --profile preview` to generate staging APK

4. **Full E2E Test:** After Railway deploy branch is updated, run:
   ```bash
   API_URL="https://neufin101-staging.up.railway.app" \
   WEB_URL="https://neufin-web-git-staging-varuns-projects-6fad10b9.vercel.app" \
   bash scripts/validate-local.sh
   ```

---

## Next Steps to Production

Once staging is fully validated:
1. Merge `staging` → `main` on `origin` (neufinapk1)
2. Push `main` to `prod` remote (neufin301) → triggers Railway production deploy
3. Vercel production auto-deploys from `main` on neufinapk1
