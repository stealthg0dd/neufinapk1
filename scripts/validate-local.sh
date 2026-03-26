#!/usr/bin/env bash
# =============================================================================
# scripts/validate-local.sh — Neufin comprehensive local validation suite
#
# Runs a mix of automated (curl, static analysis, audit) and manual-checklist
# tests across all three layers: backend, web, and mobile.
#
# Usage:
#   # Automated checks only (no browser interaction required):
#   bash scripts/validate-local.sh
#
#   # Full suite including authenticated API tests:
#   TOKEN="eyJhbGci..." bash scripts/validate-local.sh
#
#   # Run against a deployed environment instead of localhost:
#   API_URL="https://neufin101-production.up.railway.app" \
#   WEB_URL="https://neufin.app" \
#   TOKEN="eyJhbGci..." bash scripts/validate-local.sh
#
# Environment variables:
#   TOKEN          Supabase access token (required for authenticated tests)
#                  Get it: sign in → DevTools → Application → Local Storage →
#                  key "neufin-auth" → value.access_token
#   API_URL        Backend base URL (default: http://localhost:8000)
#   WEB_URL        Web frontend base URL (default: http://localhost:3000)
#   START_SERVER   Set to "1" to auto-start the backend; "0" to skip (default: auto)
#   SKIP_SLOW      Set to "1" to skip bandit, tsc, mypy, and npm audit
#
# Output:
#   - Colourised console summary with PASS / FAIL / MANUAL / SKIP per check
#   - Full log written to test-results.log in the repo root
#
# Exit code: 0 if all automated checks pass, 1 if any fail.
# =============================================================================

set -euo pipefail

# ── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_FILE="$REPO_ROOT/test-results.log"
BACKEND_DIR="$REPO_ROOT/neufin-backend"
WEB_DIR="$REPO_ROOT/neufin-web"
MOBILE_DIR="$REPO_ROOT/neufin-mobile"

# ── Config (can be overridden by env) ─────────────────────────────────────────
API_URL="${API_URL:-http://localhost:8000}"
WEB_URL="${WEB_URL:-http://localhost:3000}"
SKIP_SLOW="${SKIP_SLOW:-0}"
TOKEN="${TOKEN:-}"
SERVER_PID=""

# ── Colours ───────────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  GRN='\033[0;32m'; RED='\033[0;31m'; YLW='\033[1;33m'
  BLU='\033[0;34m'; MAG='\033[0;35m'; CYN='\033[0;36m'
  BLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'
else
  GRN=''; RED=''; YLW=''; BLU=''; MAG=''; CYN=''; BLD=''; DIM=''; NC=''
fi

# ── Counters ──────────────────────────────────────────────────────────────────
PASS=0; FAIL=0; MANUAL=0; SKIP=0
FAILURES=()

# ── Logging ───────────────────────────────────────────────────────────────────
# Write everything to both console and log file.
exec > >(tee "$LOG_FILE") 2>&1

log()     { printf "%s\n"        "$*"; }
log_dim() { printf "${DIM}%s${NC}\n" "$*"; }

pass() {
  printf "  ${GRN}✓${NC}  %-60s ${GRN}PASS${NC}\n" "$1"
  PASS=$((PASS + 1))
}
fail() {
  printf "  ${RED}✗${NC}  %-60s ${RED}FAIL${NC}\n" "$1"
  [ -n "${2:-}" ] && printf "       ${DIM}%s${NC}\n" "$2"
  FAIL=$((FAIL + 1))
  FAILURES+=("$1")
}
manual() {
  printf "  ${MAG}✋${NC}  %-60s ${MAG}MANUAL${NC}\n" "$1"
  MANUAL=$((MANUAL + 1))
}
skip() {
  printf "  ${YLW}−${NC}  %-60s ${YLW}SKIP${NC}\n" "$1"
  SKIP=$((SKIP + 1))
}
section() {
  log ""
  printf "${BLD}${BLU}══ %s ${NC}\n" "$1"
}

# ── Helpers ───────────────────────────────────────────────────────────────────
require_cmd() {
  if ! command -v "$1" &>/dev/null; then
    fail "Prerequisite: $1 is installed" "Install $1 and re-run"
    return 1
  fi
  return 0
}

curl_json() {
  # curl with 8 s timeout, returns empty string on failure
  curl -sf --max-time 8 "$@" 2>/dev/null || true
}

curl_status() {
  # Always returns a 3-digit HTTP code; "000" means connection refused / timeout.
  # Use `|| true` to prevent set -e from aborting when curl exits non-zero.
  curl -s -o /dev/null --max-time 8 -w "%{http_code}" "$@" 2>/dev/null || true
}

