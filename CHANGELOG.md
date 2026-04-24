# Changelog

All notable changes to the Neufin platform are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-03-27

### Added
- **Observability** — Sentry error tracking for backend (FastAPI), web (Next.js), and mobile (React Native / Expo)
- **Backend structured logging** — `structlog` replaces ad-hoc `print()` calls; emits newline-delimited JSON in production, colourised console in development; configurable via `LOG_LEVEL` / `LOG_FORMAT` env vars
- **Backend metrics** — Prometheus `/metrics` endpoint via `prometheus-fastapi-instrumentator`; tracks HTTP request counts, latency histograms, and in-flight requests
- **Web structured logging** — `pino` server-side logger + isomorphic `lib/logger.ts` utility; redacts auth tokens and PII fields automatically
- **Web security linting** — `eslint-plugin-security` added to dev dependencies; `.eslintrc.json` configured with `recommended-legacy` ruleset
- **Dependency scanning** — `.github/dependabot.yml` for automated weekly dependency updates across pip (backend), npm (web + mobile), and GitHub Actions
- **Ruff + mypy config** — `neufin-backend/pyproject.toml` consolidates linter, formatter, type-checker, pytest, and coverage settings
- **Bandit config** — `neufin-backend/.bandit` documents intentional skip rules (B101, B104, B311)
- `GET /api/portfolio/list` — JWT-authenticated endpoint returning `PortfolioSummary[]` with `positions_count` and latest `dna_score`
- `GET /api/swarm/report/latest` — JWT-authenticated endpoint returning most recent `SwarmReport` with full nested agent outputs; backwards-compatible reconstruction for legacy flat-field reports
- `GET /api/auth/status` — unauthenticated probe returning `{authenticated, user_id, expires_at}`
- **Landing page** — Two-user-type CTAs (Retail Investor + Advisor) with clear conversion paths
- **Onboarding flow** — `/onboarding` page with user-type selection, firm logo upload (advisors), and portfolio claiming
- **Mobile auth** — `LoginScreen` with Google OAuth via `expo-auth-session`; token persistence in `AsyncStorage`
- **Local validation suite** — `scripts/validate-local.sh` covering health, auth, upload, swarm, payment, and code audit checks
- **Staging environment** — Railway staging service (`neufin101-staging.up.railway.app`), Vercel preview (staging branch), EAS preview profile

### Changed
- `neufin-backend/routers/swarm.py` — `_persist_swarm_result` now stores `market_regime`, `quant_analysis`, `tax_report`, `risk_sentinel`, `alpha_scout`, `strategist_intel` as JSONB columns alongside existing flat scalar fields
- `neufin-web/next.config.js` — `withSentryConfig` wrapper applied when `SENTRY_DSN` is set; added `Permissions-Policy` and `X-DNS-Prefetch-Control` security headers
- `neufin-web/vercel.json` — Removed hardcoded Railway rewrites; per-environment `RAILWAY_API_URL` now controls backend routing
- `neufin-mobile/eas.json` — `preview` profile points to staging backend; `production` profile points to production backend

### Fixed
- `neufin-web/app/auth/callback/page.tsx` — removed 10-second timeout race condition; replaced with proper `INITIAL_SESSION` / `onAuthStateChange` handler; added error state UI with "Try again" button
- `neufin-web/middleware.ts` — `/api/auth/status` added to public paths; invalid token handling improved
- `neufin-web/instrumentation.ts` — Sentry v10 `captureRequestError` type compatibility with Next.js 15+ `onRequestError` hook
- `@sentry/nextjs` upgraded v8 → v10 for Next.js 16 compatibility
- `neufin-backend/.bandit` — removed `severity`/`confidence` keys incompatible with Python 3.13 bandit

### Removed
- All `DEMO_PORTFOLIOS`, `DEMO_REPORT`, `DEMO_SWARM`, `DEMO_ALERTS` constants from mobile screens
- Mock swarm outputs and sample portfolio fallbacks from backend

### Security
- Zero HIGH/MEDIUM severity bandit findings
- Zero npm production vulnerabilities
- JWT verification with JWKS fallback to static PEM
- Field-level AES-256 encryption for sensitive vault data

---

## [Unreleased]

