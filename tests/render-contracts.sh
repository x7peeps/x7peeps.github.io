#!/usr/bin/env bash
set -euo pipefail

source_dir="hugo-src"
output_dir="$source_dir/public-test"
contract_phase="${X7_RENDER_CONTRACT_PHASE:-digital-nocturne}"

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
  article="$(node - "$output_dir" "$source_dir" < <(hugo list all --source "$source_dir" 2>/dev/null) <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const output = process.argv[2];
const source = process.argv[3];
const rows = fs.readFileSync(0, "utf8").trim().split("\n");
const headers = rows.shift().split(",");
const kind = headers.indexOf("kind");
const permalink = headers.indexOf("permalink");
const sourcePath = headers.indexOf("path");

for (const row of rows) {
  const columns = row.split(",");
  if (columns[kind] !== "page") continue;
  const markdown = path.join(source, columns[sourcePath].replace(/^content\//, "content/"));
  if (!fs.existsSync(markdown) || !/^#{2,4}\s+\S/m.test(fs.readFileSync(markdown, "utf8"))) continue;
  const pathname = decodeURIComponent(new URL(columns[permalink]).pathname).replace(/^\/+/, "");
  const candidate = path.join(output, pathname, "index.html");
  if (fs.existsSync(candidate)) {
    process.stdout.write(candidate);
    break;
  }
}
NODE
)"
  test -n "$article"
  grep -q 'data-x7-article-shell' "$article"
  grep -q 'data-x7-article-content' "$article"
  grep -q 'data-x7-chapter-radar' "$article"
  grep -q 'data-x7-chapter-list' "$article"
  grep -q 'data-x7-knowledge-tree' "$article"
elif [[ "$contract_phase" != "baseline" ]]; then
  echo "Unknown X7_RENDER_CONTRACT_PHASE: $contract_phase" >&2
  exit 2
fi