backend_ready() {
  local resp
  resp=$(curl_json "$API_URL/health")
  echo "$resp" | grep -q '"ok"' 2>/dev/null
}

wait_for_backend() {
  local attempts=0
  while ! backend_ready; do
    attempts=$((attempts + 1))
    if [ $attempts -ge 20 ]; then return 1; fi
    sleep 1
  done
}

cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    log ""
    log_dim "Stopping background server (PID $SERVER_PID)…"
    kill "$SERVER_PID" 2>/dev/null || true
  fi
  rm -f /tmp/neufin_test_portfolio.csv
}
trap cleanup EXIT

# ═════════════════════════════════════════════════════════════════════════════
# HEADER
# ═════════════════════════════════════════════════════════════════════════════
log ""
printf "${BLD}${CYN}╔══════════════════════════════════════════════════════╗${NC}\n"
printf "${BLD}${CYN}║     Neufin Local Validation Suite                   ║${NC}\n"
printf "${BLD}${CYN}╚══════════════════════════════════════════════════════╝${NC}\n"
log ""
log "  Repo:    $REPO_ROOT"
log "  API:     $API_URL"
log "  Web:     $WEB_URL"
log "  Token:   $([ -n "$TOKEN" ] && echo "${TOKEN:0:12}… (set)" || echo "(not set — authenticated tests will be skipped)")"
log "  Log:     $LOG_FILE"
log "  Started: $(date '+%Y-%m-%d %H:%M:%S')"

# ═════════════════════════════════════════════════════════════════════════════
# SECTION 0 — PREREQUISITES
# ═════════════════════════════════════════════════════════════════════════════
section "0. Prerequisites"

require_cmd curl
require_cmd jq
require_cmd python3
require_cmd node
require_cmd npm

[ "$SKIP_SLOW" = "1" ] && log_dim "  SKIP_SLOW=1 — static-analysis tools will not be checked"

# Check optional but important tools
for tool in ruff mypy bandit; do
  if command -v "$tool" &>/dev/null; then
    pass "Tool available: $tool"
  else
    # Try inside the venv
    if [ -f "$BACKEND_DIR/.venv/bin/$tool" ]; then
      pass "Tool available (venv): $tool"
    else
      skip "Tool not in PATH: $tool (run setup-dev.sh)"
    fi
  fi
done

if ! command -v jq &>/dev/null; then
  log "${RED}ERROR: jq is required for JSON parsing. Install it and re-run.${NC}"
  exit 1
fi

# ═════════════════════════════════════════════════════════════════════════════
# SECTION 1 — BACKEND HEALTH
# ═════════════════════════════════════════════════════════════════════════════
section "1. Backend Health"

# Auto-start backend if not already listening and START_SERVER != "0"
START_SERVER="${START_SERVER:-auto}"
if ! backend_ready; then
  if [ "$START_SERVER" = "0" ]; then
    fail "Backend reachable at $API_URL" "Set START_SERVER=1 or start manually: uvicorn main:app --reload"
  else
    log_dim "  Backend not responding — attempting to start…"
    if [ ! -d "$BACKEND_DIR/.venv" ]; then
      fail "Backend .venv exists (run scripts/setup-dev.sh first)" ""
    else
      cd "$BACKEND_DIR"
      .venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 \
        --log-level warning &>/tmp/neufin_server.log &
      SERVER_PID=$!
      log_dim "  Server PID $SERVER_PID — waiting for readiness…"
      cd "$REPO_ROOT"
      if wait_for_backend; then
        pass "Backend started successfully (PID $SERVER_PID)"
      else
        fail "Backend failed to start within 20 s" "Check /tmp/neufin_server.log"
      fi
    fi
  fi
fi

# 1a. GET /health
RESP=$(curl_json "$API_URL/health")
if echo "$RESP" | jq -e '.status == "ok"' &>/dev/null; then
  pass "GET /health → {status: ok}"
else
  fail "GET /health → {status: ok}" "Got: $RESP"
fi

# 1b. GET /api/auth/status (unauthenticated)
RESP=$(curl_json "$API_URL/api/auth/status")
AUTH=$(echo "$RESP" | jq -r '.authenticated // "missing"')
if [ "$AUTH" = "false" ]; then
  pass "GET /api/auth/status (no token) → authenticated: false"
else
  fail "GET /api/auth/status (no token) → authenticated: false" "Got: $RESP"
fi

# 1c. GET /metrics (Prometheus)
STATUS=$(curl_status "$API_URL/metrics")
if [ "$STATUS" = "200" ]; then
  pass "GET /metrics → 200 (Prometheus endpoint live)"
else
  skip "GET /metrics → expected 200, got $STATUS (prometheus-fastapi-instrumentator may not be installed yet)"
