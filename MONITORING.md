# Neufin Production Monitoring

This document describes the monitoring setup for all three layers of the Neufin platform:
- **Backend** — FastAPI on Railway (`https://neufin101-production.up.railway.app`)
- **Web** — Next.js on Vercel (`https://neufin.ai`)
- **Mobile** — React Native / Expo (EAS builds)

---

## 1. Sentry (Error Tracking)

### Projects
| Layer   | Project name       | DSN env var                  |
|---------|--------------------|------------------------------|
| Backend | `neufin-backend`   | `SENTRY_DSN`                 |
| Web     | `neufin-web`       | `NEXT_PUBLIC_SENTRY_DSN`     |
| Mobile  | `neufin-mobile`    | `EXPO_PUBLIC_SENTRY_DSN`     |

### What's captured
- **All unhandled exceptions** — automatic via SDK integration
- **User context** — `user_id` and `email` attached on every authenticated request
  (backend: auth middleware; web: `AuthProvider`; mobile: `onAuthStateChange`)
- **Endpoint tag** — `endpoint = /api/…` tagged per backend request
- **Stripe failures** — subscription upgrade/downgrade exceptions captured with `stripe_event_type` tag
- **Poor Web Vitals** — LCP/FID/CLS/INP `> "poor"` threshold emits a Sentry `warning`

### Recommended Sentry alert rules
```
# Email on any new error (set in Sentry project settings → Alerts)
Rule: Issue is first seen → send email to team@neufin.com

# Slack on error spike
Rule: event count > 10 in 1 hour → send to #neufin-alerts Slack channel

# PagerDuty for payment failures
Rule: issue matches stripe_event_type=* → escalate to PagerDuty
```

### Session Replay
Enabled in `neufin-web/sentry.client.config.ts`:
- Error sessions: 100% replayed
- All sessions: 10% sampled
- PII masked (text and media)

---

## 2. Web Vitals (Vercel + PostHog)

Core Web Vitals are reported automatically via the `WebVitals` client component in `app/components/WebVitals.tsx`.

### Performance budgets
| Metric | Good    | Needs Improvement | Poor    |
|--------|---------|-------------------|---------|
| LCP    | < 2.5 s | < 4.0 s           | ≥ 4.0 s |
| FID    | < 100 ms| < 300 ms          | ≥ 300 ms|
| CLS    | < 0.1   | < 0.25            | ≥ 0.25  |
| FCP    | < 1.8 s | < 3.0 s           | ≥ 3.0 s |
| TTFB   | < 800 ms| < 1.8 s           | ≥ 1.8 s |
| INP    | < 200 ms| < 500 ms          | ≥ 500 ms|

### Where metrics flow
1. **PostHog** — `web_vital` event with `metric_name`, `metric_value`, `metric_rating`, `page_url`
   → Query in PostHog: filter `event = web_vital`, group by `metric_name`

2. **Sentry** — `captureMessage` at `warning` level for any **poor** metric
   → Shows in Sentry Issues filtered by `tag:web_vital`

3. **Console** — verbose in `NODE_ENV=development`

### Vercel alerts to configure
In Vercel dashboard → Project → Settings → Web Vitals:
- Set performance budget thresholds matching the table above
- Enable email notifications on budget breaches
- Enable Slack notifications for `> 5%` error rate

---

## 3. Prometheus + Grafana

### Metrics endpoint
`GET https://neufin101-production.up.railway.app/metrics`

No auth required (included in `PUBLIC_PATHS`). Returns Prometheus text format.

### Key metrics (from `prometheus-fastapi-instrumentator`)
| Metric | Description |
|--------|-------------|
| `http_requests_total` | Counter — total requests by `handler`, `method`, `status_code` |
| `http_request_duration_seconds` | Histogram — latency distribution by `handler` |
| `http_requests_in_progress` | Gauge — current in-flight requests |

### Grafana setup
1. Add Prometheus datasource pointing to `/metrics`
2. Import `monitoring/grafana-dashboard.json` (Dashboards → Import → Upload JSON)
3. Dashboard includes: request rate, 5xx error rate, p50/p95/p99 latency, DNA/swarm volume, payment events, in-flight requests

