# Neufin workflow (short)

| Stage | Branch | What it is | Where to test |
|--------|--------|------------|----------------|
| **Local / PR** | `feature/*` (not `main`/`develop`) | Ephemeral Vercel previews; use **staging** API in preview env vars | PR preview URL from Vercel |
| **Staging** | `develop` | Stable pre-release; staging Railway + staging web | **https://staging.neufin.ai** (and staging Railway URL for API) |
| **Production** | `main` | Live users | **https://www.neufin.ai** |

**Helpers** (from repo root): `./scripts/use-staging.sh` (develop preview → `neufin-web/.env.local`) · `./scripts/use-production-readonly.sh` (prod env → temp file only, never `.env.local`).

**Full detail:** [docs/deployments.md](docs/deployments.md)