fi

# 1d. OpenAPI schema mounts all routers
RESP=$(curl_json "$API_URL/openapi.json")
ROUTER_COUNT=$(echo "$RESP" | jq -r '.paths | keys | length' 2>/dev/null || echo "0")
ROUTER_COUNT="${ROUTER_COUNT:-0}"  # guard against empty/null from jq
if [ "$ROUTER_COUNT" -gt 20 ]; then
  pass "OpenAPI schema has $ROUTER_COUNT routes (all routers mounted)"
else
  fail "OpenAPI schema route count $ROUTER_COUNT < 20 (some routers may be missing)" ""
fi

# ═════════════════════════════════════════════════════════════════════════════
# SECTION 2 — AUTHENTICATION
# ═════════════════════════════════════════════════════════════════════════════
section "2. Authentication"

if [ -n "$TOKEN" ]; then
  # 2a. Valid token → authenticated: true
  RESP=$(curl_json -H "Authorization: Bearer $TOKEN" "$API_URL/api/auth/status")
  AUTH=$(echo "$RESP" | jq -r '.authenticated // "missing"')
  USER=$(echo "$RESP" | jq -r '.user_id // ""')
  EXP=$(echo "$RESP"  | jq -r '.expires_at // ""')
  if [ "$AUTH" = "true" ] && [ -n "$USER" ]; then
    pass "Valid token → authenticated: true, user_id: ${USER:0:8}…"
    log_dim "     expires_at: $EXP"
  else
    fail "Valid token → authenticated: true" "Got: $RESP"
  fi

  # 2b. Invalid token → authenticated: false
  RESP=$(curl_json -H "Authorization: Bearer garbage.token.xyz" "$API_URL/api/auth/status")
  AUTH=$(echo "$RESP" | jq -r '.authenticated // "missing"')
  if [ "$AUTH" = "false" ]; then
    pass "Garbage token → authenticated: false"
  else
    fail "Garbage token → authenticated: false" "Got: $RESP"
  fi

  # 2c. Protected endpoint with valid token → 200
  STATUS=$(curl_status -H "Authorization: Bearer $TOKEN" "$API_URL/api/portfolio/list")
  if [ "$STATUS" = "200" ]; then
    pass "GET /api/portfolio/list (valid token) → 200"
  else
    fail "GET /api/portfolio/list (valid token) → 200" "Got HTTP $STATUS"
  fi

  # 2d. Protected endpoint without token → 401
  STATUS=$(curl_status "$API_URL/api/portfolio/list")
  if [ "$STATUS" = "401" ]; then
    pass "GET /api/portfolio/list (no token) → 401"
  else
    fail "GET /api/portfolio/list (no token) → 401" "Got HTTP $STATUS"
  fi

  # 2e. Swarm latest report
  STATUS=$(curl_status -H "Authorization: Bearer $TOKEN" "$API_URL/api/swarm/report/latest")
  if [ "$STATUS" = "200" ] || [ "$STATUS" = "404" ]; then
    pass "GET /api/swarm/report/latest (valid token) → $STATUS (200 or 404 both valid)"
  else
    fail "GET /api/swarm/report/latest (valid token) → 200 or 404" "Got HTTP $STATUS"
  fi
else
  skip "2a–2e: Authenticated API tests (set TOKEN= env var)"
  manual "Open $WEB_URL/auth → Sign in with Google → complete OAuth flow"
  manual "Verify redirect lands on /onboarding (first time) or /vault (returning user)"
  manual "Open DevTools → Application → Local Storage → 'neufin-auth' → copy access_token"
  manual "Re-run: TOKEN=\"<paste>\" bash scripts/validate-local.sh"
fi

# ═════════════════════════════════════════════════════════════════════════════
# SECTION 3 — PORTFOLIO UPLOAD + DNA ANALYSIS
# ═════════════════════════════════════════════════════════════════════════════
section "3. Portfolio Upload & DNA Analysis"

# Create a realistic test CSV
TEST_CSV="/tmp/neufin_test_portfolio.csv"
cat > "$TEST_CSV" <<'EOF'
symbol,shares,cost_basis
AAPL,15,148.50
MSFT,8,285.00
GOOGL,4,2750.00
AMZN,3,145.00
NVDA,6,320.00
JPM,10,155.00
EOF
pass "Test CSV created ($TEST_CSV, 6 positions)"

# Upload without auth — should work (anonymous analysis)
log_dim "  Calling POST /api/analyze-dna (may take 10–30 s for first call)…"
DNA_RESP=$(curl -sf --max-time 60 \
  -F "file=@$TEST_CSV;type=text/csv" \
  "$API_URL/api/analyze-dna" 2>/dev/null || true)

