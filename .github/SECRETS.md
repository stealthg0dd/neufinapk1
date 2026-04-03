# GitHub Actions — Required Secrets

This document lists every secret that must be configured in the repository
**Settings → Secrets and variables → Actions** before workflows run correctly.

> ⚠️ Never commit actual secret values to this file or any file in the repo.

Last audited: 2026-04-03

---

## Audit Status Legend
- ✅ **CONFIRMED SET** — workflow that uses it is currently passing
- ❓ **UNKNOWN** — can only be confirmed in Repository Settings (requires admin access)
- ❌ **MISSING** — referenced in workflow but confirmed absent / workflow failing because of it

---

## Railway

| Secret | Status | Description |
|---|---|---|
| `RAILWAY_TOKEN` | ✅ CONFIRMED SET | Railway API token. Used by `deploy-backend.yml` (`railway up --service Neufin101`). **Note: was incorrectly documented as `RAILWAY_TOKEN_NEUFIN` — corrected here.** |
| `RAILWAY_BACKEND_URL` | ✅ CONFIRMED SET | Base URL of Railway backend (e.g. `https://neufin101-production.up.railway.app`). Used for post-deploy `/health` assertions. |

---

## Vercel

| Secret | Status | Description |
|---|---|---|
| `VERCEL_TOKEN` | ⚠️ NEEDS RENEWAL | Vercel personal access token. Used by `deploy-web.yml`. **Deploy Web is failing with "token not valid" as of 2026-04-03.** Token has been revoked or expired. Regenerate at: vercel.com → Account Settings → Tokens → Create → select "Full Account" scope. Then: `gh secret set VERCEL_TOKEN --body "<new-token>"`. |
| `VERCEL_ORG_ID` | ✅ CONFIRMED SET | Vercel team/org ID. Found in: vercel.com → Team Settings → General. Format: `team_xxxx`. |
| `VERCEL_PROJECT_ID_NEUFIN_WEB` | ✅ CONFIRMED SET | Vercel project ID for `neufin-web`. Found in: vercel.com → Project Settings → General. Format: `prj_xxxx`. |

---

## Sentry

| Secret | Status | Description |
|---|---|---|
| `SENTRY_AUTH_TOKEN` | ✅ CONFIRMED SET | Internal integration token with `project:releases` scope. Get from: sentry.io → Settings → Auth Tokens. |
| `SENTRY_ORG` | ✅ CONFIRMED SET | Sentry organization slug (e.g. `neufin-aj`). Found in Sentry org settings URL. |
| `SENTRY_PROJECT_NEUFIN_BACKEND` | ❓ UNKNOWN | Sentry project slug for Python backend (e.g. `python-fastapi`). Used by `deploy-backend.yml`. |
| `SENTRY_PROJECT_NEUFIN_WEB` | ❓ UNKNOWN | Sentry project slug for Next.js frontend (e.g. `neufin-web`). Used by `deploy-web.yml`. |

---

## Slack Webhooks

Each webhook URL is an Incoming Webhook configured in the Neufin Slack workspace.

| Secret | Status | Channel | Used by |
|---|---|---|---|
| `SLACK_WEBHOOK_NEUFIN_DEV` | ✅ CONFIRMED SET | `#neufin-dev` | CI failure alerts (all CI workflows) and security scan results. |
| `SLACK_WEBHOOK_NEUFIN_ALERTS` | ✅ CONFIRMED SET | `#neufin-alerts` | Deploy success/failure (`deploy-backend`, `deploy-web`). |
| `SLACK_WEBHOOK_CTECH_COMMAND` | ✅ CONFIRMED SET | `#ctech-command` | Deploy success/failure (`deploy-backend`, `deploy-web`). |

---

## Agent OS / Router System

| Secret | Status | Description |
|---|---|---|
| `AGENT_OS_URL` | ✅ CONFIRMED SET | Base URL of the router-system (e.g. `https://ctech-production.up.railway.app`). Used to POST `/api/heartbeat/<service>` after deploys. |
| `AGENT_OS_API_KEY` | ✅ CONFIRMED SET | Bearer token for heartbeat requests to Agent OS. |

