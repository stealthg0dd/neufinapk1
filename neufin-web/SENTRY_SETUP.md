# Sentry Setup — neufin-web

## Sentry Project

| Field | Value |
|-------|-------|
| Project name | `neufin-web` |
| Platform | JavaScript / Next.js |
| Client DSN env var | `NEXT_PUBLIC_SENTRY_DSN` |
| Server DSN env var | `SENTRY_DSN` |

## Configuration Files

| File | Runtime | Notes |
|------|---------|-------|
| `sentry.client.config.ts` | Browser | Session Replay enabled (10 % / 100 % on error) |
| `sentry.server.config.ts` | Node.js | Loaded via `instrumentation.ts` |
| `sentry.edge.config.ts` | Vercel Edge | Loaded via `instrumentation.ts` |
| `instrumentation.ts` | Both | Hooks into Next.js 15 `register()` & `onRequestError()` |
| `next.config.js` | Build | `withSentryConfig` wraps build; tunnels via `/monitoring` |
| `components/SentryUserContext.tsx` | Browser | Sets user id+email on auth state change |

## User Context

`SentryUserContext` is mounted in the root layout inside `<AuthProvider>`.
It subscribes to Supabase auth state changes and calls `Sentry.setUser()` with
`{ id, email }` on sign-in, and `Sentry.setUser(null)` on sign-out.

## Custom Tags

Every event is tagged:
```
service = neufin-web
company = neufin
```

## Environment Variables

Set these in Vercel dashboard → Project → Environment Variables:

```bash
# Required on server (not exposed to browser)
SENTRY_DSN=https://<key>@o<org>.ingest.sentry.io/<project>
SENTRY_ORG=neufin-aj
SENTRY_PROJECT=neufin-web
SENTRY_AUTH_TOKEN=<token>          # for source map upload in CI

# Required on client (safe to expose)
NEXT_PUBLIC_SENTRY_DSN=https://<key>@o<org>.ingest.sentry.io/<project>
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.1    # 1.0 in staging
NEXT_PUBLIC_SENTRY_RELEASE=<git-sha>
NEXT_PUBLIC_APP_ENV=production

# Optional
SENTRY_RELEASE=<git-sha>           # populated by CI / Vercel automatically
SENTRY_TRACES_SAMPLE_RATE=0.1
APP_ENV=production
```

## Release Format

```
<vercel-git-commit-sha>   # injected by Vercel as VERCEL_GIT_COMMIT_SHA
```

CI (GitHub Actions) creates releases automatically via `getsentry/action-release`.

## Recommended Alert Rules (create in Sentry UI)

1. **JS error spike** — `issue.category:error count > 10` in 5 min → Slack #alerts  
2. **New issue** — any new unhandled browser exception → Slack #web-errors  
3. **Session replay anomaly** — `replays_with_errors > 5 %` → email  
4. **P95 LCP > 2.5 s** — (via Vercel Speed Insights or Sentry perf) → email  
5. **CSP violation** — any report-uri hit → Slack #security  
