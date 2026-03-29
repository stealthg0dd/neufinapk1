#!/usr/bin/env bash
# deploy.sh — Manual deployment script for all layers
# Usage: ./scripts/deploy.sh [backend|frontend|mobile] [staging|production]
# CI/CD is preferred for production. Use this for emergency hotfixes only.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAYER="${1:-}"
ENV="${2:-staging}"

if [ -z "$LAYER" ]; then
  echo "Usage: $0 [backend|frontend|mobile] [staging|production]"
  echo ""
  echo "  backend   — Deploy to Railway"
  echo "  frontend  — Deploy to Vercel"
  echo "  mobile    — Build EAS APK/AAB"
  exit 1
fi

confirm_production() {
  if [ "$ENV" = "production" ]; then
    echo ""
    echo "  WARNING: You are about to deploy to PRODUCTION."
    echo "  Prefer pushing to main and letting CI/CD handle this."
    echo ""
    read -r -p "  Type 'yes' to continue: " CONFIRM
    if [ "$CONFIRM" != "yes" ]; then
      echo "  Aborted."
      exit 1
    fi
  fi
}

deploy_backend() {
  confirm_production
  echo "==> Deploying backend to Railway ($ENV)..."

  if ! command -v railway &>/dev/null; then
    echo "  ERROR: Railway CLI not found. Run: npm install -g @railway/cli"
    exit 1
  fi

  cd "$REPO_ROOT/neufin-backend"

  SERVICE="neufin101-${ENV}"
  echo "  Service: $SERVICE"
  railway up --service "$SERVICE"

  echo ""
  echo "  Verifying health check..."
  BASE_URL="https://neufin101-${ENV}.up.railway.app"
  sleep 5
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health" || echo "000")
  if [ "$STATUS" = "200" ]; then
    echo "  Health check: OK ($BASE_URL)"
  else
    echo "  Health check FAILED (HTTP $STATUS). Check Railway logs."
    exit 1
  fi

  echo "  Backend deploy: DONE"
}

deploy_frontend() {
  confirm_production
  echo "==> Deploying frontend to Vercel ($ENV)..."

  if ! command -v vercel &>/dev/null; then
    echo "  ERROR: Vercel CLI not found. Run: npm install -g vercel"
    exit 1
  fi

  cd "$REPO_ROOT/neufin-web"

  if [ "$ENV" = "production" ]; then
    vercel --prod
  else
    vercel
  fi

  echo "  Frontend deploy: DONE"
}

deploy_mobile() {
  echo "==> Building mobile ($ENV)..."

  if ! command -v eas &>/dev/null; then
    echo "  ERROR: EAS CLI not found. Run: npm install -g eas-cli"
    exit 1
  fi

  cd "$REPO_ROOT/neufin-mobile"

  if [ "$ENV" = "production" ]; then
    echo "  Building AAB for Play Store (production profile)..."
    eas build --profile production --platform android --non-interactive
    echo ""
    echo "  To submit to Play Store internal track:"
    echo "  eas submit --platform android --latest"
  else
    echo "  Building APK for testing (preview profile)..."
    eas build --profile preview --platform android --non-interactive
  fi

  echo "  Mobile build: DONE"
}

case "$LAYER" in
  backend)  deploy_backend ;;
  frontend) deploy_frontend ;;
  mobile)   deploy_mobile ;;
  *)
    echo "Unknown layer: $LAYER"
    exit 1
    ;;
esac