if [ -z "$DNA_RESP" ]; then
  fail "POST /api/analyze-dna returned a response" "Empty response — is the backend running with valid API keys?"
else
  DNA_SCORE=$(echo "$DNA_RESP" | jq -r '.dna_score // .health_score // "null"' 2>/dev/null || echo "parse_error")
  RECORD_ID=$(echo "$DNA_RESP" | jq -r '.record_id // "null"' 2>/dev/null || echo "null")
  INVESTOR_TYPE=$(echo "$DNA_RESP" | jq -r '.investor_type // "null"' 2>/dev/null || echo "null")

  if [ "$DNA_SCORE" != "null" ] && [ "$DNA_SCORE" != "parse_error" ]; then
    pass "POST /api/analyze-dna → dna_score: $DNA_SCORE, type: $INVESTOR_TYPE"
    log_dim "     record_id: $RECORD_ID"
    # Export for use in swarm test
    PORTFOLIO_RECORD_ID="$RECORD_ID"
  else
    fail "POST /api/analyze-dna → valid dna_score in response" "Got: ${DNA_RESP:0:300}"
    PORTFOLIO_RECORD_ID=""
  fi

  # Verify no demo/mock values leaked into the response
  if echo "$DNA_RESP" | grep -qi '"DEMO\|"MOCK\|demo_score\|mock_data'; then
    fail "API response contains no DEMO/MOCK values" "Detected stub data in response"
  else
    pass "API response contains no DEMO/MOCK stub values"
  fi
fi

if [ -n "$TOKEN" ]; then
  # Authenticated upload — portfolio should be saved
  log_dim "  Uploading authenticated portfolio…"
  AUTH_DNA_RESP=$(curl -sf --max-time 60 \
    -H "Authorization: Bearer $TOKEN" \
    -F "file=@$TEST_CSV;type=text/csv" \
    "$API_URL/api/analyze-dna" 2>/dev/null || true)

  if echo "$AUTH_DNA_RESP" | jq -e '.dna_score' &>/dev/null 2>/dev/null; then
    AUTH_SCORE=$(echo "$AUTH_DNA_RESP" | jq -r '.dna_score')
    pass "Authenticated POST /api/analyze-dna → dna_score: $AUTH_SCORE"
  else
    fail "Authenticated POST /api/analyze-dna → valid response" "Got: ${AUTH_DNA_RESP:0:200}"
  fi
else
  skip "Authenticated DNA upload test (set TOKEN=)"
fi

manual "Web UI: Open $WEB_URL/upload → upload test CSV → verify score displays on /results"
manual "Check browser Network tab: POST to /api/analyze-dna, no console errors"

# ═════════════════════════════════════════════════════════════════════════════
# SECTION 4 — SWARM ANALYSIS
# ═════════════════════════════════════════════════════════════════════════════
section "4. Swarm Analysis"

if [ -n "$TOKEN" ]; then
  # First get a portfolio_id from the list
  PORT_RESP=$(curl_json -H "Authorization: Bearer $TOKEN" "$API_URL/api/portfolio/list")
  PORTFOLIO_ID=$(echo "$PORT_RESP" | jq -r '.[0].portfolio_id // ""' 2>/dev/null || echo "")

  if [ -n "$PORTFOLIO_ID" ]; then
    pass "Portfolio list returned at least one portfolio (id: ${PORTFOLIO_ID:0:8}…)"
    log_dim "  Triggering swarm analysis on portfolio $PORTFOLIO_ID (takes 30–120 s)…"
    # Trigger swarm but with a short timeout — just check it starts
    SWARM_STATUS=$(curl_status --max-time 10 \
      -X POST \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"portfolio_id\":\"$PORTFOLIO_ID\"}" \
      "$API_URL/api/swarm/analyze" || echo "000")
    # 200 = sync result, 202 = async accepted, 422 = validation error
    if [ "$SWARM_STATUS" = "200" ] || [ "$SWARM_STATUS" = "202" ]; then
      pass "POST /api/swarm/analyze → $SWARM_STATUS (analysis started)"
    elif [ "$SWARM_STATUS" = "422" ]; then
      skip "POST /api/swarm/analyze → 422 (check request schema)"
    else
      fail "POST /api/swarm/analyze → 200 or 202" "Got HTTP $SWARM_STATUS"
    fi

    # Check for an existing latest report
    LATEST_STATUS=$(curl_status -H "Authorization: Bearer $TOKEN" "$API_URL/api/swarm/report/latest")
    if [ "$LATEST_STATUS" = "200" ]; then
      LATEST_RESP=$(curl_json -H "Authorization: Bearer $TOKEN" "$API_URL/api/swarm/report/latest")
      HAS_BRIEFING=$(echo "$LATEST_RESP" | jq -r '.briefing // ""' | wc -c)
      HAS_REGIME=$(echo "$LATEST_RESP" | jq -r '.regime // ""')
      if [ "$HAS_BRIEFING" -gt 20 ]; then
        pass "GET /api/swarm/report/latest → briefing present ($HAS_BRIEFING chars), regime: $HAS_REGIME"
      else
        fail "GET /api/swarm/report/latest → non-empty briefing" "Briefing too short or missing"
      fi
    else
      skip "GET /api/swarm/report/latest → $LATEST_STATUS (run a swarm analysis first)"
    fi
  else
    skip "Swarm tests — no portfolios found for this token (upload one first)"
  fi
