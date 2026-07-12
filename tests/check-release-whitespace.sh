#!/usr/bin/env bash
set -euo pipefail

candidate="${X7_VERIFY_BASE:-}"
if [[ -n "$candidate" && ! "$candidate" =~ ^0+$ ]] && base="$(git rev-parse --verify "$candidate^{commit}" 2>/dev/null)"; then
  git diff --check "$base..HEAD"
elif git rev-parse --verify HEAD^ >/dev/null 2>&1; then
  git diff --check HEAD^..HEAD
else
  git diff-tree --check --root -r HEAD
fi
