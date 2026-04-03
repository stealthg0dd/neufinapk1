#!/usr/bin/env bash
# scripts/smoke_test_prod.sh
# NeuFin production smoke test — tests critical API flows against Railway backend.
#
# Usage:
#   ./scripts/smoke_test_prod.sh
#   BASE_URL=https://custom.host.com ./scripts/smoke_test_prod.sh
#   TEST_TOKEN=eyJ... ./scripts/smoke_test_prod.sh

set -euo pipefail

BASE_URL="${BASE_URL:-https://neufin101-production.up.railway.app}"
TEST_TOKEN="${TEST_TOKEN:-}"
CSV_FILE="${CSV_FILE:-$(dirname "$0")/../../test_new.csv}"

# ── Colours ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0

pass() { echo -e "${GREEN}PASS${NC} [$1] HTTP $2 — ${3:0:200}"; PASS=$((PASS+1)); }
fail() { echo -e "${RED}FAIL${NC} [$1] HTTP $2 — ${3:0:200}"; FAIL=$((FAIL+1)); }
skip() { echo -e "${YELLOW}SKIP${NC} [$1] $2"; }

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "NeuFin Smoke Test — $BASE_URL"
echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Test 1: Health check ───────────────────────────────────────────────────────
echo ""
echo "▶  Test 1: Health check — GET /health"

HTTP_CODE=$(curl -s -o /tmp/neufin_smoke_body.txt -w "%{http_code}" \
  --max-time 15 \
  "$BASE_URL/health")
BODY=$(cat /tmp/neufin_smoke_body.txt)

if [[ "$HTTP_CODE" == "200" ]] && \
   echo "$BODY" | grep -q '"status"' && \
   (echo "$BODY" | grep -q '"ok"' || echo "$BODY" | grep -q 'healthy'); then
  pass "health" "$HTTP_CODE" "$BODY"
else
  fail "health" "$HTTP_CODE" "$BODY"
fi

# ── Test 2: DNA Analysis ───────────────────────────────────────────────────────
echo ""
echo "▶  Test 2: DNA analysis — POST /api/analyze-dna"

if [[ ! -f "$CSV_FILE" ]]; then
  skip "dna-analysis" "CSV file not found at $CSV_FILE"
else
  HTTP_CODE=$(curl -s -o /tmp/neufin_smoke_body.txt -w "%{http_code}" \
    --max-time 60 \
    -X POST \
    -F "file=@${CSV_FILE};type=text/csv" \
    "$BASE_URL/api/analyze-dna")
  BODY=$(cat /tmp/neufin_smoke_body.txt)

  if [[ "$HTTP_CODE" == "200" ]] && echo "$BODY" | grep -q 'dna_score'; then
    pass "dna-analysis" "$HTTP_CODE" "$BODY"
  elif [[ "$HTTP_CODE" == "404" ]]; then
    fail "dna-analysis" "$HTTP_CODE" "Route not found — possible routing issue"
  elif [[ "$HTTP_CODE" == "422" ]]; then
    fail "dna-analysis" "$HTTP_CODE" "Validation error: $BODY"
  else
    fail "dna-analysis" "$HTTP_CODE" "$BODY"
  fi
fi

# ── Test 3: Auth status ────────────────────────────────────────────────────────
echo ""
echo "▶  Test 3: Auth status — GET /api/auth/status"

HTTP_CODE=$(curl -s -o /tmp/neufin_smoke_body.txt -w "%{http_code}" \
  --max-time 15 \
  "$BASE_URL/api/auth/status")
BODY=$(cat /tmp/neufin_smoke_body.txt)

if [[ "$HTTP_CODE" == "200" ]]; then
  pass "auth-status" "$HTTP_CODE" "$BODY"
elif [[ "$HTTP_CODE" == "401" ]]; then
  # 401 is acceptable (unauthenticated), but not 404
  pass "auth-status" "$HTTP_CODE" "$BODY (unauthenticated — endpoint exists)"
