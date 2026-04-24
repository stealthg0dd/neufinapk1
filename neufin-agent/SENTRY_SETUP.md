# Sentry Setup — neufin-agent

## Sentry Project

| Field | Value |
|-------|-------|
| Project name | `neufin-agent` |
| Platform | Python / FastAPI |
| DSN env var | `SENTRY_DSN` |

## Configuration Overview

Sentry is initialised near the top of `main.py` after `load_dotenv()` but
before all route and scheduler registration.

| Setting | Development | Production |
|---------|-------------|------------|
| `traces_sample_rate` | `1.0` (100 %) | `0.2` (20 %) |
| `profiles_sample_rate` | `0.1` | `0.1` |
| `environment` | from `ENVIRONMENT` env var | from `ENVIRONMENT` env var |
| `release` | `GIT_COMMIT_SHA` or `RAILWAY_GIT_COMMIT_SHA` | same |
| `send_default_pii` | `false` | `false` |

### PII Filter

Fields named `password`, `token`, `api_key`, `fernet_key`, or `secret`
(case-insensitive) are replaced with `[REDACTED]` before transmission.

### Custom Tags

```
service = neufin-agent
company = neufin
```

### Exception Capture Points

`sentry_sdk.capture_exception(exc)` is called before `log.error()` in:
- `scheduled_scan()` — periodic full-repo scan errors
- `daily_summary_job()` — Slack daily summary failures
- `weekly_trend_job()` — Slack weekly trend failures

The FastAPI integration automatically captures unhandled route exceptions.
The LoggingIntegration captures any `logging.ERROR` log entry as a Sentry event.

## Environment Variables

Set in Railway dashboard → neufin-agent service → Variables:

```bash
SENTRY_DSN=https://<key>@o<org>.ingest.sentry.io/<project>
ENVIRONMENT=production           # defaults to "production" if unset
# RAILWAY_GIT_COMMIT_SHA is injected automatically by Railway
```

## Release Format

```
<git-commit-sha>   # 40-character hex from RAILWAY_GIT_COMMIT_SHA
```

## Recommended Alert Rules (create in Sentry UI)

1. **Scan failure** — issue title contains "scheduled_scan_error" → Slack #agent-alerts
2. **New issue** — any new unhandled exception → Slack #agent-alerts
3. **Error rate > 5 %** — over 10 min window → email
4. **Notification failure** — "daily_summary_error" or "weekly_trend_error" → email
5. **High latency scan** — `p95(transaction.duration) > 30 000ms` → email

## Local Testing

```bash
# Verify Sentry receives events locally
SENTRY_DSN=<your-dsn> ENVIRONMENT=development \
  uvicorn main:app --reload --port 8001

# Trigger a test scan exception manually via the API
curl -X POST http://localhost:8001/api/scan/trigger
```