### Useful PromQL queries
```promql
# Overall request rate
rate(http_requests_total[5m])

# 5xx error rate (alert threshold: > 5%)
rate(http_requests_total{status_code=~"5.."}[5m]) / rate(http_requests_total[5m])

# p95 latency (alert threshold: > 2s)
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# DNA analyses per hour
rate(http_requests_total{handler=~".*/analyze-dna.*",status_code="200"}[1h]) * 3600
```

---

## 4. Railway Monitoring

### Log-based alerts
In Railway dashboard → Project → Deployments → Logs:

1. Click **Set up log alerts** (or use Railway API)
2. Create filter: `level:error` → email `team@neufin.com`
3. Create filter: `CRITICAL` → Slack webhook `#neufin-alerts`

### Recommended Railway alerts
| Trigger | Channel |
|---------|---------|
| Deployment failure | Email + Slack |
| Container restart | Email |
| Memory > 80% for 5 min | Slack |
| CPU > 80% for 5 min | Slack |

### Health check
Railway pings `GET /health` every 30s (configured in `railway.toml`).
Manual check: `curl https://neufin101-production.up.railway.app/health`

---

## 5. Stripe Monitoring

### Webhook endpoint
`POST /api/stripe/webhook` — handles `checkout.session.completed` and `customer.subscription.deleted`.

Failures are captured to Sentry with `stripe_event_type` tag.

### Stripe Dashboard alerts (configure at dashboard.stripe.com)
1. **Payment radar** → enable fraud alerts
2. **Webhook monitoring** → Developers → Webhooks → select endpoint → enable email alerts
3. **Revenue alerts** → Billing → set revenue threshold notifications

### Alert thresholds
| Event | Action |
|-------|--------|
| Webhook delivery failures > 3 in 1h | Email + Slack |
| Payment failure rate > 5% | Slack + investigate |
| Disputed charge | Immediate email |

---

## 6. Supabase Monitoring

### Database health
In Supabase dashboard → Project → Reports:
- **Query performance** — identify slow queries (> 1s)
- **Database size** — alert when > 80% of quota
- **Connection pool** — alert when > 90% utilised

### Recommended Supabase alerts
In Supabase dashboard → Project → Settings → Alerts:
- Slow queries (> 1000ms)
- Connection pool exhaustion
- Storage nearing limit

---

## 7. Weekly Review Checklist

Run every **Monday morning**:

### Error trends (Sentry)
- [ ] Review new issues created in the last 7 days
- [ ] Check error rate trends (up/down/stable)
- [ ] Resolve or assign any P0/P1 issues
- [ ] Review Stripe-tagged issues

### Performance (Grafana / Vercel)
- [ ] Check p95 latency — should be < 2s for all endpoints
- [ ] Review Web Vitals dashboard in PostHog
- [ ] Check 5xx error rate — should be < 0.1%

### User growth (PostHog / Supabase)
- [ ] DAU/WAU/MAU trends
- [ ] Funnel: landing → upload → DNA score → sign up → purchase
- [ ] New user signups this week

### Revenue (Stripe)
- [ ] Gross revenue vs previous week
- [ ] MRR (subscription) trend
- [ ] Failed payments / churn events

### Infrastructure costs (Railway / Vercel / Supabase)
- [ ] Railway usage vs budget
- [ ] Supabase database size
- [ ] Vercel bandwidth

---

## 8. Incident Response

### Severity levels
| Severity | Definition | Response time |
|----------|-----------|---------------|
| P0 | Production down / payment processing broken | 15 min |
| P1 | Core feature broken (auth, DNA score, swarm) | 1 hour |
| P2 | Non-critical feature broken | 4 hours |
| P3 | Cosmetic / minor issues | Next sprint |

### Rollback procedure
```bash
# 1. Find the last good tag
git log --oneline --tags

# 2. Revert main to last good commit
git revert <bad-commit-sha>
git push origin main
# Railway auto-deploys from main

# 3. Revert Vercel (if needed)
vercel rollback --yes

# 4. Notify users via status page
```

### Escalation contacts
Document team contacts in a private channel/doc — never commit contact details to the repository.
