#!/usr/bin/env bash
set -euo pipefail

source_dir="hugo-src"
output_dir="$source_dir/public-test"
contract_phase="${X7_RENDER_CONTRACT_PHASE:-baseline}"

rm -rf "$output_dir"
hugo --source "$source_dir" --destination public-test --minify

homepage="$output_dir/index.html"
test -f "$homepage"

for asset in \
  /css/x7-tokens.css \
  /css/x7-shell.css \
  /css/x7-reading.css \
  /css/x7-home.css; do
  grep -q "href=$asset" "$homepage"
done
grep -q 'type=module src=/js/x7/bootstrap.js' "$homepage"

if [[ "$contract_phase" == "digital-nocturne" ]]; then
  grep -q 'data-x7-home' "$homepage"

  article=""
  while IFS= read -r candidate; do
    if [[ -z "$article" ]] && grep -q '<article\|class=article' "$candidate"; then
      article="$candidate"
    fi
  done < <(find "$output_dir" -type f -name '*.html' ! -path "$homepage" ! -path '*/404.html')
  test -n "$article"
  grep -q 'data-x7-article-shell' "$article"
  grep -q 'data-x7-chapter-radar' "$article"
elif [[ "$contract_phase" != "baseline" ]]; then
  echo "Unknown X7_RENDER_CONTRACT_PHASE: $contract_phase" >&2
  exit 2
fi