elif [[ "$HTTP_CODE" == "404" ]]; then
  fail "auth-status" "$HTTP_CODE" "Route not found — endpoint missing"
else
  fail "auth-status" "$HTTP_CODE" "$BODY"
fi

# ── Test 4: Portfolio list ─────────────────────────────────────────────────────
echo ""
echo "▶  Test 4: Portfolio list — GET /api/portfolio/list"

if [[ -z "$TEST_TOKEN" ]]; then
  # Try unauthenticated — expect 401, NOT 404
  HTTP_CODE=$(curl -s -o /tmp/neufin_smoke_body.txt -w "%{http_code}" \
    --max-time 15 \
    "$BASE_URL/api/portfolio/list")
  BODY=$(cat /tmp/neufin_smoke_body.txt)

  if [[ "$HTTP_CODE" == "401" ]] || [[ "$HTTP_CODE" == "403" ]]; then
    pass "portfolio-list" "$HTTP_CODE" "Auth required (endpoint exists)"
  elif [[ "$HTTP_CODE" == "200" ]]; then
    pass "portfolio-list" "$HTTP_CODE" "$BODY"
  elif [[ "$HTTP_CODE" == "404" ]]; then
    fail "portfolio-list" "$HTTP_CODE" "Route not found — endpoint missing"
  else
    fail "portfolio-list" "$HTTP_CODE" "$BODY"
  fi
else
  HTTP_CODE=$(curl -s -o /tmp/neufin_smoke_body.txt -w "%{http_code}" \
    --max-time 15 \
    -H "Authorization: Bearer $TEST_TOKEN" \
    "$BASE_URL/api/portfolio/list")
  BODY=$(cat /tmp/neufin_smoke_body.txt)

  if [[ "$HTTP_CODE" == "200" ]] || [[ "$HTTP_CODE" == "401" ]]; then
    pass "portfolio-list" "$HTTP_CODE" "$BODY"
  elif [[ "$HTTP_CODE" == "404" ]]; then
    fail "portfolio-list" "$HTTP_CODE" "Route not found — endpoint missing"
  else
    fail "portfolio-list" "$HTTP_CODE" "$BODY"
  fi
fi

# ── Test 5: Swarm report latest ────────────────────────────────────────────────
echo ""
echo "▶  Test 5: Swarm report — GET /api/swarm/report/latest"

SWARM_HEADERS=()
if [[ -n "$TEST_TOKEN" ]]; then
  SWARM_HEADERS=(-H "Authorization: Bearer $TEST_TOKEN")
fi

HTTP_CODE=$(curl -s -o /tmp/neufin_smoke_body.txt -w "%{http_code}" \
  --max-time 15 \
  "${SWARM_HEADERS[@]+"${SWARM_HEADERS[@]}"}" \
  "$BASE_URL/api/swarm/report/latest")
BODY=$(cat /tmp/neufin_smoke_body.txt)

if [[ "$HTTP_CODE" == "200" ]] || [[ "$HTTP_CODE" == "401" ]] || [[ "$HTTP_CODE" == "403" ]] || [[ "$HTTP_CODE" == "404" && $(echo "$BODY" | grep -c '"detail"') -gt 0 && $(echo "$BODY" | grep -c 'not found') -gt 0 ]]; then
  # 200 ok, 401/403 auth required — both indicate route exists
  if [[ "$HTTP_CODE" == "404" ]]; then
    # Distinguish: body says "report not found" (data 404) vs route 404
    if echo "$BODY" | grep -qi 'report\|not found'; then
      pass "swarm-report" "$HTTP_CODE" "No report data yet (route exists)"
    else
      fail "swarm-report" "$HTTP_CODE" "Route not found"
    fi
  else
    pass "swarm-report" "$HTTP_CODE" "$BODY"
  fi
else
  fail "swarm-report" "$HTTP_CODE" "$BODY"
fi

# ── Summary ────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "Results: ${GREEN}${PASS} PASS${NC}  ${RED}${FAIL} FAIL${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
exit 0
