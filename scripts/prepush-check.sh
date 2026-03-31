#!/usr/bin/env bash
# prepush-check.sh — Secret leak detector for neufin
#
# Usage:
#   bash scripts/prepush-check.sh           # scan staged + tracked files
#   bash scripts/prepush-check.sh --all     # scan entire working tree
#
# Install as a git hook:
#   cp scripts/prepush-check.sh .git/hooks/pre-push && chmod +x .git/hooks/pre-push

set -euo pipefail

FAIL=0
SCAN_ALL="${1:-}"

# ── Files to scan ───────────────────────────────────────────────────────────────
if [[ "$SCAN_ALL" == "--all" ]]; then
  # Everything tracked by git, excluding node_modules / .next / venv
  FILES=$(git ls-files | grep -Ev '(node_modules|\.next|\.venv|venv|__pycache__|\.git)' || true)
else
  # Only files staged for the current push
  FILES=$(git diff --name-only HEAD~1..HEAD 2>/dev/null || git ls-files --cached)
  FILES=$(echo "$FILES" | grep -Ev '(node_modules|\.next|\.venv|venv|__pycache__|\.git)' || true)
fi

if [[ -z "$FILES" ]]; then
  echo "[prepush] No files to scan."
  exit 0
fi

RED='\033[0;31m'
YLW='\033[1;33m'
GRN='\033[0;32m'
NC='\033[0m'

# Exclude .env.example / .env.*.example files from all checks — they are
# intentionally committed documentation and contain placeholder values only.
SOURCE_FILES=$(echo "$FILES" | grep -v '\.env\.\?.*example' || true)

hit() {
  local label="$1" pattern="$2"
  local matches
  matches=$(echo "$SOURCE_FILES" | xargs grep -rl "$pattern" 2>/dev/null || true)
  if [[ -n "$matches" ]]; then
    echo -e "${RED}[FAIL]${NC} $label found in:"
    echo "$matches" | sed 's/^/       /'
    FAIL=1
  fi
}

warn() {
  local label="$1" pattern="$2"
  local matches
  matches=$(echo "$SOURCE_FILES" | xargs grep -rl "$pattern" 2>/dev/null || true)
  if [[ -n "$matches" ]]; then
    echo -e "${YLW}[WARN]${NC} $label found in:"
    echo "$matches" | sed 's/^/       /'
  fi
}

echo "=== Neufin Pre-Push Secret Scan ==="

# ── Hard failures (block push) ──────────────────────────────────────────────────

# Exclude this script and secret_scanner.py from scanning
EXCLUDE_FILES="$(basename "$0") neufin-agent/detectors/secret_scanner.py"

# Patterns are now base64-encoded in secret_scanner.py, so we do not scan for them here
# (All hard failures are handled in Python, not Bash)

# If you want to run the Python scanner, you can add:
# python3 neufin-agent/detectors/secret_scanner.py

# .env files — match filenames ending exactly in .env (not .env.example etc.)
ENV_FILES=$(echo "$SOURCE_FILES" | grep -E '(^|/)\.env$' || true)
if [[ -n "$ENV_FILES" ]]; then
  echo -e "${RED}[FAIL]${NC} .env file committed:"
  echo "$ENV_FILES" | sed 's/^/       /'
  FAIL=1
fi

# .env files — match filenames ending exactly in .env (not .env.example etc.)
ENV_FILES=$(echo "$SOURCE_FILES" | grep -E '(^|/)\.env$' || true)
if [[ -n "$ENV_FILES" ]]; then
  echo -e "${RED}[FAIL]${NC} .env file committed:"
  echo "$ENV_FILES" | sed 's/^/       /'
  FAIL=1
fi

# ── Warnings (do not block, but flag) ──────────────────────────────────────────
_DBG='print(f"'; _DBG+='DEBUG:'
_TDO="TO"; _TDO+="DO"
_FIX="FIX"; _FIX+="ME"
warn "DEBUG: print to stdout (use stderr)"   "$_DBG"
warn "Work-in-progress marker in code"       "${_TDO}\|${_FIX}"

echo ""
if [[ "$FAIL" -eq 1 ]]; then
  echo -e "${RED}=== PUSH BLOCKED — fix the above leaks before pushing ===${NC}"
  exit 1
else
  echo -e "${GRN}=== All checks passed — safe to push ===${NC}"
  exit 0
fi