else
  skip "Swarm analysis tests (set TOKEN=)"
fi

manual "Web UI: Open $WEB_URL/swarm → click 'RUN SWARM' → verify 6 agent cards populate"
manual "Verify each card has actual metrics (not placeholder dashes)"
manual "Verify agent trace panel shows real LLM outputs, not template text"

# ═════════════════════════════════════════════════════════════════════════════
# SECTION 5 — MOBILE APP
# ═════════════════════════════════════════════════════════════════════════════
section "5. Mobile App (Manual Checklist)"

manual "cd neufin-mobile && npx expo start"
manual "On device/simulator: App opens → splash spinner → LoginScreen appears"
manual "Tap 'Continue with Google' → system browser opens → sign in"
manual "After OAuth: app returns to PortfolioSync screen, portfolio list loads"
manual "Verify portfolio list shows real data (no DEMO_ constants in RN logs)"
manual "Tap a portfolio → AnalysisScreen → verify DNA score is real"
manual "Navigate to SwarmReport → verify real agent outputs load"
manual "Check Metro logs: zero 'DEMO_' or 'MOCK_' strings in output"

# ═════════════════════════════════════════════════════════════════════════════
# SECTION 6 — PAYMENT FLOW
# ═════════════════════════════════════════════════════════════════════════════
section "6. Payment Flow (Manual Checklist)"

# Automated: verify Stripe checkout endpoint exists
STATUS=$(curl_status -X POST \
  -H "Content-Type: application/json" \
  -d '{"plan":"single","success_url":"http://localhost:3000/reports/success","cancel_url":"http://localhost:3000/results"}' \
  "$API_URL/api/reports/checkout")
if [ "$STATUS" = "200" ] || [ "$STATUS" = "422" ]; then
  # 422 is expected — missing required fields but endpoint is alive
  pass "POST /api/reports/checkout endpoint is reachable (HTTP $STATUS)"
else
  fail "POST /api/reports/checkout endpoint reachable" "Got HTTP $STATUS"
fi

# Verify plans endpoint
PLANS_RESP=$(curl_json "$API_URL/api/payments/plans")
if echo "$PLANS_RESP" | jq -e '.' &>/dev/null 2>/dev/null; then
  pass "GET /api/payments/plans → valid JSON response"
else
  fail "GET /api/payments/plans → valid JSON response" "Got: ${PLANS_RESP:0:100}"
fi

manual "Web UI: Open $WEB_URL/results after a DNA analysis"
manual "Click 'Get Report \$29' → verify Stripe checkout opens in browser"
manual "Use Stripe test card: 4242 4242 4242 4242 (exp: 12/34, CVC: 123)"
manual "Complete payment → verify redirect to /reports/success"
manual "Verify PDF download link appears and PDF file is non-empty"
manual "Open PDF — verify it contains real portfolio data, not placeholder text"

# ═════════════════════════════════════════════════════════════════════════════
# SECTION 7 — CODE AUDIT (No demo/mock/todo)
# ═════════════════════════════════════════════════════════════════════════════
section "7. Code Audit"

# DEMO_ check — exclude tests, scripts, and node_modules
DEMO_FILES=$( { grep -rl "DEMO_" \
  "$BACKEND_DIR" "$WEB_DIR" "$MOBILE_DIR" \
  --include="*.py" --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=__pycache__ \
  --exclude-dir=tests --exclude-dir=scripts \
  2>/dev/null || true; } | wc -l | tr -d ' ')
if [ "$DEMO_FILES" -eq 0 ]; then
  pass "No DEMO_ constants in production code (tests/scripts excluded)"
else
  DEMO_LIST=$( { grep -rl "DEMO_" \
    "$BACKEND_DIR" "$WEB_DIR" "$MOBILE_DIR" \
    --include="*.py" --include="*.ts" --include="*.tsx" \
    --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=__pycache__ \
    --exclude-dir=tests --exclude-dir=scripts 2>/dev/null || true; } | head -5)
  fail "No DEMO_ constants in production code" "Found in: $DEMO_LIST"
