#!/usr/bin/env bash
# test_auth.sh — End-to-end authentication verification script
#
# Prerequisites:
#   - curl, jq
#   - A valid Supabase access token in $TOKEN
#     (sign in at https://neufin.app, open DevTools → Application →
#      Local Storage → find the sb-*-auth-token key, copy access_token)
#
# Usage:
#   TOKEN="eyJhbGci..." bash scripts/test_auth.sh
#
# What it tests:
#   1. /api/auth/status with a valid token      → authenticated: true
#   2. /api/auth/status with no token           → authenticated: false
#   3. /api/auth/status with a garbage token    → authenticated: false, error present
#   4. A protected endpoint with the token      → 200
#   5. A protected endpoint with no token       → 401
#
# Exit code: 0 if all checks pass, 1 if any fail.

set -euo pipefail

API="${API_URL:-https://neufin101-production.up.railway.app}"
PASS=0
FAIL=0

RED='\033[0;31m'
GRN='\033[0;32m'
YLW='\033[1;33m'
NC='\033[0m'

check() {
  local desc="$1"
  local expected="$2"
  local actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo -e "  ${GRN}✓${NC}  $desc"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗${NC}  $desc"
    echo -e "       expected: ${YLW}${expected}${NC}"
    echo -e "       actual:   ${YLW}${actual}${NC}"
    FAIL=$((FAIL + 1))
  fi
}

if [ -z "${TOKEN:-}" ]; then
  echo -e "${RED}ERROR:${NC} TOKEN env var is required."
  echo "  Usage: TOKEN='eyJhbGci...' bash scripts/test_auth.sh"
  exit 1
fi

echo ""
echo "Neufin Auth Verification"
echo "========================"
echo "API: $API"
echo ""

# ── 1. Valid token → authenticated: true ──────────────────────────────────────
echo "1. /api/auth/status — valid token"
RESP=$(curl -sf -H "Authorization: Bearer $TOKEN" "$API/api/auth/status" 2>/dev/null || echo '{"error":"curl_failed"}')
AUTH=$(echo "$RESP" | jq -r '.authenticated // false')
USER=$(echo "$RESP" | jq -r '.user_id // ""')
EXP=$(echo "$RESP"  | jq -r '.expires_at // ""')
check "authenticated=true"     "true"  "$AUTH"
check "user_id non-empty"      "ok"    "$([ -n "$USER" ] && echo ok || echo empty)"
check "expires_at present"     "ok"    "$([ -n "$EXP"  ] && echo ok || echo empty)"
echo "   user_id:    ${USER:0:8}…"
echo "   expires_at: $EXP"
echo ""

# ── 2. No token → authenticated: false ────────────────────────────────────────
echo "2. /api/auth/status — no token"
RESP=$(curl -sf "$API/api/auth/status" 2>/dev/null || echo '{"error":"curl_failed"}')
AUTH=$(echo "$RESP" | jq -r '.authenticated // true')
ERR=$(echo "$RESP"  | jq -r '.error // ""')
check "authenticated=false"    "false" "$AUTH"
check "error message present"  "ok"    "$([ -n "$ERR" ] && echo ok || echo empty)"
echo ""

# ── 3. Garbage token → authenticated: false + error ───────────────────────────
echo "3. /api/auth/status — invalid token"
RESP=$(curl -sf -H "Authorization: Bearer garbage.token.value" "$API/api/auth/status" 2>/dev/null || echo '{"error":"curl_failed"}')
AUTH=$(echo "$RESP" | jq -r '.authenticated // true')
ERR=$(echo "$RESP"  | jq -r '.error // ""')
check "authenticated=false"    "false" "$AUTH"
check "error message present"  "ok"    "$([ -n "$ERR" ] && echo ok || echo empty)"
echo ""

# ── 4. Protected endpoint with valid token → 200 ──────────────────────────────
echo "4. Protected endpoint (GET /api/portfolio/list) — valid token"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$API/api/portfolio/list")
check "HTTP 200"               "200"   "$STATUS"
echo ""

# ── 5. Protected endpoint with no token → 401 ─────────────────────────────────
echo "5. Protected endpoint (GET /api/portfolio/list) — no token"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/portfolio/list")
check "HTTP 401"               "401"   "$STATUS"
echo ""

# ── Summary ───────────────────────────────────────────────────────────────────
echo "========================"
echo -e "Results: ${GRN}${PASS} passed${NC}  ${RED}${FAIL} failed${NC}"
echo ""

[ "$FAIL" -eq 0 ]
