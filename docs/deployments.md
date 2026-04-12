# Neufin Deployment Guide

## Branch Strategy

| Branch | Purpose | Deploys to |
|--------|---------|--------------|
| main | Production only | www.neufin.ai + Railway prod |
| develop | Staging integration | staging.neufin.ai + Railway staging |
| feature/* | Active work | Vercel preview URLs |
| hotfix/* | Urgent prod fixes | Direct to main via PR |

## Release Flow

1. Create branch: `git checkout -b feature/my-feature develop`
2. Work locally, push to remote
3. Open PR into `develop`
4. CI runs (Backend, Web, Mobile, Release Gate)
5. Vercel creates preview URL for the PR
6. QA tests on staging (staging.neufin.ai)
7. Merge PR into `develop`
8. Staging deploy triggers automatically
9. Smoke tests run against staging
10. When staging is confirmed good, open PR: `develop → main`
11. Require 1 approval + all checks green
12. Merge to main → production deploys

## Environment URLs

| Environment | Web | Backend |
|---------------|-----|---------|
| Production | https://www.neufin.ai | https://neufin101-production.up.railway.app |
| Staging | https://staging.neufin.ai | https://neufin101-staging.up.railway.app |

## Environment Variables

Never share production secrets with staging. Key differences:

| Variable | Production | Staging |
|----------|------------|---------|
| STRIPE_SECRET_KEY | sk_live_... | sk_test_... |
| SUPABASE_URL | Production Supabase project | Staging Supabase project |
| ENVIRONMENT | production | staging |
| ALLOWED_ORIGINS | www.neufin.ai | staging.neufin.ai |

## Rollback Procedures

### Railway (Backend)

1. Railway dashboard → your service → Deployments tab
2. Find last working deployment
3. Click the three dots → Redeploy
4. Or: `git revert <commit> && git push origin main`

### Vercel (Web)

1. Vercel dashboard → your project → Deployments
2. Find last good deployment
3. Click the three dots → Promote to Production
4. Takes 30 seconds, zero downtime

## Protecting Main

Branch protection rules (set in GitHub Settings → Branches):

- Require pull request: ON
- Required status checks: CI Backend, CI Web, Release Gate
- Require approvals: 1
- Block direct pushes: ON
- Dismiss stale reviews: ON

## Mobile Staging Note

Mobile app (neufin-mobile) has a hardcoded production API URL fallback.
To test against staging, set EXPO_PUBLIC_API_URL in the EAS build profile
before triggering a preview build.
