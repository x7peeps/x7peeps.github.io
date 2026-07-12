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

node - "$homepage" <<'NODE'
const fs = require("node:fs");
const homepage = fs.readFileSync(process.argv[2], "utf8");
const headEnd = homepage.indexOf("</head>");
const bodyStart = homepage.indexOf("<body");

if (headEnd === -1 || bodyStart === -1 || headEnd > bodyStart) process.exit(1);

for (const asset of [
  "/css/custom.css",
  "/css/x7-tokens.css",
  "/css/x7-shell.css",
  "/css/x7-reading.css",
  "/css/x7-home.css",
]) {
  const first = homepage.indexOf(asset);
  if (first === -1 || first > headEnd || first !== homepage.lastIndexOf(asset)) process.exit(1);
}

for (const asset of ["/js/custom.js", "/js/x7/bootstrap.js"]) {
  const first = homepage.indexOf(asset);
  if (first < bodyStart || first !== homepage.lastIndexOf(asset)) process.exit(1);
}
NODE

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