### Added
- **Observability** — Sentry error tracking for backend (FastAPI), web (Next.js), and mobile (React Native / Expo)
- **Backend structured logging** — `structlog` replaces ad-hoc `print()` calls; emits newline-delimited JSON in production, colourised console in development; configurable via `LOG_LEVEL` / `LOG_FORMAT` env vars
- **Backend metrics** — Prometheus `/metrics` endpoint via `prometheus-fastapi-instrumentator`; tracks HTTP request counts, latency histograms, and in-flight requests
- **Web structured logging** — `pino` server-side logger + isomorphic `lib/logger.ts` utility; redacts auth tokens and PII fields automatically
- **Web security linting** — `eslint-plugin-security` added to dev dependencies; `.eslintrc.json` configured with `recommended-legacy` ruleset
- **Dependency scanning** — `.github/dependabot.yml` for automated weekly dependency updates across pip (backend), npm (web + mobile), and GitHub Actions
- **Ruff + mypy config** — `neufin-backend/pyproject.toml` consolidates linter, formatter, type-checker, pytest, and coverage settings
- **Bandit config** — `neufin-backend/.bandit` documents intentional skip rules (B101, B104, B311)
- `GET /api/portfolio/list` — JWT-authenticated endpoint returning `PortfolioSummary[]` with `positions_count` and latest `dna_score`
- `GET /api/swarm/report/latest` — JWT-authenticated endpoint returning most recent `SwarmReport` with full nested agent outputs; backwards-compatible reconstruction for legacy flat-field reports
- `GET /api/auth/status` — unauthenticated probe returning `{authenticated, user_id, expires_at}`

### Changed
- `neufin-backend/routers/swarm.py` — `_persist_swarm_result` now stores `market_regime`, `quant_analysis`, `tax_report`, `risk_sentinel`, `alpha_scout`, `strategist_intel` as JSONB columns alongside existing flat scalar fields
- `neufin-web/next.config.js` — `withSentryConfig` wrapper applied when `SENTRY_DSN` is set; added `Permissions-Policy` and `X-DNS-Prefetch-Control` security headers
- `neufin-web/instrumentation.ts` — `register()` now imports Sentry server/edge configs; `onRequestError` forwards unhandled errors to Sentry

### Fixed
- `neufin-web/app/auth/callback/page.tsx` — removed 10-second timeout race condition; replaced with proper `INITIAL_SESSION` / `onAuthStateChange` handler; added error state UI with "Try again" button
- `neufin-web/middleware.ts` — validates tokens via `/api/auth/status` backend probe; clears stale cookies on invalid token; protects `/dashboard`, `/vault`, `/swarm`
- Mobile screens — removed all hardcoded demo constants (`DEMO_PORTFOLIOS`, `DEMO_REPORT`, `DEMO_SWARM`, `DEMO_ALERTS`); replaced with real API calls and proper loading / empty / error states

---

## [1.1.0] — 2025-03-25

### Added
- AI agent swarm with `run_swarm()` LangGraph pipeline (synthesizer, risk sentinel, alpha scout, quant analysis, tax report, market regime agents)
- `GET /api/swarm/report/{report_id}` — retrieve persisted swarm analysis
- `POST /api/swarm/analyze` — trigger full swarm analysis for an uploaded portfolio
- DNA score leaderboard and shareable report links
- Stripe payment integration for premium report tiers
- Vault (encrypted portfolio storage) with AES-256-GCM field-level encryption
- Push notifications for swarm alert events (Expo Notifications)

### Changed
- Migrated JWKS-based JWT verification from python-jose to direct Supabase JWKS endpoint; 1-hour key cache with 60-second backoff on failure

---

## [1.0.0] — 2025-02-01

### Added
- Initial release of Neufin: AI Portfolio Intelligence Platform
- FastAPI backend deployed on Railway
- Next.js 15 web frontend deployed on Vercel
- React Native / Expo mobile app (iOS + Android)
- Supabase authentication (Google OAuth + email/password)
- Portfolio CSV upload and DNA score calculation
- Basic risk report generation

[Unreleased]: https://github.com/neufin/neufinapk1/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/neufin/neufinapk1/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/neufin/neufinapk1/releases/tag/v1.0.0
