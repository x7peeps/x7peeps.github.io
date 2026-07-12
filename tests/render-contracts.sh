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
  article="$output_dir/安全/安全基础/密码学基础/1-散列与认证/单向散列与HMAC机制底层解剖/index.html"
  test -f "$article"
  grep -q 'data-x7-article-shell' "$article"
  grep -q 'data-x7-article-content' "$article"
  grep -q 'data-x7-chapter-radar' "$article"
  grep -q 'data-x7-chapter-list' "$article"
  grep -q 'data-x7-chapter-close' "$article"
  grep -q 'data-x7-mobile-progress' "$article"
  grep -q 'data-x7-knowledge-tree' "$article"

  duplicate_article="$article"
  test -f "$duplicate_article"
  node - "$duplicate_article" <<'NODE'
const fs = require("node:fs");
const html = fs.readFileSync(process.argv[2], "utf8");
const count = (pattern) => [...html.matchAll(pattern)].length;
const headings = [...html.matchAll(/<h1\b([^>]*)>([\s\S]*?)<\/h1>/g)];
const title = "单向散列与HMAC：底层逻辑、碰撞漏洞与长度扩展攻击";
const plain = (value) => value.replace(/<[^>]+>/g, "").replaceAll("&amp;", "&").trim();
const shell = html.match(/<article\b[^>]*\bdata-x7-article-shell\b[^>]*>/)?.[0] ?? "";
const shellClasses = shell.match(/\bclass=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/);
const classTokens = (shellClasses?.[1] ?? shellClasses?.[2] ?? shellClasses?.[3] ?? "").split(/\s+/);
if (!classTokens.includes("x7-article-shell") || classTokens.includes("x7-article")) process.exit(1);
if (headings.length !== 1 || plain(headings[0][2]) !== title) process.exit(1);
if (count(/\bid=([^\s>]+)/g) !== new Set([...html.matchAll(/\bid=([^\s>]+)/g)].map((match) => match[1])).size) process.exit(1);
if (count(/\bdata-x7-article-content\b/g) !== 1) process.exit(1);
if (count(/\bdata-x7-updated\b/g) !== 1) process.exit(1);
if (count(/\bclass=x7-tag-chips\b/g) > 1) process.exit(1);
NODE

  distinct_h1_article="$output_dir/安全/安全基础/操作系统/Windows/Powershell/ms-gpsb_window核心协议-安全扩展协议/index.html"
  test -f "$distinct_h1_article"
  node - "$distinct_h1_article" <<'NODE'
const fs = require("node:fs");
const html = fs.readFileSync(process.argv[2], "utf8");
const headings = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)]
  .map((match) => match[1].replace(/<[^>]+>/g, "").trim());
if (!headings.includes("1. 介绍")) process.exit(1);
NODE
elif [[ "$contract_phase" != "baseline" ]]; then
  echo "Unknown X7_RENDER_CONTRACT_PHASE: $contract_phase" >&2
  exit 2
fi