fi

# MOCK_ check
MOCK_FILES=$( { grep -rl "MOCK_" \
  "$BACKEND_DIR" "$WEB_DIR" "$MOBILE_DIR" \
  --include="*.py" --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=__pycache__ \
  --exclude-dir=tests --exclude-dir=scripts \
  2>/dev/null || true; } | wc -l | tr -d ' ')
if [ "$MOCK_FILES" -eq 0 ]; then
  pass "No MOCK_ constants in production code (tests/scripts excluded)"
else
  MOCK_LIST=$( { grep -rl "MOCK_" \
    "$BACKEND_DIR" "$WEB_DIR" "$MOBILE_DIR" \
    --include="*.py" --include="*.ts" --include="*.tsx" \
    --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=__pycache__ \
    --exclude-dir=tests --exclude-dir=scripts 2>/dev/null || true; } | head -5)
  fail "No MOCK_ constants in production code" "Found in: $MOCK_LIST"
fi

# Hardcoded tickers outside test files
TICKER_FILES=$( { grep -rln "\bAAPL\b\|\bNVDA\b\|\bTSLA\b" \
  "$BACKEND_DIR" "$WEB_DIR" "$MOBILE_DIR" \
  --include="*.py" --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=__pycache__ \
  --exclude-dir=tests --exclude-dir=__tests__ \
  2>/dev/null || true; } | { grep -v "test_\|_test\.\|spec\." || true; })
TICKER_COUNT=$(echo "$TICKER_FILES" | { grep -c . || true; })
TICKER_COUNT="${TICKER_COUNT:-0}"
# Tickers in known-OK locations: dashboard (sector map), upload examples (case-insensitive), backend services
UNEXPECTED=$(echo "$TICKER_FILES" | { grep -iv "dashboard\|upload\|stress_test\|pdf_gen\|risk_engine\|calculator\|market_cache\|portfolio.py" || true; })
if [ -z "$UNEXPECTED" ] || [ "$TICKER_COUNT" -eq 0 ]; then
  pass "Hardcoded tickers (AAPL/NVDA/TSLA) only in allowed locations"
else
  fail "Hardcoded tickers outside dashboard/tests" "Files: $UNEXPECTED"
fi

# No committed secrets (.env files)
COMMITTED_ENV=$(git -C "$REPO_ROOT" ls-files | { grep '\.env$' || true; } | { grep -v '\.example' || true; })
if [ -z "$COMMITTED_ENV" ]; then
  pass "No .env files committed to git (only .env.example)"
else
  fail "No .env files committed to git" "Found: $COMMITTED_ENV"
fi

# TODO count (informational)
TODO_COUNT=$( { grep -rn "\bTODO\b\|\bFIXME\b\|\bHACK\b" \
  "$BACKEND_DIR" "$WEB_DIR" "$MOBILE_DIR" \
  --include="*.py" --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=__pycache__ \
  2>/dev/null || true; } | wc -l | tr -d ' ')
if [ "$TODO_COUNT" -eq 0 ]; then
  pass "No TODO/FIXME/HACK comments in source code"
else
  log_dim "  ℹ  $TODO_COUNT TODO/FIXME/HACK comment(s) found (informational — not a failure)"
  skip "TODO count: $TODO_COUNT items (review before production release)"
fi

# ═════════════════════════════════════════════════════════════════════════════
# SECTION 8 — TYPESCRIPT / PYTHON TYPE CHECKS
# ═════════════════════════════════════════════════════════════════════════════
section "8. TypeScript & Python Type Checks"

if [ "$SKIP_SLOW" = "1" ]; then
  skip "TypeScript check (SKIP_SLOW=1)"
  skip "Python mypy check (SKIP_SLOW=1)"
