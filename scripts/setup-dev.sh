#!/usr/bin/env bash
# setup-dev.sh — Bootstrap local development environment for all three layers
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> Neufin Dev Setup"
echo "    Repo: $REPO_ROOT"
echo ""

# ── Helpers ─────────────────────────────────────────────────────────────────
check_command() {
  if ! command -v "$1" &>/dev/null; then
    echo "ERROR: '$1' not found. Install it first (see docs/ONBOARDING.md)."
    exit 1
  fi
}

copy_env() {
  local src="$1" dst="$2"
  if [ -f "$dst" ]; then
    echo "  [skip] $dst already exists"
  else
    cp "$src" "$dst"
    echo "  [created] $dst — fill in your values"
  fi
}

# ── Preflight ────────────────────────────────────────────────────────────────
echo "==> Checking prerequisites..."
check_command python3
check_command node
check_command npm
check_command docker
echo "    All prerequisites found."
echo ""

# ── Backend ──────────────────────────────────────────────────────────────────
echo "==> Backend (neufin-backend)..."

cd "$REPO_ROOT/neufin-backend"

copy_env ".env.example" ".env"

if [ ! -d ".venv" ]; then
  echo "  Creating virtualenv..."
  python3 -m venv .venv
fi

echo "  Installing Python dependencies..."
source .venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt
deactivate

echo "  Backend ready. Run: cd neufin-backend && source .venv/bin/activate && uvicorn main:app --reload"
echo ""

# ── Frontend ─────────────────────────────────────────────────────────────────
echo "==> Frontend (neufin-web)..."

cd "$REPO_ROOT/neufin-web"

if [ -f ".env.local.example" ]; then
  copy_env ".env.local.example" ".env.local"
elif [ -f ".env.example" ]; then
  copy_env ".env.example" ".env.local"
fi

echo "  Installing Node dependencies..."
npm install --silent

echo "  Frontend ready. Run: cd neufin-web && npm run dev"
echo ""

# ── Mobile ───────────────────────────────────────────────────────────────────
echo "==> Mobile (neufin-mobile)..."

cd "$REPO_ROOT/neufin-mobile"

echo "  Installing Node dependencies..."
npm install --silent

echo "  Mobile ready. Run: cd neufin-mobile && npx expo start"
echo ""

# ── Summary ──────────────────────────────────────────────────────────────────
echo "==> Setup complete!"
echo ""
echo "  Next steps:"
echo "  1. Fill in .env files with your API keys (see docs/ONBOARDING.md)"
echo "  2. Apply DB migrations to your Supabase project (supabase_migrations_v1.sql)"
echo "  3. Start each layer:"
echo "     Backend:  cd neufin-backend && source .venv/bin/activate && uvicorn main:app --reload"
echo "     Frontend: cd neufin-web && npm run dev"
echo "     Mobile:   cd neufin-mobile && npx expo start"
echo ""
echo "  Or run all via Docker: docker-compose -f infrastructure/docker/docker-compose.local.yml up"
