# Neufin — Deployment Runbook

## Environments

| Environment | Backend | Frontend | Mobile |
|-------------|---------|----------|--------|
| Production | `neufin101-production.up.railway.app` | `neufin.app` (Vercel) | Play Store (internal track) |
| Staging | `neufin101-staging.up.railway.app` | Vercel Preview (PR branch) | EAS Preview build |
| Local | `localhost:8000` | `localhost:3000` | Expo Go / USB device |

---

## Backend — Railway (Docker)

### Prerequisites
- Railway CLI: `npm install -g @railway/cli`
- Docker Desktop (for local image testing)
- Access to Railway project `neufin101`

### First-Time Setup

```bash
railway login
railway link   # select neufin101 project
```

### Environment Variables

Set in Railway dashboard → neufin101-production → Variables:

```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_KEY=<service_role_key>
SUPABASE_JWT_SECRET=<jwt_secret>
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AI...
GROQ_API_KEY=gsk_...
OPENAI_API_KEY=sk-...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
POLYGON_API_KEY=...
FINNHUB_API_KEY=...
FMP_API_KEY=...
TWELVEDATA_API_KEY=...
MARKETSTACK_API_KEY=...
ALPHA_VANTAGE_API_KEY=...
FRED_API_KEY=...
FERNET_KEY=<base64-fernet-key>
APP_BASE_URL=https://neufin101-production.up.railway.app
REDIS_URL=redis://...   # optional
SENTRY_DSN=https://...  # optional
```

Generate a Fernet key: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`

### Deploy to Production

Production deploys automatically when commits are pushed to `main` via GitHub Actions (`backend-ci.yml`).

Manual deploy:
```bash
cd neufin-backend
railway up --service neufin101-production
```

### Rollback

```bash
# In Railway dashboard → Deployments → select previous deployment → Redeploy
# Or via CLI:
railway rollback --service neufin101-production
```

### Health Check

```bash
curl https://neufin101-production.up.railway.app/health
# Expected: {"status": "ok", "version": "..."}
```

### Logs

```bash
railway logs --service neufin101-production --tail
```

---

## Frontend — Vercel (Next.js)

### First-Time Setup

Connect GitHub repo to Vercel:
1. Vercel dashboard → New Project → Import `neufinapk1` → select `neufin-web` as root directory
2. Set environment variables (see below)
3. Vercel auto-deploys on every push to `main`

### Environment Variables

Set in Vercel dashboard → neufin-web → Settings → Environment Variables:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
NEXT_PUBLIC_API_BASE_URL=https://neufin101-production.up.railway.app
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_SENTRY_DSN=https://...
```

### Deploy to Production

Automatic on push to `main`. Preview deployments created for every PR.

Manual deploy:
```bash
cd neufin-web
npx vercel --prod
```

### Rollback

Vercel dashboard → Deployments → select previous deployment → Promote to Production.

---

## Mobile — EAS Build (Expo Android)

### Prerequisites

```bash
npm install -g eas-cli
eas login   # Expo account credentials
```

### Build Variants

| Command | Output | Use |
|---------|--------|-----|
| `eas build --profile preview --platform android` | APK | Internal testing |
| `eas build --profile production --platform android` | AAB | Play Store submission |

### EAS Secrets

Set in Expo dashboard → neufin-mobile → Secrets, or via CLI:

```bash
eas secret:create --scope project --name SUPABASE_URL --value "..."
eas secret:create --scope project --name SUPABASE_ANON_KEY --value "..."
eas secret:create --scope project --name API_BASE_URL --value "https://neufin101-production.up.railway.app"
```

### Release to Play Store (Internal Track)

```bash
# Tag triggers CI/CD auto-submit (see mobile-ci.yml)
git tag mobile-v1.0.3
git push origin mobile-v1.0.3

# Or manual:
eas build --profile production --platform android
eas submit --platform android --latest
```

### OTA Updates (currently disabled)

expo-updates is currently set to `"enabled": false` in app.json. To re-enable:

1. Create an EAS Update channel: `eas channel:create production`
2. In app.json, set `"updates": { "enabled": true, "url": "https://u.expo.dev/<project-id>", "channel": "production" }`
3. Publish: `eas update --branch production --message "Fix: ..."`

---

## Database — Supabase

### Migrations

Schema changes must be applied in order. Migration files live in `supabase_migrations_v*.sql`.

```bash
# Apply a new migration
supabase db push --db-url postgresql://postgres:<password>@<host>:5432/postgres

# Or via Supabase dashboard → SQL Editor → paste migration SQL
```

### RLS Policies

Row Level Security is enforced on all user-data tables. Policies are defined in migration files. When adding a new table:
1. Enable RLS: `ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;`
2. Add appropriate `SELECT/INSERT/UPDATE/DELETE` policies scoped to `auth.uid()`
3. Document in `supabase_migrations_v*.sql`

### Backups

Supabase Pro tier: automated daily backups with 7-day retention. Point-in-time recovery available.

Manual export:
```bash
pg_dump postgresql://postgres:<password>@<host>:5432/postgres > backup_$(date +%Y%m%d).sql
```

---

## Stripe Webhooks

### Production Webhook

Configure in Stripe Dashboard → Webhooks → Add endpoint:
- URL: `https://neufin101-production.up.railway.app/api/payments/webhook`
- Events: `checkout.session.completed`, `customer.subscription.deleted`, `invoice.payment_failed`

Copy the signing secret → set as `STRIPE_WEBHOOK_SECRET` in Railway.

### Testing Webhooks Locally

```bash
stripe listen --forward-to localhost:8000/api/payments/webhook
# Use test mode keys for local development
```

---

## Monitoring & Observability

### Sentry

Error tracking for backend (Python) and frontend (Next.js). Set `SENTRY_DSN` in both Railway and Vercel.

Alert thresholds configured in Sentry dashboard → Alerts.

### Railway Metrics

CPU/memory/request graphs available in Railway dashboard → neufin101-production → Metrics.

### Log Retention

- Railway: 7 days (Pro plan)
- Vercel: Function logs available in deployment details
- Supabase: Postgres logs via dashboard → Logs

---

## CI/CD Pipeline

See `.github/workflows/` for full pipeline definitions.

| Trigger | Jobs |
|---------|------|
| PR opened | lint, typecheck, tests, security scan, staging deploy |
| Push to `main` | lint, tests, production deploy |
| `mobile-v*` tag | EAS production build, Play Store submit |

Secrets required in GitHub repository settings:
- `RAILWAY_TOKEN`
- `EXPO_TOKEN`
- `SENTRY_AUTH_TOKEN`
- `SUPABASE_URL`, `SUPABASE_KEY`
- `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY_TEST`