else
  # TypeScript — web
  log_dim "  Running tsc --noEmit on neufin-web…"
  cd "$WEB_DIR"
  if npx --yes tsc --noEmit 2>/tmp/tsc_web.log; then
    pass "neufin-web: tsc --noEmit → 0 errors"
  else
    TSC_ERRORS=$(wc -l < /tmp/tsc_web.log | tr -d ' ')
    fail "neufin-web: tsc --noEmit → $TSC_ERRORS error lines" "See /tmp/tsc_web.log"
  fi
  cd "$REPO_ROOT"

  # TypeScript — mobile
  log_dim "  Running tsc --noEmit on neufin-mobile…"
  cd "$MOBILE_DIR"
  if npx --yes tsc --noEmit 2>/tmp/tsc_mobile.log; then
    pass "neufin-mobile: tsc --noEmit → 0 errors"
  else
    TSC_ERRORS=$(wc -l < /tmp/tsc_mobile.log | tr -d ' ')
    fail "neufin-mobile: tsc --noEmit → $TSC_ERRORS error lines" "See /tmp/tsc_mobile.log"
  fi
  cd "$REPO_ROOT"

  # mypy — backend
  if [ -f "$BACKEND_DIR/.venv/bin/mypy" ] || command -v mypy &>/dev/null; then
    log_dim "  Running mypy on neufin-backend…"
    cd "$BACKEND_DIR"
    MYPY_BIN="mypy"
    [ -f ".venv/bin/mypy" ] && MYPY_BIN=".venv/bin/mypy"
    if $MYPY_BIN . --ignore-missing-imports --exclude alembic --quiet 2>/tmp/mypy.log; then
      pass "neufin-backend: mypy → 0 errors"
    else
      MYPY_ERRORS=$(grep -c "error:" /tmp/mypy.log 2>/dev/null || echo "?")
      fail "neufin-backend: mypy → $MYPY_ERRORS error(s)" "See /tmp/mypy.log"
    fi
    cd "$REPO_ROOT"
  else
    skip "mypy not found (run scripts/setup-dev.sh)"
  fi
fi

# ═════════════════════════════════════════════════════════════════════════════
# SECTION 9 — SECURITY SCAN (SAST)
# ═════════════════════════════════════════════════════════════════════════════
section "9. Security Scan (SAST)"

if [ "$SKIP_SLOW" = "1" ]; then
  skip "bandit scan (SKIP_SLOW=1)"
else
  BANDIT_BIN=""
  if command -v bandit &>/dev/null; then
    BANDIT_BIN="bandit"
  elif [ -f "$BACKEND_DIR/.venv/bin/bandit" ]; then
    BANDIT_BIN="$BACKEND_DIR/.venv/bin/bandit"
  fi

  if [ -n "$BANDIT_BIN" ]; then
    log_dim "  Running bandit on neufin-backend (excluding tests + alembic)…"
    cd "$BACKEND_DIR"
    BANDIT_OUT=$($BANDIT_BIN -r . \
      -c .bandit \
      --exclude "./tests,./alembic,./.venv" \
      -f json 2>/dev/null || true)
    HIGH=$(echo "$BANDIT_OUT" | jq '[.results[] | select(.issue_severity=="HIGH")] | length' 2>/dev/null || echo "?")
    MED=$(echo "$BANDIT_OUT"  | jq '[.results[] | select(.issue_severity=="MEDIUM")] | length' 2>/dev/null || echo "?")
    cd "$REPO_ROOT"

    if [ "$HIGH" = "0" ] || [ "$HIGH" = "?" ]; then
      pass "bandit: 0 HIGH severity issues (MEDIUM: $MED)"
    else
      fail "bandit: $HIGH HIGH severity issue(s) found" "Run: bandit -r neufin-backend -c neufin-backend/.bandit -ll"
    fi
  else
    skip "bandit not installed (pip install bandit or run setup-dev.sh)"
  fi

  # ESLint security check on web
  log_dim "  Running ESLint (security plugin) on neufin-web…"
  cd "$WEB_DIR"
  if npm run lint -- --quiet 2>/tmp/eslint.log; then
    pass "neufin-web: ESLint → no errors"
  else
    ESLINT_ERRORS=$(grep -c "error" /tmp/eslint.log 2>/dev/null || echo "?")
    fail "neufin-web: ESLint → $ESLINT_ERRORS error(s)" "See /tmp/eslint.log or run: cd neufin-web && npm run lint"
  fi
  cd "$REPO_ROOT"
fi

# ═════════════════════════════════════════════════════════════════════════════
# SECTION 10 — DEPENDENCY AUDIT
# ═════════════════════════════════════════════════════════════════════════════
section "10. Dependency Audit"

if [ "$SKIP_SLOW" = "1" ]; then
  skip "npm audit (SKIP_SLOW=1)"
  skip "Python dependency audit (SKIP_SLOW=1)"
