#!/usr/bin/env bash
# run-tests.sh — Run test suites for one or all layers
# Usage: ./scripts/run-tests.sh [backend|frontend|mobile|all]
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAYER="${1:-all}"
FAILED=()

run_backend_tests() {
  local status=0

  echo "==> Backend tests (pytest)"
  cd "$REPO_ROOT/neufin-backend"

  if [ ! -d ".venv" ]; then
    echo "  ERROR: virtualenv not found. Run scripts/setup-dev.sh first."
    return 1
  fi

  source .venv/bin/activate

  echo "  Running linters..."
  ruff check . --quiet || status=1
  mypy . --ignore-missing-imports --quiet || status=1

  echo "  Running unit tests..."
  pytest tests/unit/ \
    --cov=. \
    --cov-report=term-missing \
    --cov-fail-under=60 \
    -q || status=1

  if [ "${CI:-}" = "true" ]; then
    echo "  Running integration tests (CI only)..."
    pytest tests/integration/ -q || status=1
  fi

  deactivate
  if [ "$status" -ne 0 ]; then
    return 1
  fi

  echo "  Backend: PASS"
}

run_frontend_tests() {
  local status=0

  echo "==> Frontend tests (jest + eslint)"
  cd "$REPO_ROOT/neufin-web"

  if node -e 'const pkg=require("./package.json"); process.exit(pkg.devDependencies?.eslint || pkg.dependencies?.eslint ? 0 : 1)'; then
    echo "  Running ESLint..."
    npx eslint . --ext .ts,.tsx --quiet || status=1
  else
    echo "  ESLint not configured; skipping."
  fi

  echo "  Running TypeScript check..."
  npx tsc --noEmit || status=1

  if node -e 'const pkg=require("./package.json"); process.exit(pkg.scripts?.test ? 0 : 1)'; then
    echo "  Running npm test..."
    npm test -- --passWithNoTests --coverage --silent || status=1
  else
    echo "  Test runner not configured; skipping."
  fi

  if [ "$status" -ne 0 ]; then
    return 1
  fi

  echo "  Frontend: PASS"
}

run_mobile_tests() {
  local status=0

  echo "==> Mobile tests (jest + eslint)"
  cd "$REPO_ROOT/neufin-mobile"

  if node -e 'const pkg=require("./package.json"); process.exit(pkg.devDependencies?.eslint || pkg.dependencies?.eslint ? 0 : 1)'; then
    echo "  Running ESLint..."
    npx eslint . --ext .ts,.tsx --quiet || status=1
  else
    echo "  ESLint not configured; skipping."
  fi

  echo "  Running TypeScript check..."
  npx tsc --noEmit || status=1

  if node -e 'const pkg=require("./package.json"); process.exit(pkg.scripts?.test ? 0 : 1)'; then
    echo "  Running npm test..."
    npm test -- --passWithNoTests --coverage --silent || status=1
  else
    echo "  Test runner not configured; skipping."
  fi

  if [ "$status" -ne 0 ]; then
    return 1
  fi

  echo "  Mobile: PASS"
}

echo "Running tests: $LAYER"
echo ""

case "$LAYER" in
  backend)
    run_backend_tests || FAILED+=("backend")
    ;;
  frontend)
    run_frontend_tests || FAILED+=("frontend")
    ;;
  mobile)
    run_mobile_tests || FAILED+=("mobile")
    ;;
  all)
    run_backend_tests  || FAILED+=("backend")
    run_frontend_tests || FAILED+=("frontend")
    run_mobile_tests   || FAILED+=("mobile")
    ;;
  *)
    echo "Usage: $0 [backend|frontend|mobile|all]"
    exit 1
    ;;
esac

echo ""
if [ ${#FAILED[@]} -eq 0 ]; then
  echo "==> All tests passed."
else
  echo "==> FAILED: ${FAILED[*]}"
  exit 1
fi
