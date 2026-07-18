#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

has_explicit_date() {
  awk '
    BEGIN { status = 1; delimiter = "" }
    NR == 1 {
      if ($0 == "---" || $0 == "+++") delimiter = $0
      else exit 1
      next
    }
    $0 == delimiter {
      status = found ? 0 : 1
      exit
    }
    delimiter == "---" && /^date:[[:space:]]*/ { found = 1 }
    delimiter == "+++" && /^date[[:space:]]*=/ { found = 1 }
    END { exit status }
  ' "$1"
}

missing=()
while IFS= read -r -d '' path; do
  case "$path" in
    *.md) ;;
    *) continue ;;
  esac

  case "$path" in
    */_index.md) continue ;;
    */privacy.md|*/policy.md) continue ;;
  esac

  if ! has_explicit_date "$path"; then
    missing+=("$path")
  fi
done < <(git ls-files -z -- hugo-src/content)

if ((${#missing[@]})); then
  printf 'tracked legacy articles without an explicit date (%d):\n' "${#missing[@]}" >&2
  printf '  %s\n' "${missing[@]:0:20}" >&2
  exit 1
fi

printf 'legacy date contract passed\n'
