# Sentry Setup — neufin-backend

## Sentry Project

| Field | Value |
|-------|-------|
| Project name | `neufin-backend` |
| Platform | Python / FastAPI |
| DSN env var | `SENTRY_DSN` |

## Configuration Overview

Sentry is initialised in `main.py` **before all other imports** so that
exceptions raised during module loading (e.g. missing config, bad DB URL) are
captured. Key settings:

| Setting | Development | Production |
|---------|-------------|------------|
| `traces_sample_rate` | `1.0` (100 %) | `0.2` (20 %) |
| `environment` | `development` | `production` |
| `release` | `GIT_COMMIT_SHA` env var | `RAILWAY_GIT_COMMIT_SHA` env var |
| `send_default_pii` | `false` | `false` |
| `before_send` PII filter | active | active |

### PII Filter

Fields named `password`, `token`, `api_key`, or `fernet_key` (case-insensitive)
are redacted to `[REDACTED]` in `request`, `extra`, and `contexts` sections
before the event is transmitted.

### Custom Tags

Every Sentry event is tagged with:
```
service = neufin-backend
company = neufin
```

### Unhandled Exception Response

HTTP 500 responses never include stack traces. The response body is always:
```json
{
  "error": "internal_error",
  "trace_id": "<uuid>",
  "message": "An error occurred. Our team has been notified."
}
```

## Environment Variables

Set these in Railway dashboard → neufin-backend service → Variables:

```
SENTRY_DSN=https://<key>@o<org>.ingest.sentry.io/<project>
GIT_COMMIT_SHA=   # Railway injects RAILWAY_GIT_COMMIT_SHA automatically
```

## Release Format

```
<git-commit-sha>   # 40-character hex, injected by Railway as RAILWAY_GIT_COMMIT_SHA
```

Tag releases manually after deploy via Railway webhook or CI:
```bash
sentry-cli releases new <sha>
sentry-cli releases set-commits <sha> --auto
sentry-cli releases finalize <sha>
```

## Recommended Alert Rules (create in Sentry UI)

1. **High error rate** — `error rate > 5 %` over 5 min → Slack #alerts  
2. **New issue** — any new unhandled exception → Slack #alerts  
3. **P95 latency** — `p95(transaction.duration) > 3000ms` → email  
4. **Crash-free sessions drop** — `< 99 %` over 1 h → PagerDuty  
5. **Sentry quota** — `> 80 % of monthly quota used` → email  

## Local Testing

```bash
# Trigger a test exception (confirm Sentry receives it)
SENTRY_DSN=<your-dsn> uvicorn main:app --reload
curl -X POST http://localhost:8000/debug-sentry   # if you add a test endpoint
```
