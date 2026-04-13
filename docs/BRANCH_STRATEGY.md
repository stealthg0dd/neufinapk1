# Branch Strategy

## Overview

| Branch | Purpose |
|--------|---------|
| `main` | **Production** – protected, only accepts PRs from `develop` |
| `develop` | **Integration** – default branch, all feature work merges here |
| `feature/*` | Short-lived feature branches cut from `develop` |

---

## GitHub Settings (one-time setup by repo owner)

### 1. Protect the `main` branch

1. Go to **Settings → Branches → Branch protection rules → Add rule**.
2. Set **Branch name pattern** to `main`.
3. Enable:
   - ✅ **Require a pull request before merging** (prevents direct pushes)
   - ✅ **Require status checks to pass before merging** (requires CI to be green)
   - ✅ **Restrict pushes** (prevents force-pushes / direct pushes)
4. Click **Create**.

### 2. Set the default branch to `develop`

1. Go to **Settings → Branches → Default branch**.
2. Click the ↔ icon next to `main`.
3. Select `develop` and click **Update → Confirm**.

> After this change, all new PRs and `git push` without a target will default to `develop`.

---

## Local Safety Net

A pre-commit hook blocks accidental commits to `main` on your local machine.

**Install once after cloning:**

```bash
bash scripts/install-hooks.sh
```

This runs `git config core.hooksPath .githooks`, pointing Git at the shared
hooks in `.githooks/`. The hook rejects any `git commit` while `main` is
checked out.

---

## Day-to-day Workflow

```
[feature/my-feature]  →  [develop]  →  PR  →  [main]  →  Production deploy
```

1. **Work** on `develop` or a `feature/*` branch.
2. **Integrate** by pushing/PRing to `develop`.
3. **Promote** by opening a PR: base `main` ← compare `develop`.
4. **Deploy** by merging that PR (triggers production CI/CD).
