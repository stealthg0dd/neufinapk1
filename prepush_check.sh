#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Neufin Pre-Push Secret Scanner
# Scans only source code (.py .ts .tsx .js .jsx) — ignores .env files,
# node_modules, build artefacts, and the script itself.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'

FOUND=0

# Source-file extensions to scan
INCLUDE_EXTS=( --include="*.py" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" )

# Directories / files to always skip
EXCLUDE_DIRS=( --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=__pycache__ --exclude-dir=.git --exclude-dir=dist --exclude-dir=build --exclude-dir=.expo )
EXCLUDE_FILES=( --exclude="*.sh" --exclude=".env" --exclude=".env.*" --exclude="*.env" --exclude="*.env.*" )

echo "=== Neufin Pre-Push Secret Scan ==="
echo "Scanning: .py  .ts  .tsx  .js  .jsx"
echo "Ignoring: .env* files, node_modules, build artefacts"
echo ""

scan() {
    local label="$1"
    local pattern="$2"
    local result
    result=$(grep -rE --no-messages "$pattern" "$REPO_ROOT" \
        "${INCLUDE_EXTS[@]}" \
        "${EXCLUDE_DIRS[@]}" \
        "${EXCLUDE_FILES[@]}" 2>/dev/null || true)
    if [[ -n "$result" ]]; then
        echo -e "${RED}❌ LEAK: ${label}${NC}"
        echo "$result"
        echo ""
        FOUND=1
    else
        echo -e "${GREEN}✅ ${label}${NC}"
    fi
}

# ── Secret patterns ───────────────────────────────────────────────────────────

# Generic sk-* API key assigned as a string literal (covers Anthropic, OpenAI, Stripe)
scan "API key literal (sk-...)"            '"sk-[A-Za-z0-9_-]{20,}"'

# JWT / Supabase session token as a hardcoded string literal
scan "Hardcoded JWT / Supabase token"      '"eyJ[A-Za-z0-9+/]{40,}"'

# AWS access key ID (always exactly AKIA + 16 uppercase alphanumeric chars)
scan "AWS access key ID (AKIA...)"         'AKIA[A-Z0-9]{16}'

# Supabase project ref — must not appear in source code
scan "Supabase project ref"                'ufceucqgqddwfrjybokes'

# Known-bad key fragments from prior audit
scan "Known-bad fragment (yU5K)"           'yU5K[A-Za-z0-9]+'
scan "Known-bad fragment (DZG9)"           'DZG9[A-Za-z0-9]+'

# ── Result ────────────────────────────────────────────────────────────────────
echo ""
if [[ $FOUND -eq 0 ]]; then
    echo -e "${GREEN}=== All checks passed — safe to push ===${NC}"
    exit 0
else
    echo -e "${RED}=== SECRET LEAK DETECTED — do NOT push until resolved ===${NC}"
    exit 1
fi
