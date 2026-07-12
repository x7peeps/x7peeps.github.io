#!/usr/bin/env bash
set -euo pipefail

source_dir="hugo-src"
output_dir="$source_dir/public-test"
contract_phase="${X7_RENDER_CONTRACT_PHASE:-digital-nocturne}"

rm -rf "$output_dir"
render_output="$(hugo --source "$source_dir" --destination public-test --minify 2>&1)"
printf '%s\n' "$render_output"
! grep -q "UNSUPPORTED usage of 'search' output format" <<<"$render_output"

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
  search_index="$output_dir/search.json"
  test -f "$search_index"
  test -f "$output_dir/index.json"
  test -f "$source_dir/static/js/x7/search-core.js"
  test -f "$source_dir/static/js/x7/search-dialog.js"
  node - "$search_index" "$homepage" "$output_dir" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const [indexPath, homepagePath, outputDir] = process.argv.slice(2);
const documents = JSON.parse(fs.readFileSync(indexPath, "utf8"));
const homepage = fs.readFileSync(homepagePath, "utf8");
const count = pattern => [...homepage.matchAll(pattern)].length;
const entityPattern = /&(?:amp|lt|gt|quot|#\d+|#x[\da-f]+);/i;
if (!Array.isArray(documents) || documents.length < 100 || documents.length > 5000) process.exit(1);
if (new Set(documents.map(document => document.url)).size !== documents.length) process.exit(1);
for (const document of documents) {
  if (!document || typeof document !== "object") process.exit(1);
  for (const field of ["title", "url", "section", "summary", "updated"]) {
    if (typeof document[field] !== "string") process.exit(1);
  }
  if (!Array.isArray(document.tags) || document.tags.some(tag => typeof tag !== "string")) process.exit(1);
  if (!document.url.startsWith("/") || document.url === "/" || document.url.includes("404")) process.exit(1);
  if (entityPattern.test(document.summary)) process.exit(1);
  // Hugo truncates Unicode code points; JS length counts astral characters as two code units.
  if ([...document.summary].length > 190 || Number.isNaN(Date.parse(document.updated))) process.exit(1);
}
const commandControl = documents.find(document => document.title.includes("影子流量：高级代理隧道与C2隐蔽通信编排"));
if (!commandControl?.summary.includes("Command & Control")) process.exit(1);
if (!documents.some(document => document.summary.includes('"'))) process.exit(1);
if (count(/\bdata-x7-search-open\b/g) !== 1 || count(/\bdata-x7-search-dialog\b/g) !== 1) process.exit(1);
if (!/<input\b[^>]*\brole=combobox\b[^>]*\baria-controls=x7-search-results\b[^>]*\baria-expanded=false\b/.test(homepage)) process.exit(1);
if (!/<ol\b[^>]*\brole=listbox\b/.test(homepage)) process.exit(1);
const endpointMatch = homepage.match(/\bdata-search-url=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/);
const endpoint = endpointMatch?.[1] ?? endpointMatch?.[2] ?? endpointMatch?.[3];
if (!endpoint || !new URL(endpoint, "https://render.invalid").pathname.endsWith("/search.json")) process.exit(1);
const emittedFile = path.join(outputDir, path.basename(new URL(endpoint, "https://render.invalid").pathname));
if (!fs.existsSync(emittedFile) || fs.realpathSync(emittedFile) !== fs.realpathSync(indexPath)) process.exit(1);
NODE

  subpath_output="$(mktemp -d)"
  trap 'rm -rf "$subpath_output"' EXIT
  subpath_render_output="$(hugo --source "$source_dir" --destination "$subpath_output" --baseURL "https://render.invalid/docs/" --minify 2>&1)"
  ! grep -q "UNSUPPORTED usage of 'search' output format" <<<"$subpath_render_output"
  node - "$subpath_output/index.html" "$subpath_output/search.json" <<'NODE'
const fs = require("node:fs");
const [homepagePath, searchPath] = process.argv.slice(2);
const homepage = fs.readFileSync(homepagePath, "utf8");
const endpointMatch = homepage.match(/\bdata-search-url=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/);
const endpoint = endpointMatch?.[1] ?? endpointMatch?.[2] ?? endpointMatch?.[3];
if (endpoint !== "/docs/search.json" || !fs.existsSync(searchPath)) process.exit(1);
JSON.parse(fs.readFileSync(searchPath, "utf8"));
NODE

  ! grep -q 'createElement("a")' "$source_dir/static/js/x7/search-dialog.js"
  ! grep -Eq 'options\[[^]]+\][.]focus|querySelectorAll[^;]+[.]focus' "$source_dir/static/js/x7/search-dialog.js"
  grep -q 'scrollIntoView' "$source_dir/static/js/x7/search-dialog.js"

  related_partial="$source_dir/layouts/partials/x7/related-content.html"
  related_index_partial="$source_dir/layouts/partials/x7/related-index.html"
  test -f "$related_index_partial"
  ! grep -Eq 'range[[:space:]]+site\.RegularPages' "$related_partial"
  grep -q 'partialCached "x7/related-index.html"' "$related_partial"

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

  tags_index="$output_dir/tags/index.html"
  test -f "$tags_index"
  grep -q 'data-x7-tag-index' "$tags_index"

  tagged_article="$output_dir/安全/渗透测试/04-渗透攻击/PostgreSQL_COPY_lo_import_dblink_PL_Python_RCE_文件读写与提权利用技术/index.html"
  tagless_article="$article"
  test -f "$tagged_article"
  test -f "$tagless_article"

  node - "$output_dir" "$tags_index" "$tagged_article" "$tagless_article" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const [root, tagIndexPath, taggedPath, taglessPath] = process.argv.slice(2);
const read = file => fs.readFileSync(file, "utf8");
const index = read(tagIndexPath);
if (!/<h1\b[^>]*>[^<]+<\/h1>/.test(index)) process.exit(1);
const terms = [...index.matchAll(/<a\b[^>]*href=([^\s>]+)[^>]*><span>[^<]*<\/span>\s*<span\b[^>]*data-x7-tag-count[^>]*>(\d+)<\/span>/g)];
if (!terms.length || terms.some(([, href, count]) => !href.startsWith("/tags/") || Number(count) < 1)) process.exit(1);

const termHref = terms.find(([, , count]) => Number(count) > 1)?.[1] ?? terms[0][1];
const termFile = path.join(root, decodeURI(termHref.replace(/^\//, "")), "index.html");
if (!fs.existsSync(termFile)) process.exit(1);
const term = read(termFile);
if (!/data-x7-taxonomy-results/.test(term) || !/<h1\b[^>]*>[^<]+<\/h1>/.test(term)) process.exit(1);
if (!term.includes("data-x7-taxonomy-result") || !term.includes("data-x7-result-section")) process.exit(1);
const dates = [...term.matchAll(/<time\b[^>]*datetime=([^\s>]+)[^>]*>/g)].map(([, date]) => Date.parse(date));
if (!dates.length) process.exit(1);
if (dates.some(Number.isNaN) || dates.some((date, i) => i && date > dates[i - 1])) process.exit(1);

const tagged = { file: taggedPath, html: read(taggedPath) };
const tagless = { file: taglessPath, html: read(taglessPath) };
if (![tagged, tagless].every(article => article.html.includes("data-x7-article-shell"))) process.exit(1);
if ([...tagged.html.matchAll(/<nav\b[^>]*class=x7-tag-chips\b/g)].length !== 1) process.exit(1);
if ([...tagless.html.matchAll(/<nav\b[^>]*class=x7-tag-chips\b/g)].length) process.exit(1);
for (const article of [tagged, tagless]) {
  const hookStart = article.html.indexOf("<section", article.html.indexOf("data-x7-related-content") - 200);
  const hookEnd = article.html.indexOf("</section>", hookStart);
  const hook = hookStart >= 0 && hookEnd >= 0 ? article.html.slice(hookStart, hookEnd + 10) : "";
  if (!hook) process.exit(1);
  const links = [...hook.matchAll(/<a\b[^>]*data-x7-related-link[^>]*href=([^\s>]+)/g)].map(match => match[1]);
  const current = article.html.match(/<body\b[^>]*data-origin=([^\s>]+)/)?.[1];
  if (!current) process.exit(1);
  if (links.length > 4 || new Set(links).size !== links.length || links.includes(current)) process.exit(1);
  if (!links.length && /<h2\b|<ul\b/.test(hook)) process.exit(1);
  if (article === tagged && !/<a\b[^>]*data-x7-related-link[^>]*data-x7-shared-tags=3[^>]*data-x7-same-section=true/.test(hook)) process.exit(1);
}
NODE

  categories_index="$output_dir/categories/index.html"
  test -f "$categories_index"
  node - "$output_dir" "$categories_index" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const [root, indexPath] = process.argv.slice(2);
const index = fs.readFileSync(indexPath, "utf8");
const main = index.slice(index.indexOf("<main"), index.indexOf("</main>"));
const termLinks = [...main.matchAll(/href=(\/categories\/[^\s>]+\/index\.html)/g)].map(match => match[1]);
if (!termLinks.length || !main.includes("children-type-group")) process.exit(1);

const termHref = termLinks[0];
const termPath = path.join(root, decodeURI(termHref.slice(1)));
const term = fs.readFileSync(termPath, "utf8");
const termMain = term.slice(term.indexOf("<main"), term.indexOf("</main>"));
const pageLinks = [...termMain.matchAll(/href=(\/[^\s>]+\/index\.html)/g)]
  .map(match => match[1])
  .filter(href => !href.startsWith("/categories/"));
if (!pageLinks.length || !termMain.includes("children-type-group") || !termMain.includes("<li><p><a")) process.exit(1);
if ([...termMain.matchAll(/href=\/categories\//g)].length) process.exit(1);
NODE

  node - "$source_dir/content" "$output_dir" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const [contentDir, outputDir] = process.argv.slice(2);
const topSections = fs.readdirSync(contentDir, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && fs.existsSync(path.join(contentDir, entry.name, "_index.md")))
  .map(entry => entry.name)
  .sort((a, b) => a.localeCompare(b, "zh-CN"));
if (!topSections.length) process.exit(1);

const readSection = section => {
  const file = path.join(outputDir, section, "index.html");
  if (!fs.existsSync(file)) process.exit(1);
  return fs.readFileSync(file, "utf8");
};

for (const section of topSections) {
  const html = readSection(section);
  if (!html.includes("data-x7-domain-landing")) process.exit(1);
  if ([...html.matchAll(/<h1\b/g)].length !== 1) process.exit(1);
  if (!html.includes(`KNOWLEDGE DOMAIN / ${section}`)) process.exit(1);
  if ([...html.matchAll(/\bdata-x7-search-open\b/g)].length < 2) process.exit(1);
}

const candidate = topSections
  .map(name => ({ name, html: readSection(name) }))
  .find(section => section.html.includes("data-x7-domain-child"));
if (!candidate) process.exit(1);

const childLinks = [...candidate.html.matchAll(/<a\b[^>]*data-x7-domain-child[^>]*href=([^\s>]+)/g)];
const childUrls = childLinks.map(([, href]) => href);
if (!childUrls.length || new Set(childUrls).size !== childUrls.length) process.exit(1);
if (childLinks.some(([tag]) => !/data-x7-article-count=\d+/.test(tag))) process.exit(1);

const latest = [...candidate.html.matchAll(/<a\b[^>]*data-x7-domain-update[^>]*href=([^\s>]+)[^>]*>[\s\S]*?<time\b[^>]*datetime=([^\s>]+)/g)]
  .map(([, href, datetime]) => ({ href, time: Date.parse(datetime) }));
if (!latest.length || latest.length > 8 || latest.some(item => Number.isNaN(item.time))) process.exit(1);
if (latest.some((item, index) => index && (item.time > latest[index - 1].time ||
    (item.time === latest[index - 1].time && item.href.localeCompare(latest[index - 1].href) < 0)))) process.exit(1);

const tags = [...candidate.html.matchAll(/<a\b[^>]*data-x7-domain-tag[^>]*href=(\/tags\/[^\s>]+)[^>]*data-x7-tag-count=(\d+)/g)];
if (tags.length > 12 || new Set(tags.map(([, href]) => href)).size !== tags.length) process.exit(1);
if (tags.some(([, , count]) => Number(count) < 1)) process.exit(1);

for (const taxonomy of ["tags", "categories"]) {
  const html = fs.readFileSync(path.join(outputDir, taxonomy, "index.html"), "utf8");
  if (html.includes("data-x7-domain-landing")) process.exit(1);
}
NODE
elif [[ "$contract_phase" != "baseline" ]]; then
  echo "Unknown X7_RENDER_CONTRACT_PHASE: $contract_phase" >&2
  exit 2
fi
