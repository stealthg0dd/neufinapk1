# NeuFin

AI-powered financial intelligence platform.

## Development Workflow

NeuFin uses a **staging-first** CI/CD model. All changes are tested and deployed to staging before any code reaches production.

### Branch Strategy

```
feature/your-feature  →  develop  →  main (production)
```

### Step-by-Step

**1. Feature Development**
- Create a feature branch from `develop`:
  ```bash
  git checkout develop
  git checkout -b feature/my-feature
  ```
- Commit your changes and push to origin.

**2. Pull Request into `develop`**
- Open a PR targeting `develop`.
- CI runs automatically on every PR:
  - **Backend**: Ruff lint → Black format check → Pytest with coverage
  - **Web**: ESLint → Next.js build (TypeScript check included)
  - **Mobile**: TypeScript check → Unit tests
- All checks must pass before merging.

**3. Push to `develop` → Auto-Deploy to Staging**
- Merging a PR into `develop` triggers the full CI suite again.
- If CI passes, the staging deploy workflows run automatically:
  - **Backend** → Railway `staging` environment (`https://neufin101-staging.up.railway.app`)
  - **Web** → Vercel preview deploy (no `--prod` flag; a unique preview URL is generated)
- No manual action needed. Staging is always a live mirror of `develop`.

**4. Promote to Production (manual, approval-gated)**
- When `develop` is stable and ready for release:
  1. Go to **Actions** → **Promote to Production** → **Run workflow**
  2. Type `promote` in the confirmation input and click **Run workflow**
  3. The `production` GitHub Environment gate pauses the job — you will see a pending approval in the Actions UI
  4. Click **Review deployments** → **Approve and deploy** (one click)
  5. The workflow automatically:
     - Merges `develop → main` (no-ff merge commit)
     - Deploys backend to Railway **production** environment
     - Deploys web to Vercel **production** (`--prod`)
     - Verifies `https://www.neufin.ai` is live
     - Creates Sentry releases and sends Slack notifications

### CI Status Checks

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| Backend CI | Push to `develop`/`main`, any PR | Ruff, Black, Pytest |
| Web CI | Push to `develop`/`main`, any PR | ESLint, Next.js build |
| Mobile CI | Push to `develop`/`main`, any PR | TypeScript, Jest |
| Deploy Backend — Staging | Backend CI ✅ on `develop` | Railway staging deploy |
| Deploy Web — Staging | Web CI ✅ on `develop` | Vercel preview deploy |
| Promote to Production | Manual (`workflow_dispatch`) | Merge + production deploy |
| Security Scan | Push to `develop`/`main`, weekly | pip-audit, npm audit, Trivy |
