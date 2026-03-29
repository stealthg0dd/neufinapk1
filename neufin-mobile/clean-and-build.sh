#!/usr/bin/env bash
# clean-and-build.sh — wipe all caches and run a fresh EAS production build.
# Also checks for minimum free disk space before starting (Android needs ~3 GB).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

REQUIRED_GB=3

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Neufin Mobile — Clean & Build"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Disk-space guard ──────────────────────────────────────────────────────────
AVAIL_GB=$(df -g / | awk 'NR==2 {print $4}')
echo "→ Free disk space: ${AVAIL_GB} GB (need ${REQUIRED_GB} GB)"
if [ "$AVAIL_GB" -lt "$REQUIRED_GB" ]; then
  echo ""
  echo "ERROR: Not enough free space (${AVAIL_GB} GB < ${REQUIRED_GB} GB)."
  echo "Run the following to free space, then retry:"
  echo "  rm -rf ~/.gradle/caches/transforms-4/"
  echo "  rm -rf ~/Library/Caches/Homebrew/"
  echo "  brew cleanup"
  echo "  rm -rf ~/Library/Caches/pip/"
  exit 1
fi

# ── Stop Metro ────────────────────────────────────────────────────────────────
echo "→ Stopping Metro bundler..."
pkill -f "metro" 2>/dev/null || true

# ── Watchman ──────────────────────────────────────────────────────────────────
if command -v watchman &>/dev/null; then
  echo "→ Clearing Watchman..."
  watchman watch-del-all 2>/dev/null || true
fi

# ── Metro / React Native temp caches ─────────────────────────────────────────
echo "→ Removing Metro /tmp caches..."
rm -rf /tmp/metro-* /tmp/haste-* /tmp/react-native-* 2>/dev/null || true

# ── node_modules Babel/Metro cache ───────────────────────────────────────────
echo "→ Removing node_modules/.cache..."
rm -rf node_modules/.cache

# ── Expo / EAS local state ────────────────────────────────────────────────────
echo "→ Removing .expo folder..."
rm -rf .expo

# ── Android Gradle build outputs ─────────────────────────────────────────────
echo "→ Cleaning Android build outputs..."
rm -rf android/.gradle android/app/build android/build

# ── Previous EAS local build artifacts ───────────────────────────────────────
echo "→ Removing EAS local build artifacts..."
rm -rf /private/var/folders/mq/*/T/eas-build-local-nodejs/ 2>/dev/null || true

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Cache wipe done. Free: $(df -g / | awk 'NR==2 {print $4}') GB"
echo " Starting EAS build…"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

export ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"

EAS_NO_DOCTOR=1 npx eas build \
  --platform android \
  --profile production \
  --local \
  --clear-cache