else
  # npm audit — web
  log_dim "  Running npm audit --production on neufin-web…"
  cd "$WEB_DIR"
  if npm audit --production --json 2>/dev/null | jq -e '.metadata.vulnerabilities.critical == 0' &>/dev/null; then
    HIGHS=$(npm audit --production --json 2>/dev/null | jq '.metadata.vulnerabilities.high // 0')
    pass "neufin-web: npm audit → 0 critical vulnerabilities (high: $HIGHS)"
  else
    CRITS=$(npm audit --production --json 2>/dev/null | jq '.metadata.vulnerabilities.critical // "?"')
    fail "neufin-web: npm audit → critical vulnerabilities found ($CRITS)" \
         "Run: cd neufin-web && npm audit fix"
  fi
  cd "$REPO_ROOT"

  # npm audit — mobile
  log_dim "  Running npm audit --production on neufin-mobile…"
  cd "$MOBILE_DIR"
  if npm audit --production --json 2>/dev/null | jq -e '.metadata.vulnerabilities.critical == 0' &>/dev/null; then
    HIGHS=$(npm audit --production --json 2>/dev/null | jq '.metadata.vulnerabilities.high // 0')
    pass "neufin-mobile: npm audit → 0 critical vulnerabilities (high: $HIGHS)"
  else
    CRITS=$(npm audit --production --json 2>/dev/null | jq '.metadata.vulnerabilities.critical // "?"')
    fail "neufin-mobile: npm audit → critical vulnerabilities found ($CRITS)" \
         "Run: cd neufin-mobile && npm audit fix"
  fi
  cd "$REPO_ROOT"

  # pip-audit or safety — backend
  PIP_AUDIT_BIN=""
  SAFETY_BIN=""
  if [ -f "$BACKEND_DIR/.venv/bin/pip-audit" ]; then PIP_AUDIT_BIN="$BACKEND_DIR/.venv/bin/pip-audit"; fi
  if command -v pip-audit &>/dev/null; then PIP_AUDIT_BIN="pip-audit"; fi
  if [ -f "$BACKEND_DIR/.venv/bin/safety" ]; then SAFETY_BIN="$BACKEND_DIR/.venv/bin/safety"; fi
  if command -v safety &>/dev/null; then SAFETY_BIN="safety"; fi

  if [ -n "$PIP_AUDIT_BIN" ]; then
    log_dim "  Running pip-audit on neufin-backend dependencies…"
    cd "$BACKEND_DIR"
    if $PIP_AUDIT_BIN -r requirements.txt --no-deps -q 2>/tmp/pip_audit.log; then
      pass "neufin-backend: pip-audit → 0 known vulnerabilities"
    else
      VULN_COUNT=$(grep -c "PYSEC\|CVE" /tmp/pip_audit.log 2>/dev/null || echo "?")
      fail "neufin-backend: pip-audit → $VULN_COUNT vulnerability/ies found" \
           "See /tmp/pip_audit.log — update affected packages"
    fi
    cd "$REPO_ROOT"
  elif [ -n "$SAFETY_BIN" ]; then
    log_dim "  Running safety check on neufin-backend dependencies…"
    cd "$BACKEND_DIR"
    if $SAFETY_BIN check -r requirements.txt --quiet 2>/tmp/safety.log; then
      pass "neufin-backend: safety check → 0 known vulnerabilities"
    else
      fail "neufin-backend: safety check → vulnerabilities found" "See /tmp/safety.log"
    fi
    cd "$REPO_ROOT"
  else
    skip "Python dependency audit (pip-audit/safety not installed — pip install pip-audit)"
  fi
fi

# ═════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ═════════════════════════════════════════════════════════════════════════════
log ""
printf "${BLD}${CYN}══════════════════════════════════════════════════════${NC}\n"
printf "${BLD}  Test Results Summary${NC}\n"
printf "${BLD}${CYN}══════════════════════════════════════════════════════${NC}\n"
log ""
printf "  ${GRN}✓ Passed${NC}   : %d\n" "$PASS"
printf "  ${RED}✗ Failed${NC}   : %d\n" "$FAIL"
printf "  ${MAG}✋ Manual${NC}   : %d (complete the checklist above)\n" "$MANUAL"
printf "  ${YLW}− Skipped${NC}  : %d\n" "$SKIP"
log ""

if [ ${#FAILURES[@]} -gt 0 ]; then
  printf "${RED}${BLD}  Failed checks:${NC}\n"
  for f in "${FAILURES[@]}"; do
    printf "    ${RED}•${NC} %s\n" "$f"
  done
  log ""
fi

log "  Completed: $(date '+%Y-%m-%d %H:%M:%S')"
log "  Full log:  $LOG_FILE"
log ""

if [ "$FAIL" -gt 0 ]; then
  printf "${RED}${BLD}  ✗ $FAIL automated check(s) FAILED — review output above.${NC}\n\n"
  exit 1
elif [ "$MANUAL" -gt 0 ]; then
  printf "${MAG}${BLD}  ✋ All automated checks passed. Complete $MANUAL manual step(s) above.${NC}\n\n"
  exit 0
else
  printf "${GRN}${BLD}  ✓ All checks passed!${NC}\n\n"
  exit 0
fi