---

## CI / Test Secrets

| Secret | Status | Description |
|---|---|---|
| `SUPABASE_URL` | ✅ CONFIRMED SET | Production Supabase project URL. Used by `ci-backend.yml` tests. |
| `SUPABASE_ANON_KEY` | ✅ CONFIRMED SET | Production Supabase anonymous key. Used by `ci-backend.yml`. |
| `STAGING_SUPABASE_URL` | ❓ UNKNOWN | Staging Supabase project URL. Used by `ci-web.yml` as `NEXT_PUBLIC_SUPABASE_URL`. Falls back to `https://ci-placeholder.supabase.co` if unset. |
| `STAGING_SUPABASE_ANON_KEY` | ❓ UNKNOWN | Staging Supabase anon key. Falls back to `ci-placeholder-anon-key` if unset. |
| `STAGING_API_URL` | ❓ UNKNOWN | Staging API URL for `ci-web.yml` build. Falls back to `https://api.example.com` if unset. Format: `https://<staging-subdomain>.up.railway.app`. |
| `ANTHROPIC_API_KEY` | ✅ CONFIRMED SET | Anthropic API key for backend tests. |
| `STRIPE_SECRET_KEY_TEST` | ✅ CONFIRMED SET | Stripe test-mode secret key for backend tests. |
| `CODECOV_TOKEN` | ❓ UNKNOWN | Codecov upload token. Step uses `continue-on-error: true` so missing value is non-fatal. |
| `POSTHOG_KEY` | ❓ UNKNOWN | PostHog public API key. Falls back to empty string if unset (non-fatal). |

---

## Complete `gh secret set` commands

```bash
# Railway
gh secret set RAILWAY_TOKEN                  --body "<railway-api-token>"
gh secret set RAILWAY_BACKEND_URL            --body "https://neufin101-production.up.railway.app"

# Vercel
gh secret set VERCEL_TOKEN                   --body "<vercel-personal-access-token>"
gh secret set VERCEL_ORG_ID                  --body "<team_xxxx>"
gh secret set VERCEL_PROJECT_ID_NEUFIN_WEB   --body "<prj_xxxx>"

# Sentry
gh secret set SENTRY_AUTH_TOKEN              --body "<sntrys_...>"
gh secret set SENTRY_ORG                     --body "<org-slug>"
gh secret set SENTRY_PROJECT_NEUFIN_BACKEND  --body "<project-slug>"
gh secret set SENTRY_PROJECT_NEUFIN_WEB      --body "<project-slug>"

# Slack
gh secret set SLACK_WEBHOOK_NEUFIN_DEV       --body "https://hooks.slack.com/services/..."
gh secret set SLACK_WEBHOOK_NEUFIN_ALERTS    --body "https://hooks.slack.com/services/..."
gh secret set SLACK_WEBHOOK_CTECH_COMMAND    --body "https://hooks.slack.com/services/..."

# Agent OS
gh secret set AGENT_OS_URL                   --body "https://ctech-production.up.railway.app"
gh secret set AGENT_OS_API_KEY               --body "<api-key>"

# CI test secrets
gh secret set SUPABASE_URL                   --body "https://xxxx.supabase.co"
gh secret set SUPABASE_ANON_KEY              --body "eyJ..."
gh secret set STAGING_SUPABASE_URL           --body "https://xxxx.supabase.co"
gh secret set STAGING_SUPABASE_ANON_KEY      --body "eyJ..."
gh secret set STAGING_API_URL                --body "https://neufin101-production.up.railway.app"
gh secret set ANTHROPIC_API_KEY              --body "sk-ant-..."
gh secret set STRIPE_SECRET_KEY_TEST         --body "sk_test_..."
gh secret set CODECOV_TOKEN                  --body "<codecov-token>"
gh secret set POSTHOG_KEY                    --body "phc_..."
```

