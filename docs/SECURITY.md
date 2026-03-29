# Neufin — Security Policy

## Reporting a Vulnerability

**Do not file public GitHub issues for security vulnerabilities.**

Email: security@neufin.app

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (optional)

Response time: acknowledgment within 48 hours, triage within 7 days.

---

## Authentication & Authorization

### JWT Verification

- All authenticated endpoints verify Supabase JWTs via JWKS endpoint
- Fallback: HS256 with `SUPABASE_JWT_SECRET` for edge cases
- Clock skew tolerance: 60 seconds
- Token expiry: 1 hour (enforced by Supabase)

### Middleware Architecture

```
Every request:
  auth_middleware → soft-attach JWT to request.state.user (never rejects)

Protected endpoints:
  Depends(get_current_user) → hard 401 if no valid user on request.state
```

**Intentional design:** Public endpoints (DNA score, market health, swarm global-chat) bypass the hard reject. Do not add `Depends(get_current_user)` to these without review.

### Subscription Tier Gating

Report generation and advisor features require `subscription_tier = "unlimited"`. This check is enforced at the endpoint level in `routers/reports.py` and `routers/advisors.py`, not just frontend UI.

---

## Data Protection

### Encryption at Rest

- `cost_basis` field in `portfolio_positions` is encrypted with Fernet (AES-128-CBC + HMAC-SHA256) before storage
- `FERNET_KEY` must be a 32-byte base64-encoded key, stored only in Railway environment variables
- Never commit `FERNET_KEY` to version control

### Supabase Row Level Security (RLS)

RLS is enabled on all user-data tables:
- `portfolios` — users can only SELECT/INSERT/UPDATE/DELETE their own rows
- `portfolio_positions` — scoped to portfolios the user owns
- `dna_scores` — user-scoped + anonymous records (session_id based)
- `swarm_reports` — user-scoped
- `advisor_reports` — scoped to portfolio owner and advisor

**Any new table containing user data must have RLS enabled and policies defined before merging.**

### PII Handling

- No SSN, bank account numbers, or tax IDs are collected
- Email collected only for digest subscription (referrals)
- Portfolio holdings (symbols + shares) are stored but not sold/shared
- `advisor_name` and `firm_name` are voluntarily provided by advisors
- Logo images stored as base64 in Supabase (not a third-party CDN)

---

## Secret Management

### Rules

1. **Never commit secrets to git.** `.env` files are in `.gitignore`.
2. **Never log secrets.** API keys, JWT tokens, and Fernet keys must not appear in logs.
3. **Rotate on suspected compromise.** If a key is accidentally committed, rotate it immediately even after rewriting git history.
4. **Separate test and production keys.** Stripe test keys (`sk_test_`) must never hit production Stripe endpoints.

### Secret Locations

| Secret | Storage |
|--------|---------|
| Backend env vars | Railway → Variables |
| Frontend env vars | Vercel → Environment Variables |
| Mobile secrets | EAS Secrets |
| CI/CD secrets | GitHub → Repository Secrets |
| Local dev | `.env` files (gitignored) |

---

## Input Validation

### CSV Upload

- File size limit enforced at the API gateway / reverse proxy layer
- CSV parsed with `pandas`; `eval=False` to prevent formula injection
- Symbol validation: alphanumeric + dots only (rejects `=CMD(...)` Excel injection)
- Shares and cost_basis cast to float; invalid rows rejected with 400

### AI Prompt Injection

User-controlled data (portfolio symbols, chat messages) is passed to AI providers. Current mitigations:
- Symbols are validated against alphanumeric allowlist before embedding in prompts
- Chat messages are passed as user-turn content, not system instructions
- AI responses are parsed as JSON only; unexpected formats are rejected

**Gap:** No explicit prompt injection firewall. Free-text chat (`/api/swarm/chat`, `/api/swarm/global-chat`) accepts arbitrary user input. Monitor for abuse.

### SQL Injection

All database access goes through the Supabase Python client, which uses parameterized queries. Raw SQL strings with user input are not used anywhere in the codebase.

---

## API Security

### CORS

Allowed origins are configured in `main.py`. Current policy:
- `https://neufin.app` — explicit production origin
- `http://localhost:3000` — local development
- Regex pattern for Vercel preview deployments — **scope is intentionally narrow**

**Do not widen CORS without review.** The `allow_credentials=True` flag makes CORS scope security-critical.

### Rate Limiting

**Current gap:** No rate limiting is implemented. Planned: SlowAPI with per-IP limits on compute-intensive endpoints:
- `POST /api/analyze-dna` — 10 req/min
- `POST /api/swarm/analyze` — 5 req/min
- `POST /api/swarm/chat` — 20 req/min

Until implemented, Railway's reverse proxy provides basic DDoS protection.

### HTTPS

All production traffic is HTTPS-only. Railway terminates TLS. HSTS headers are set.

---

## Third-Party Dependencies

### Dependency Auditing

```bash
# Backend
pip-audit -r neufin-backend/requirements.txt

# Frontend
npm audit --prefix neufin-web

# Mobile
npm audit --prefix neufin-mobile
```

CI runs `bandit` (Python) and `npm audit` on every PR. PRs with HIGH severity findings are blocked.

### AI Provider Data Handling

- **Anthropic (Claude):** Data not used for training by default (API tier).
- **Google (Gemini):** Review Google's API data policies before sending sensitive portfolio data.
- **Groq / OpenAI:** Fallback providers; same caveat.

Portfolio data (symbols + shares) is sent to AI providers as part of analysis prompts. This is acceptable per our Terms of Service; do not send SSNs, account numbers, or other financial identifiers.

---

## Security Checklist for PRs

Every PR touching auth, data storage, or API endpoints must satisfy:

- [ ] No secrets or credentials in code or logs
- [ ] New endpoints have appropriate auth (`Depends(get_current_user)` or explicitly public)
- [ ] User input validated before passing to AI prompts or DB queries
- [ ] New tables have RLS enabled with documented policies
- [ ] CORS not widened without security review
- [ ] Subscription tier checks on paid features
- [ ] `pip-audit` / `npm audit` passes

This checklist is also in `.github/PULL_REQUEST_TEMPLATE.md`.

---

## Incident Response

### Suspected Key Compromise

1. Rotate the key immediately in Railway/Vercel/EAS
2. Revoke old key at the provider (Stripe, Anthropic, Supabase, etc.)
3. Review Railway logs for unauthorized usage in the past 30 days
4. Notify users if any user data was accessed
5. Document incident in a private security incident log

### Stripe Webhook Replay Attack

Stripe signatures include a timestamp; `stripe.WebhookSignature.verify_header()` rejects events older than 5 minutes. No additional replay protection is needed.

### Supabase JWT Leak

1. Supabase dashboard → Authentication → Disable the affected user session
2. Rotate `SUPABASE_JWT_SECRET` in Railway (causes all existing sessions to invalidate)
3. Monitor for unexpected database queries
