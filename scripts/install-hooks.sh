#!/bin/bash
# install-hooks.sh – Install shared Git hooks from .githooks/
#
# Usage: bash scripts/install-hooks.sh
# Run once after cloning the repository.

set -e

REPO_ROOT="$(git rev-parse --show-toplevel)"

echo "📌 Configuring Git to use shared hooks from .githooks/ ..."
git -C "$REPO_ROOT" config core.hooksPath .githooks

echo "✅ Hooks installed. The pre-commit hook will now block direct commits to 'main'."
