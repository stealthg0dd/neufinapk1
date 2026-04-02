# GitHub Actions — Required Secrets

This document lists every secret that must be configured in the repository
**Settings → Secrets and variables → Actions** before workflows run correctly.

> ⚠️ Never commit actual secret values to this file or any file in the repo.

---

## Railway

| Secret | Description |
|---|---|
| `RAILWAY_TOKEN_NEUFIN` | Railway API token scoped to the `neufinapk1` project. Used by `deploy-backend.yml` to run `railway up`. |
| `RAILWAY_BACKEND_URL` | Base URL of the deployed Railway backend (e.g. `https://neufin-backend.up.railway.app`). Used for `/health` assertions post-deploy. |

---

## Vercel

| Secret | Description |
|---|---|
| `VERCEL_TOKEN` | Vercel personal access token. Used by `deploy-web.yml`. |
| `VERCEL_ORG_ID` | Vercel team/org ID (found in team settings). Used by Vercel CLI. |
| `VERCEL_PROJECT_ID_NEUFIN_WEB` | Vercel project ID for `neufin-web` (found in project settings). |

---

## Sentry

| Secret | Description |
|---|---|
| `SENTRY_AUTH_TOKEN` | Sentry internal integration token with `project:releases` scope. |
| `SENTRY_ORG` | Sentry organization slug (e.g. `neufin-aj`). |
| `SENTRY_PROJECT_NEUFIN_BACKEND` | Sentry project slug for the Python backend (e.g. `python-fastapi`). |
| `SENTRY_PROJECT_NEUFIN_WEB` | Sentry project slug for the Next.js frontend (e.g. `neufin-web`). |

---

## Slack Webhooks

Each webhook URL is an Incoming Webhook configured in the Neufin Slack workspace.

| Secret | Channel | Used by |
|---|---|---|
| `SLACK_WEBHOOK_NEUFIN_DEV` | `#neufin-dev` | CI failure alerts (`ci-backend`, `ci-web`, `ci-mobile`) and security scan results. |
| `SLACK_WEBHOOK_NEUFIN_ALERTS` | `#neufin-alerts` | Deploy success/failure (`deploy-backend`, `deploy-web`). |
| `SLACK_WEBHOOK_CTECH_COMMAND` | `#ctech-command` | Backend deploy success/failure (`deploy-backend`). |

---

## Agent OS / Router System

| Secret | Description |
|---|---|
| `AGENT_OS_URL` | Base URL of the router-system/Agent OS (e.g. `https://router.neufin.app`). Used to POST `/api/heartbeat/<service>`. |
| `AGENT_OS_API_KEY` | Bearer token for authenticating heartbeat requests to Agent OS. |

---

## Other (already in use)

These secrets are consumed by existing CI workflows and may already be configured.

| Secret | Description |
|---|---|
| `SUPABASE_URL` | Production Supabase project URL. |
| `SUPABASE_ANON_KEY` | Production Supabase anonymous key. |
| `STAGING_SUPABASE_URL` | Staging Supabase project URL. |
| `STAGING_SUPABASE_ANON_KEY` | Staging Supabase anonymous key. |
| `ANTHROPIC_API_KEY` | Anthropic API key for backend tests. |
| `STRIPE_SECRET_KEY_TEST` | Stripe test-mode secret key for backend tests. |
| `CODECOV_TOKEN` | Codecov upload token for coverage reports. |
| `EXPO_TOKEN` | Expo/EAS token for mobile builds. |
| `POSTHOG_KEY` | PostHog public API key for analytics. |

---

## How to add secrets

```bash
# Via GitHub CLI
gh secret set RAILWAY_TOKEN_NEUFIN        --body "<value>"
gh secret set VERCEL_TOKEN                --body "<value>"
gh secret set VERCEL_ORG_ID               --body "<value>"
gh secret set VERCEL_PROJECT_ID_NEUFIN_WEB --body "<value>"
gh secret set SENTRY_AUTH_TOKEN           --body "<value>"
gh secret set SENTRY_ORG                  --body "<value>"
gh secret set SENTRY_PROJECT_NEUFIN_BACKEND --body "<value>"
gh secret set SENTRY_PROJECT_NEUFIN_WEB   --body "<value>"
gh secret set SLACK_WEBHOOK_NEUFIN_DEV    --body "<value>"
gh secret set SLACK_WEBHOOK_NEUFIN_ALERTS --body "<value>"
gh secret set SLACK_WEBHOOK_CTECH_COMMAND --body "<value>"
gh secret set AGENT_OS_URL                --body "<value>"
gh secret set AGENT_OS_API_KEY            --body "<value>"
gh secret set RAILWAY_BACKEND_URL         --body "<value>"
```
