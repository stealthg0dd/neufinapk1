# Neufin — Developer Onboarding Guide

Welcome to the Neufin codebase. This guide gets you from zero to running all three layers locally in under 30 minutes.

---

## Repo Structure

```
neufinapk1/
├── neufin-backend/        FastAPI API server
├── neufin-web/            Next.js web application
├── neufin-mobile/         Expo React Native (Android)
├── docs/                  Architecture, API reference, deployment runbooks
├── scripts/               Dev, test, and deploy automation
├── infrastructure/        Docker, Kubernetes, Terraform configs
└── .github/               CI/CD workflows, PR templates, issue templates
```

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Python | 3.11+ | `brew install python@3.11` |
| Node.js | 18+ | `brew install node` |
| Docker Desktop | Latest | [docs.docker.com](https://docs.docker.com/desktop/install/mac-install/) |
| Git | 2.x | pre-installed on macOS |
| EAS CLI | Latest | `npm install -g eas-cli` |
| Railway CLI | Latest | `npm install -g @railway/cli` |

---

## Quick Start

```bash
# Clone and run setup script
git clone https://github.com/varunsrivastava/neufinapk1.git
cd neufinapk1
chmod +x scripts/setup-dev.sh
./scripts/setup-dev.sh
```

The setup script installs all dependencies and creates `.env` files from `.env.example` templates.

---

## Backend Setup (neufin-backend)

### 1. Environment Variables

```bash
cd neufin-backend
cp .env.example .env
```

Fill in `.env`:

```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_KEY=<anon_key_for_local>          # use service_role for full access
SUPABASE_JWT_SECRET=<jwt_secret>
ANTHROPIC_API_KEY=sk-ant-...               # required — primary AI provider
GEMINI_API_KEY=AI...                       # optional — fallback
GROQ_API_KEY=gsk_...                       # optional — fallback
OPENAI_API_KEY=sk-...                      # optional — fallback
STRIPE_SECRET_KEY=sk_test_...             # use test key locally
STRIPE_WEBHOOK_SECRET=whsec_...
POLYGON_API_KEY=...
FINNHUB_API_KEY=...
FERNET_KEY=<generated>                    # see DEPLOYMENT.md
APP_BASE_URL=http://localhost:8000
```

At minimum you need: `SUPABASE_URL`, `SUPABASE_KEY`, `ANTHROPIC_API_KEY`, and one market data key (e.g. `FINNHUB_API_KEY`).

### 2. Install and Run

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

API is live at `http://localhost:8000`. Interactive docs at `http://localhost:8000/docs`.

### 3. Run Tests

```bash
./scripts/run-tests.sh backend
```

---

## Frontend Setup (neufin-web)

### 1. Environment Variables

```bash
cd neufin-web
cp .env.local.example .env.local
```

Fill in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

### 2. Install and Run

```bash
cd neufin-web
npm install
npm run dev
```

App is live at `http://localhost:3000`.

### 3. Run Tests

```bash
./scripts/run-tests.sh frontend
```

---

## Mobile Setup (neufin-mobile)

### 1. Install Dependencies

```bash
cd neufin-mobile
npm install
```

### 2. Run on Device (USB)

Connect Android phone via USB, enable Developer Mode and USB Debugging.

```bash
cd neufin-mobile
npx expo start --tunnel
# Scan QR code with Expo Go app, or press 'a' to open on connected Android device
```

### 3. Run Tests

```bash
./scripts/run-tests.sh mobile
```

### 4. Build APK (Preview)

```bash
eas build --profile preview --platform android
```

---

## Local Docker (All Services)

Runs backend + supporting services together:

```bash
docker-compose -f infrastructure/docker/docker-compose.local.yml up
```

Services started:
- `neufin-backend` on port 8000
- `redis` on port 6379 (optional cache layer)

---

## Database

You connect to the shared Supabase project (there is no local Postgres by default). Use your own Supabase project for isolated dev:

1. Create a free project at [supabase.com](https://supabase.com)
2. Run `supabase_migrations_v1.sql` in SQL Editor
3. Update `SUPABASE_URL` and `SUPABASE_KEY` in `.env`

---

## Key Concepts

### DNA Score
The core free-tier product. Accepts CSV → returns 0–100 score across 4 components (HHI concentration, weighted beta, tax alpha, Pearson correlation). See `docs/ARCHITECTURE.md#dna-scoring-model`.

### Agent Swarm
LangGraph 7-agent pipeline triggered on demand. Regime → Strategist → Quant → Tax → Risk → Alpha → Critic → Synthesizer. Takes 30–60s. Results persisted to `swarm_reports` table. See `docs/ARCHITECTURE.md#agent-swarm-architecture`.

### Auth Flow
Supabase Google OAuth with PKCE. Mobile uses deep-link callback (`neufin://auth/callback`). Backend soft-attaches JWT via middleware; protected endpoints use `Depends(get_current_user)` for hard reject.

### Market Data
6-provider fallback chain with 3-tier cache (in-process → Redis → Supabase). Providers are circuit-broken for 60s on rate-limit detection. See `docs/ARCHITECTURE.md#market-data-provider-fallback-chain`.

---

## Common Tasks

### Adding a New API Endpoint

1. Add route to the appropriate router in `neufin-backend/routers/`
2. Add auth (`Depends(get_current_user)`) if user-data is involved
3. Add to `docs/API.md`
4. Add integration test in `neufin-backend/tests/integration/`
5. Open PR using the PR template

### Adding a New Screen (Mobile)

1. Create `neufin-mobile/screens/YourScreen.tsx`
2. Add to `RootStackParamList` in `App.tsx`
3. Register in `Stack.Navigator`
4. Add unit test in `neufin-mobile/__tests__/`

### Schema Changes

1. Write migration SQL in `supabase_migrations_v*.sql`
2. Apply to your dev Supabase project
3. Check the PR template security checklist for RLS policies

---

## Getting Help

- Architecture questions → `docs/ARCHITECTURE.md`
- API questions → `docs/API.md`
- Deployment questions → `docs/DEPLOYMENT.md`
- Security questions → `docs/SECURITY.md`
- Production issues → Railway logs + Sentry dashboard
- File a bug → use `.github/ISSUE_TEMPLATE/bug_report.md`
