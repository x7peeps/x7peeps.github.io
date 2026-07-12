# Digital Nocturne Knowledge System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the X7PEEPS Hugo site as a GitHub Pages-compatible Digital Nocturne experience with a cinematic semantic homepage, domain landing pages, a high-density article cockpit, static command search, and tag-driven discovery.

**Architecture:** Keep Hugo/Relearn and the existing content tree as the source of truth. Add project-owned Hugo partials for semantic structure, focused CSS files for the new design system, and independent browser modules for search, reading navigation, and the progressive-enhancement constellation. Ship the static reading and discovery system before enabling Canvas effects.

**Tech Stack:** Hugo 0.161.1 extended, Hugo templates, semantic HTML, modular CSS, browser ES modules, Canvas 2D, Node.js built-in test runner, GitHub Actions, GitHub Pages.

**Design specification:** `docs/superpowers/specs/2026-07-12-digital-nocturne-knowledge-system-design.md`

---

## Delivery phases

1. **Static foundation and Knowledge Cockpit:** Tasks 1–4 produce a complete usable reading system without Canvas.
2. **Discovery system:** Tasks 5–7 add tags, related content, command search, and domain landing pages.
3. **Knowledge Constellation:** Tasks 8–9 add the cinematic homepage as progressive enhancement.
4. **Release gate:** Task 10 verifies responsive, accessibility, performance, URL integrity, and GitHub Pages deployment.

## File structure

### Create

- `hugo-src/layouts/partials/x7/article-shell.html` — article metadata, content slot, chapter rail, related navigation.
- `hugo-src/layouts/partials/x7/article-meta.html` — normalized date, reading time, difficulty, category, and tag markup.
- `hugo-src/layouts/partials/x7/chapter-radar.html` — server-rendered TOC and progress control.
- `hugo-src/layouts/partials/x7/tag-chips.html` — reusable taxonomy links with empty-state omission.
- `hugo-src/layouts/partials/x7/related-content.html` — deterministic related-by-tag article list.
- `hugo-src/layouts/partials/x7/domain-landing.html` — domain overview, child framework, featured/recent content, tags.
- `hugo-src/layouts/partials/x7/search-dialog.html` — accessible command-search dialog.
- `hugo-src/layouts/partials/x7/home-constellation.html` — semantic homepage foreground and domain links.
- `hugo-src/layouts/partials/x7/constellation-data.json` — build-time domain graph JSON.
- `hugo-src/layouts/_default/single.html` — project-owned article shell override.
- `hugo-src/layouts/_default/section.html` — project-owned domain landing override with safe fallback.
- `hugo-src/layouts/_default/terms.html` — tag index.
- `hugo-src/layouts/_default/taxonomy.html` — filtered tag results.
- `hugo-src/layouts/search.json` — static command-search index.
- `hugo-src/static/css/x7-tokens.css` — color, typography, spacing, depth, focus, and motion tokens.
- `hugo-src/static/css/x7-shell.css` — shared global shell, topbar, tree, and responsive rules.
- `hugo-src/static/css/x7-reading.css` — article, chapter radar, tags, code/table breakout, drawers.
- `hugo-src/static/css/x7-home.css` — homepage, domain map, featured work, static constellation.
- `hugo-src/static/js/x7/cockpit.js` — chapter scroll spy, progress, drawers, reading shortcuts.
- `hugo-src/static/js/x7/search-core.js` — pure normalization, indexing, scoring, and result functions.
- `hugo-src/static/js/x7/search-dialog.js` — dialog lifecycle, keyboard navigation, preview UI.
- `hugo-src/static/js/x7/constellation-core.js` — pure graph layout and quality-policy functions.
- `hugo-src/static/js/x7/constellation.js` — Canvas lifecycle and pointer interaction.
- `hugo-src/static/js/x7/bootstrap.js` — page-aware module initialization.
- `tests/search-core.test.mjs` — search ranking and filtering tests.
- `tests/constellation-core.test.mjs` — graph/quality policy tests.
- `tests/render-contracts.sh` — Hugo build and generated-HTML contract checks.
- `tests/check-links.mjs` — internal generated-link and asset validation.
- `package.json` — dependency-free test scripts.

### Modify

- `hugo-src/content/_index.md` — replace inline legacy hero/feed HTML with semantic home partial usage through layout.
- `hugo-src/layouts/home/article.html` — render the new homepage partial and remove legacy heatmap injection.
- `hugo-src/layouts/index.json` — retain feed compatibility or redirect it to the new search index contract.
- `hugo-src/layouts/partials/custom-footer.html` — load CSS and the module bootstrap once.
- `hugo-src/layouts/partials/menu.html` — add stable knowledge-tree hooks and filter controls without changing page hierarchy.
- `hugo-src/layouts/partials/content-footer.html` — move visible article metadata into the new article shell and retain required taxonomy output.
- `hugo-src/static/css/custom.css` — remove or neutralize legacy rules superseded by focused styles.
- `hugo-src/static/js/custom.js` — remove features migrated to modules; retain only unrelated legacy behavior.
- `hugo-src/hugo.toml` — enable tags/search outputs and add design/performance parameters.
- `.github/workflows/hugo-pages.yml` — pin Hugo and artifact actions; run tests before upload.

---

### Task 1: Establish build and render-contract tests

**Files:**
- Create: `package.json`
- Create: `tests/render-contracts.sh`
- Create: `tests/check-links.mjs`
- Modify: `.github/workflows/hugo-pages.yml`

- [ ] **Step 1: Add the failing render-contract test**

Create `tests/render-contracts.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
rm -rf hugo-src/public-test
hugo --source hugo-src --destination public-test --minify

test -f hugo-src/public-test/index.html
rg -q 'data-x7-home' hugo-src/public-test/index.html
ARTICLE="$(find hugo-src/public-test -mindepth 2 -name index.html ! -path '*/tags/*' | head -n 1)"
test -n "$ARTICLE"
rg -q 'data-x7-article-shell' "$ARTICLE"
rg -q 'data-x7-chapter-radar' "$ARTICLE"
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run: `bash tests/render-contracts.sh`

Expected: Hugo build succeeds, then `rg` fails because `data-x7-home` and cockpit hooks do not exist.

- [ ] **Step 3: Add dependency-free test scripts and link checker**

Create `package.json`:

```json
{
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/*.test.mjs",
    "test:render": "bash tests/render-contracts.sh",
    "test:links": "node tests/check-links.mjs hugo-src/public-test"
  }
}
```

Create `tests/check-links.mjs`:

```js
import { readFile, readdir, stat } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";

const root = resolve(process.argv[2] || "hugo-src/public-test");
const files = [];
async function walk(dir) {
  for (const name of await readdir(dir)) {
    const path = join(dir, name);
    (await stat(path)).isDirectory() ? await walk(path) : files.push(path);
  }
}
await walk(root);
const htmlFiles = files.filter((file) => file.endsWith(".html"));
const broken = [];
for (const file of htmlFiles) {
  const html = await readFile(file, "utf8");
  for (const match of html.matchAll(/(?:href|src)=["']([^"'#?]+)["']/g)) {
    const url = match[1];
    if (/^(?:https?:|mailto:|tel:|data:|javascript:)/.test(url)) continue;
    const target = url.startsWith("/") ? join(root, decodeURI(url)) : resolve(dirname(file), decodeURI(url));
    const candidates = [target, join(target, "index.html"), `${target}.html`];
    if (!(await Promise.all(candidates.map(async (path) => { try { await stat(path); return true; } catch { return false; } }))).some(Boolean)) {
      broken.push(`${file.replace(root, "")}: ${url}`);
    }
  }
}
if (broken.length) {
  console.error(broken.slice(0, 50).join("\n"));
  process.exit(1);
}
console.log(`checked ${htmlFiles.length} HTML files`);
```

- [ ] **Step 4: Pin CI tools and run tests before deployment**

In `.github/workflows/hugo-pages.yml`, replace the Hugo setup and artifact action and insert validation:

```yaml
      - uses: peaceiris/actions-hugo@v3
        with:
          hugo-version: "0.161.1"
          extended: true

      - name: Test templates and scripts
        run: |
          npm test
          bash tests/render-contracts.sh
          npm run test:links

      - uses: actions/upload-pages-artifact@v4
        with:
          path: hugo-src/public
```

- [ ] **Step 5: Commit the test foundation**

```bash
git add package.json tests/render-contracts.sh tests/check-links.mjs .github/workflows/hugo-pages.yml
git commit -m "test: add Hugo render and link contracts"
```

### Task 2: Add design tokens and modular asset loading

**Files:**
- Create: `hugo-src/static/css/x7-tokens.css`
- Create: `hugo-src/static/css/x7-shell.css`
- Create: `hugo-src/static/js/x7/bootstrap.js`
- Modify: `hugo-src/layouts/partials/custom-footer.html`
- Modify: `hugo-src/hugo.toml`

- [ ] **Step 1: Add token and shell files**

Create `hugo-src/static/css/x7-tokens.css` with concrete tokens:

```css
:root {
  --x7-void: #020305;
  --x7-carbon: #070a0f;
  --x7-panel: #0b1017;
  --x7-steel: #172332;
  --x7-ion: #75c7ff;
  --x7-paper: #eef5fb;
  --x7-muted: #98a6b7;
  --x7-warning: #ffb86b;
  --x7-border: rgb(117 199 255 / 14%);
  --x7-focus: 0 0 0 3px rgb(117 199 255 / 35%);
  --x7-prose: 76ch;
  --x7-rail-left: 17rem;
  --x7-rail-right: 14rem;
  --x7-ease: cubic-bezier(.22, 1, .36, 1);
}

:focus-visible { outline: 2px solid var(--x7-ion); outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
}
```

Create `hugo-src/static/css/x7-shell.css`:

```css
html { color-scheme: dark; background: var(--x7-void); }
body { background: var(--x7-void); color: var(--x7-paper); }
.x7-system-label { font: 600 .72rem/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .12em; text-transform: uppercase; color: var(--x7-muted); }
.x7-visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
```

- [ ] **Step 2: Add page-aware bootstrap**

Create `hugo-src/static/js/x7/bootstrap.js`:

```js
const jobs = [];
if (document.querySelector("[data-x7-article-shell]")) jobs.push(import("./cockpit.js").then((m) => m.initCockpit()));
if (document.querySelector("[data-x7-search-dialog]")) jobs.push(import("./search-dialog.js").then((m) => m.initSearchDialog()));
if (document.querySelector("[data-x7-constellation]")) jobs.push(import("./constellation.js").then((m) => m.initConstellation()));
Promise.allSettled(jobs).then((results) => {
  for (const result of results) if (result.status === "rejected") console.warn("X7 enhancement unavailable", result.reason);
});
```

- [ ] **Step 3: Load focused styles and bootstrap once**

Replace `hugo-src/layouts/partials/custom-footer.html` with:

```html
<link rel="stylesheet" href="{{ "css/x7-tokens.css" | relURL }}">
<link rel="stylesheet" href="{{ "css/x7-shell.css" | relURL }}">
<link rel="stylesheet" href="{{ "css/x7-reading.css" | relURL }}">
<link rel="stylesheet" href="{{ "css/x7-home.css" | relURL }}">
<script src="{{ "js/custom.js" | relURL }}" defer></script>
<script type="module" src="{{ "js/x7/bootstrap.js" | relURL }}"></script>
```

Create empty `x7-reading.css` and `x7-home.css` with a file header so URLs resolve during incremental tasks.

- [ ] **Step 4: Add explicit design parameters**

Append to `hugo-src/hugo.toml`:

```toml
[params.x7]
constellationDesktopParticles = 120
constellationMobileParticles = 40
enableConstellation = true
enableReadingDensity = true
```

- [ ] **Step 5: Build and commit**

Run: `hugo --source hugo-src --destination public-test --minify`

Expected: build succeeds and generated pages reference all four new assets.

```bash
git add hugo-src/static/css/x7-*.css hugo-src/static/js/x7/bootstrap.js hugo-src/layouts/partials/custom-footer.html hugo-src/hugo.toml
git commit -m "feat: add Digital Nocturne asset foundation"
```

### Task 3: Render the static Knowledge Cockpit

**Files:**
- Create: `hugo-src/layouts/_default/single.html`
- Create: `hugo-src/layouts/partials/x7/article-shell.html`
- Create: `hugo-src/layouts/partials/x7/article-meta.html`
- Create: `hugo-src/layouts/partials/x7/chapter-radar.html`
- Create: `hugo-src/layouts/partials/x7/tag-chips.html`
- Modify: `hugo-src/layouts/partials/menu.html`
- Modify: `hugo-src/static/css/x7-reading.css`

- [ ] **Step 1: Extend the failing render contract**

Add to `tests/render-contracts.sh` after `ARTICLE=...`:

```bash
rg -q 'data-x7-knowledge-tree' "$ARTICLE"
rg -q 'data-x7-article-content' "$ARTICLE"
rg -q 'data-x7-chapter-list' "$ARTICLE"
```

Run: `bash tests/render-contracts.sh`

Expected: FAIL on the first new hook.

- [ ] **Step 2: Add server-rendered metadata and tags**

Create `hugo-src/layouts/partials/x7/tag-chips.html`:

```go-html-template
{{- with .GetTerms "tags" -}}
<nav class="x7-tags" aria-label="文章标签">
  {{- range . -}}<a class="x7-tag" href="{{ .RelPermalink }}"># {{ .LinkTitle }}</a>{{- end -}}
</nav>
{{- end -}}
```

Create `hugo-src/layouts/partials/x7/article-meta.html`:

```go-html-template
<div class="x7-article-meta">
  <span>{{ .Section }}</span>
  <time datetime="{{ .Lastmod.Format "2006-01-02" }}">更新于 {{ .Lastmod.Format "2006-01-02" }}</time>
  <span>{{ .ReadingTime }} 分钟阅读</span>
  {{- with .Params.difficulty }}<span>{{ . }}</span>{{ end -}}
</div>
{{ partial "x7/tag-chips.html" . }}
```

- [ ] **Step 3: Add chapter radar and article shell**

Create `hugo-src/layouts/partials/x7/chapter-radar.html`:

```go-html-template
<aside class="x7-chapter-rail" data-x7-chapter-radar aria-label="文章章节">
  <div class="x7-reading-progress" aria-hidden="true"><span data-x7-progress-bar></span></div>
  <div class="x7-system-label"><span data-x7-progress-text>0%</span> · 章节导航</div>
  <div data-x7-chapter-list>{{ .TableOfContents }}</div>
</aside>
<button class="x7-chapter-trigger" type="button" data-x7-chapter-trigger aria-expanded="false">章节 <span data-x7-mobile-progress>0%</span></button>
```

Create `hugo-src/layouts/partials/x7/article-shell.html`:

```go-html-template
<article class="x7-article-shell" data-x7-article-shell>
  <header class="x7-article-header">
    <p class="x7-system-label">ARTICLE / {{ .Section }}</p>
    <h1>{{ .Title }}</h1>
    {{ partial "x7/article-meta.html" . }}
  </header>
  <div class="x7-reading-grid">
    <main class="x7-prose" data-x7-article-content>{{ .Content }}</main>
    {{ partial "x7/chapter-radar.html" . }}
  </div>
</article>
```

Create `hugo-src/layouts/_default/single.html` using Relearn's article wrapper while replacing its content body:

```go-html-template
<article>
  {{ partial "x7/article-shell.html" . }}
  <footer class="footline">{{ partial "content-footer.html" . }}</footer>
</article>
```

- [ ] **Step 4: Add stable knowledge-tree hooks**

In `hugo-src/layouts/partials/menu.html`, add `data-x7-knowledge-tree` to the main `R-sidebarmenu` container and add a filter before its `<ul>`:

```go-html-template
<label class="x7-tree-filter">
  <span class="x7-visually-hidden">筛选知识树</span>
  <input type="search" data-x7-tree-filter placeholder="筛选当前知识树…" autocomplete="off">
</label>
```

- [ ] **Step 5: Style the three-zone reading system**

Add to `hugo-src/static/css/x7-reading.css`:

```css
.x7-article-shell { max-width: 92rem; margin: 0 auto; padding: clamp(1.5rem, 4vw, 4rem); }
.x7-article-header { max-width: var(--x7-prose); margin-inline: auto; padding-bottom: 2rem; }
.x7-article-header h1 { font-size: clamp(2rem, 4vw, 3.6rem); line-height: 1.05; letter-spacing: -.045em; }
.x7-article-meta { display: flex; flex-wrap: wrap; gap: .6rem 1rem; color: var(--x7-muted); font-size: .82rem; }
.x7-tags { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: 1rem; }
.x7-tag { border: 1px solid var(--x7-border); border-radius: 999px; padding: .35rem .65rem; color: var(--x7-ion); font: 600 .72rem ui-monospace, monospace; }
.x7-reading-grid { display: grid; grid-template-columns: minmax(0, var(--x7-prose)) var(--x7-rail-right); justify-content: center; gap: clamp(2rem, 5vw, 5rem); }
.x7-prose { min-width: 0; font-size: 1.05rem; line-height: 1.9; }
.x7-prose :is(pre, table, figure) { max-width: min(100vw - 3rem, 68rem); overflow-x: auto; }
.x7-chapter-rail { position: sticky; top: 5rem; align-self: start; max-height: calc(100vh - 7rem); overflow: auto; }
.x7-reading-progress { height: 2px; background: var(--x7-steel); margin-bottom: 1rem; }
.x7-reading-progress span { display: block; width: 0; height: 100%; background: var(--x7-ion); }
.x7-chapter-trigger { display: none; }
@media (max-width: 68rem) {
  .x7-reading-grid { display: block; }
  .x7-chapter-rail { position: fixed; inset: 0 0 0 auto; width: min(86vw, 22rem); transform: translateX(100%); z-index: 50; background: var(--x7-panel); padding: 5rem 1.25rem 2rem; }
  .x7-chapter-rail[data-open="true"] { transform: translateX(0); }
  .x7-chapter-trigger { display: block; position: fixed; right: 1rem; bottom: 1rem; z-index: 51; }
}
```

- [ ] **Step 6: Run contracts and commit**

Run: `bash tests/render-contracts.sh`

Expected: article hooks pass; homepage hook remains failing until Task 8. Temporarily scope the home assertion with a clear `# activated in Task 8` comment rather than deleting it.

```bash
git add hugo-src/layouts/_default/single.html hugo-src/layouts/partials/x7 hugo-src/layouts/partials/menu.html hugo-src/static/css/x7-reading.css tests/render-contracts.sh
git commit -m "feat: render static Knowledge Cockpit"
```

### Task 4: Add cockpit behavior with tested pure helpers

**Files:**
- Create: `hugo-src/static/js/x7/cockpit.js`
- Create: `tests/cockpit-core.test.mjs`

- [ ] **Step 1: Write failing tests for progress and tree matching**

Create `tests/cockpit-core.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readingProgress, matchesTreeQuery } from "../hugo-src/static/js/x7/cockpit.js";

test("readingProgress clamps the scroll ratio", () => {
  assert.equal(readingProgress(50, 100, 20), 63);
  assert.equal(readingProgress(-1, 100, 20), 0);
  assert.equal(readingProgress(200, 100, 20), 100);
});

test("tree matching is case-insensitive and trims input", () => {
  assert.equal(matchesTreeQuery("  EDR ", "EDR 检测工程"), true);
  assert.equal(matchesTreeQuery("取证", "渗透测试"), false);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `node --test tests/cockpit-core.test.mjs`

Expected: FAIL because `cockpit.js` does not exist.

- [ ] **Step 3: Implement cockpit behavior**

Create `hugo-src/static/js/x7/cockpit.js`:

```js
export function readingProgress(scrollTop, scrollHeight, clientHeight) {
  const range = Math.max(1, scrollHeight - clientHeight);
  return Math.round(Math.min(1, Math.max(0, scrollTop / range)) * 100);
}

export function matchesTreeQuery(query, text) {
  return text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
}

export function initCockpit() {
  const root = document.querySelector("#R-body-inner");
  const rail = document.querySelector("[data-x7-chapter-radar]");
  const trigger = document.querySelector("[data-x7-chapter-trigger]");
  const bar = document.querySelector("[data-x7-progress-bar]");
  const labels = document.querySelectorAll("[data-x7-progress-text], [data-x7-mobile-progress]");
  const headings = [...document.querySelectorAll("[data-x7-article-content] h2[id], [data-x7-article-content] h3[id]")];
  const links = [...document.querySelectorAll("[data-x7-chapter-list] a[href^='#']")];

  const update = () => {
    const pct = readingProgress(root.scrollTop, root.scrollHeight, root.clientHeight);
    bar.style.width = `${pct}%`;
    labels.forEach((label) => { label.textContent = `${pct}%`; });
    const active = headings.filter((h) => h.getBoundingClientRect().top <= 140).at(-1);
    links.forEach((link) => link.toggleAttribute("aria-current", active && link.hash === `#${encodeURIComponent(active.id)}`));
  };
  root.addEventListener("scroll", update, { passive: true });
  update();

  trigger?.addEventListener("click", () => {
    const open = rail.dataset.open !== "true";
    rail.dataset.open = String(open);
    trigger.setAttribute("aria-expanded", String(open));
  });

  document.querySelector("[data-x7-tree-filter]")?.addEventListener("input", (event) => {
    document.querySelectorAll("[data-x7-knowledge-tree] li").forEach((item) => {
      item.hidden = !matchesTreeQuery(event.target.value, item.textContent);
    });
  });
}
```

- [ ] **Step 4: Run tests and verify success**

Run: `npm test`

Expected: all cockpit helper tests PASS.

- [ ] **Step 5: Remove migrated inline TOC behavior from legacy JS and commit**

Delete the `Move TOC to active sidebar item` block from `hugo-src/static/js/custom.js`; keep sidebar-state behavior until its replacement is separately verified.

```bash
git add hugo-src/static/js/x7/cockpit.js hugo-src/static/js/custom.js tests/cockpit-core.test.mjs
git commit -m "feat: add cockpit navigation behavior"
```

### Task 5: Add standardized tags and related content

**Files:**
- Create: `hugo-src/layouts/partials/x7/related-content.html`
- Create: `hugo-src/layouts/_default/terms.html`
- Create: `hugo-src/layouts/_default/taxonomy.html`
- Modify: `hugo-src/layouts/partials/x7/article-shell.html`
- Modify: `hugo-src/hugo.toml`
- Modify: `tests/render-contracts.sh`

- [ ] **Step 1: Add failing taxonomy contracts**

Append to `tests/render-contracts.sh`:

```bash
test -f hugo-src/public-test/tags/index.html
rg -q 'data-x7-tag-index' hugo-src/public-test/tags/index.html
rg -q 'data-x7-related-content' "$ARTICLE"
```

Run: `bash tests/render-contracts.sh`

Expected: FAIL because tag outputs/related hooks are missing.

- [ ] **Step 2: Enable tag taxonomy explicitly**

Add to `hugo-src/hugo.toml`:

```toml
[taxonomies]
tag = "tags"
category = "categories"
```

- [ ] **Step 3: Add deterministic related content**

Create `hugo-src/layouts/partials/x7/related-content.html`:

```go-html-template
{{- $page := . -}}
{{- $related := site.RegularPages.RelatedIndices . "tags" | complement (slice .) | first 4 -}}
{{- with $related -}}
<aside class="x7-related" data-x7-related-content aria-labelledby="x7-related-title">
  <h2 id="x7-related-title">关联知识</h2>
  <ul>{{ range . }}<li><a href="{{ .RelPermalink }}">{{ .LinkTitle }}</a><span>{{ .Section }}</span></li>{{ end }}</ul>
</aside>
{{- else -}}
<aside class="x7-related" data-x7-related-content hidden></aside>
{{- end -}}
```

Add this partial after `.x7-reading-grid` in `article-shell.html`.

- [ ] **Step 4: Render tag index and tag result pages**

Create `hugo-src/layouts/_default/terms.html`:

```go-html-template
<section class="x7-taxonomy" data-x7-tag-index>
  <p class="x7-system-label">KNOWLEDGE INDEX / TAGS</p>
  <h1>{{ .Title }}</h1>
  <div class="x7-tag-cloud">{{ range .Data.Terms.ByCount }}<a class="x7-tag" href="{{ .Page.RelPermalink }}"># {{ .Page.LinkTitle }} <span>{{ .Count }}</span></a>{{ end }}</div>
</section>
```

Create `hugo-src/layouts/_default/taxonomy.html`:

```go-html-template
<section class="x7-taxonomy" data-x7-taxonomy-results>
  <p class="x7-system-label">TAG / {{ .Title }}</p>
  <h1># {{ .Title }}</h1>
  <div class="x7-taxonomy-list">{{ range .Pages.ByLastmod.Reverse }}<article><a href="{{ .RelPermalink }}">{{ .LinkTitle }}</a><span>{{ .Section }} · {{ .Lastmod.Format "2006-01-02" }}</span></article>{{ end }}</div>
</section>
```

- [ ] **Step 5: Build, verify, and commit**

Run: `bash tests/render-contracts.sh`

Expected: taxonomy and related-content hooks PASS; missing tags do not emit an empty `.x7-tags` navigation.

```bash
git add hugo-src/hugo.toml hugo-src/layouts/_default/terms.html hugo-src/layouts/_default/taxonomy.html hugo-src/layouts/partials/x7/related-content.html hugo-src/layouts/partials/x7/article-shell.html tests/render-contracts.sh
git commit -m "feat: add tag discovery and related knowledge"
```

### Task 6: Build static command search

**Files:**
- Create: `hugo-src/layouts/search.json`
- Create: `hugo-src/layouts/partials/x7/search-dialog.html`
- Create: `hugo-src/static/js/x7/search-core.js`
- Create: `hugo-src/static/js/x7/search-dialog.js`
- Create: `tests/search-core.test.mjs`
- Modify: `hugo-src/hugo.toml`
- Modify: `hugo-src/layouts/partials/menu.html`

- [ ] **Step 1: Write failing search tests**

Create `tests/search-core.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { searchDocuments } from "../hugo-src/static/js/x7/search-core.js";

const docs = [
  { title: "无文件恶意代码取证", section: "安全", tags: ["PowerShell", "内存取证"], summary: "fileless malware" },
  { title: "飞行控制系统原理", section: "无人机", tags: ["飞控"], summary: "姿态控制" }
];

test("exact title and tag matches rank above summaries", () => {
  assert.equal(searchDocuments(docs, "PowerShell")[0].title, "无文件恶意代码取证");
});

test("section filter narrows results", () => {
  assert.deepEqual(searchDocuments(docs, "系统", "无人机").map((d) => d.title), ["飞行控制系统原理"]);
});

test("blank query returns recent input order", () => {
  assert.deepEqual(searchDocuments(docs, "").map((d) => d.title), docs.map((d) => d.title));
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `node --test tests/search-core.test.mjs`

Expected: FAIL because `search-core.js` does not exist.

- [ ] **Step 3: Implement pure search scoring**

Create `hugo-src/static/js/x7/search-core.js`:

```js
const normalize = (value) => String(value || "").normalize("NFKC").toLocaleLowerCase();
export function searchDocuments(documents, query, section = "") {
  const q = normalize(query.trim());
  return documents
    .filter((doc) => !section || doc.section === section)
    .map((doc, index) => {
      const title = normalize(doc.title);
      const tags = normalize((doc.tags || []).join(" "));
      const summary = normalize(doc.summary);
      const score = !q ? 1000 - index : (title === q ? 100 : title.includes(q) ? 70 : tags.includes(q) ? 50 : summary.includes(q) ? 20 : 0);
      return { ...doc, score, index };
    })
    .filter((doc) => doc.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
}
```

- [ ] **Step 4: Generate the build-time index and dialog markup**

Add `search` to home outputs in `hugo.toml`:

```toml
[outputFormats.Search]
mediaType = "application/json"
baseName = "search"
isPlainText = true
notAlternative = true

[outputs]
home = ["html", "json", "Search"]
```

Create `hugo-src/layouts/search.json`:

```go-html-template
{{- $items := slice -}}{{- range where site.RegularPages "Type" "ne" "home" -}}{{- $items = $items | append (dict "title" .Title "url" .RelPermalink "section" .Section "summary" (.Plain | truncate 180) "tags" (.Params.tags | default slice) "updated" (.Lastmod.Format "2006-01-02")) -}}{{- end -}}{{ $items | jsonify }}
```

Create `hugo-src/layouts/partials/x7/search-dialog.html`:

```html
<button type="button" data-x7-search-open aria-keyshortcuts="Control+K Meta+K">搜索 <kbd>⌘K</kbd></button>
<dialog class="x7-search" data-x7-search-dialog aria-labelledby="x7-search-title">
  <h2 id="x7-search-title" class="x7-visually-hidden">搜索知识库</h2>
  <input type="search" data-x7-search-input placeholder="搜索标题、领域或标签…" autocomplete="off">
  <p data-x7-search-status aria-live="polite"></p>
  <ol data-x7-search-results></ol>
  <button type="button" data-x7-search-close>关闭</button>
</dialog>
```

Render the partial once in `menu.html` after the header wrapper.

- [ ] **Step 5: Implement accessible dialog behavior**

Create `hugo-src/static/js/x7/search-dialog.js`:

```js
import { searchDocuments } from "./search-core.js";
export async function initSearchDialog() {
  const dialog = document.querySelector("[data-x7-search-dialog]");
  if (!dialog) return;
  const input = dialog.querySelector("[data-x7-search-input]");
  const results = dialog.querySelector("[data-x7-search-results]");
  const status = dialog.querySelector("[data-x7-search-status]");
  let documents = [];
  try {
    const response = await fetch("/search.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    documents = await response.json();
  } catch {
    status.textContent = "搜索暂时不可用，请使用左侧知识树浏览。";
  }
  const render = () => {
    const matches = searchDocuments(documents, input.value).slice(0, 12);
    results.replaceChildren(...matches.map((doc) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = doc.url; a.textContent = `${doc.title} · ${doc.section}`;
      li.append(a); return li;
    }));
    status.textContent = `找到 ${matches.length} 项`;
  };
  const open = () => { dialog.showModal(); input.focus(); render(); };
  document.querySelectorAll("[data-x7-search-open]").forEach((button) => button.addEventListener("click", open));
  dialog.querySelector("[data-x7-search-close]").addEventListener("click", () => dialog.close());
  input.addEventListener("input", render);
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") { event.preventDefault(); open(); }
  });
}
```

- [ ] **Step 6: Test, build, and commit**

Run: `npm test && hugo --source hugo-src --destination public-test --minify`

Expected: search tests PASS and `hugo-src/public-test/search.json` parses as JSON.

```bash
git add hugo-src/layouts/search.json hugo-src/layouts/partials/x7/search-dialog.html hugo-src/static/js/x7/search-*.js tests/search-core.test.mjs hugo-src/hugo.toml hugo-src/layouts/partials/menu.html
git commit -m "feat: add static command search"
```

### Task 7: Add domain landing pages

**Files:**
- Create: `hugo-src/layouts/_default/section.html`
- Create: `hugo-src/layouts/partials/x7/domain-landing.html`
- Modify: `hugo-src/static/css/x7-shell.css`
- Modify: `tests/render-contracts.sh`

- [ ] **Step 1: Add failing section contract**

Append to `tests/render-contracts.sh`:

```bash
SECTION="$(find hugo-src/public-test -mindepth 2 -maxdepth 2 -name index.html ! -path '*/tags/*' | head -n 1)"
test -n "$SECTION"
rg -q 'data-x7-domain-landing' "$SECTION"
```

Run: `bash tests/render-contracts.sh`

Expected: FAIL because section pages do not have the new hook.

- [ ] **Step 2: Render domain orientation content**

Create `hugo-src/layouts/partials/x7/domain-landing.html`:

```go-html-template
<section class="x7-domain" data-x7-domain-landing>
  <header><p class="x7-system-label">KNOWLEDGE DOMAIN / {{ .Title }}</p><h1>{{ .Title }}</h1>{{ with .Description }}<p>{{ . }}</p>{{ end }}</header>
  <nav class="x7-domain-map" aria-label="{{ .Title }} 知识框架">{{ range .Sections.ByWeight }}<a href="{{ .RelPermalink }}"><strong>{{ .LinkTitle }}</strong><span>{{ len .RegularPagesRecursive }} 篇</span></a>{{ end }}</nav>
  <section><h2>最近更新</h2><div class="x7-domain-latest">{{ range first 8 .RegularPagesRecursive.ByLastmod.Reverse }}<article><a href="{{ .RelPermalink }}">{{ .LinkTitle }}</a><time>{{ .Lastmod.Format "2006-01-02" }}</time>{{ partial "x7/tag-chips.html" . }}</article>{{ end }}</div></section>
</section>
```

Create `hugo-src/layouts/_default/section.html`:

```go-html-template
<article>{{ partial "x7/domain-landing.html" . }}</article>
```

- [ ] **Step 3: Add responsive domain-grid styles**

Add to `x7-shell.css`:

```css
.x7-domain { max-width: 86rem; margin: 0 auto; padding: clamp(2rem, 5vw, 5rem); }
.x7-domain-map { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr)); gap: 1rem; margin: 3rem 0; }
.x7-domain-map > a { min-height: 9rem; display: flex; flex-direction: column; justify-content: space-between; border: 1px solid var(--x7-border); background: var(--x7-carbon); padding: 1.25rem; }
.x7-domain-latest article { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: .75rem 1.5rem; padding: 1rem 0; border-top: 1px solid var(--x7-border); }
```

- [ ] **Step 4: Verify and commit**

Run: `bash tests/render-contracts.sh`

Expected: section contract PASS and existing nested URLs remain unchanged.

```bash
git add hugo-src/layouts/_default/section.html hugo-src/layouts/partials/x7/domain-landing.html hugo-src/static/css/x7-shell.css tests/render-contracts.sh
git commit -m "feat: add domain knowledge landing pages"
```

### Task 8: Replace the homepage with a semantic Knowledge Constellation

**Files:**
- Create: `hugo-src/layouts/partials/x7/home-constellation.html`
- Create: `hugo-src/layouts/partials/x7/constellation-data.json`
- Modify: `hugo-src/layouts/home/article.html`
- Modify: `hugo-src/content/_index.md`
- Modify: `hugo-src/static/css/x7-home.css`
- Modify: `tests/render-contracts.sh`

- [ ] **Step 1: Activate and run the failing homepage contract**

Remove the temporary comment/skip around `rg -q 'data-x7-home'` in `tests/render-contracts.sh` and add:

```bash
rg -q 'data-x7-domain-link' hugo-src/public-test/index.html
rg -q 'data-x7-constellation-fallback' hugo-src/public-test/index.html
```

Run: `bash tests/render-contracts.sh`

Expected: FAIL on `data-x7-home`.

- [ ] **Step 2: Render semantic homepage content and graph data**

Create `hugo-src/layouts/partials/x7/constellation-data.json`:

```go-html-template
{{- $nodes := slice -}}{{- range site.Home.Sections.ByWeight -}}{{- $nodes = $nodes | append (dict "id" .Path "title" .Title "url" .RelPermalink "count" (len .RegularPagesRecursive)) -}}{{- end -}}{{ $nodes | jsonify }}
```

Create `hugo-src/layouts/partials/x7/home-constellation.html`:

```go-html-template
<div class="x7-home" data-x7-home>
  <header class="x7-home-hero">
    <canvas class="x7-constellation-canvas" data-x7-constellation aria-hidden="true"></canvas>
    <div class="x7-constellation-fallback" data-x7-constellation-fallback aria-hidden="true"></div>
    <div class="x7-home-copy">
      <p class="x7-system-label">SECURITY RESEARCHER / BUILDER</p>
      <h1>复杂世界的<br>知识坐标</h1>
      <p>把复杂问题拆成可执行的流程，把经验沉淀成可以复用的武器库。</p>
      <div><a href="#knowledge-map">探索知识地图</a><a href="#featured-work">查看代表成果</a></div>
    </div>
    <nav id="knowledge-map" class="x7-domain-links" aria-label="知识领域">
      {{ range site.Home.Sections.ByWeight }}<a data-x7-domain-link data-node-id="{{ .Path }}" href="{{ .RelPermalink }}"><strong>{{ .LinkTitle }}</strong><span>{{ len .RegularPagesRecursive }} 篇</span></a>{{ end }}
    </nav>
    <script type="application/json" data-x7-constellation-data>{{ partial "x7/constellation-data.json" . }}</script>
  </header>
  <section id="featured-work" class="x7-featured"><h2>代表成果</h2>{{ range first 4 (where site.RegularPages "Params.featured" true) }}<article><a href="{{ .RelPermalink }}">{{ .LinkTitle }}</a><span>{{ .Section }}</span></article>{{ else }}{{ range first 4 site.RegularPages.ByLastmod.Reverse }}<article><a href="{{ .RelPermalink }}">{{ .LinkTitle }}</a><span>{{ .Section }}</span></article>{{ end }}{{ end }}</section>
</div>
```

- [ ] **Step 3: Use the new homepage partial and remove inline content duplication**

Replace the custom article body in `hugo-src/layouts/home/article.html` with:

```go-html-template
<article class="home">{{ partial "x7/home-constellation.html" . }}</article>
```

Reduce `hugo-src/content/_index.md` to front matter only; preserve title and description.

- [ ] **Step 4: Add static premium homepage styles**

Add to `x7-home.css`:

```css
.x7-home { background: var(--x7-void); }
.x7-home-hero { position: relative; min-height: min(58rem, calc(100vh - 3rem)); display: grid; grid-template-columns: minmax(18rem, .9fr) minmax(22rem, 1.1fr); align-items: center; gap: 3rem; overflow: hidden; padding: clamp(2rem, 7vw, 7rem); }
.x7-home-hero::after { content: ""; position: absolute; inset: 0; pointer-events: none; background-image: linear-gradient(rgb(255 255 255 / 3%) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 3%) 1px, transparent 1px); background-size: 4rem 4rem; mask-image: linear-gradient(to bottom, #000, transparent 85%); }
.x7-constellation-canvas, .x7-constellation-fallback { position: absolute; inset: 0; width: 100%; height: 100%; }
.x7-constellation-fallback { background: radial-gradient(circle at 68% 38%, rgb(72 145 255 / 18%), transparent 33%), radial-gradient(circle at 52% 52%, rgb(117 199 255 / 7%), transparent 55%); }
.x7-home-copy, .x7-domain-links { position: relative; z-index: 2; }
.x7-home-copy h1 { font-size: clamp(3.2rem, 8vw, 7.8rem); line-height: .88; letter-spacing: -.065em; }
.x7-domain-links { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: .75rem; }
.x7-domain-links a { min-height: 7.5rem; border: 1px solid var(--x7-border); background: rgb(7 10 15 / 78%); padding: 1rem; display: flex; flex-direction: column; justify-content: space-between; }
@media (max-width: 52rem) { .x7-home-hero { grid-template-columns: 1fr; } .x7-domain-links { grid-template-columns: 1fr 1fr; } }
```

- [ ] **Step 5: Verify static fallback and commit**

Run: `bash tests/render-contracts.sh`

Expected: homepage hooks PASS before any Canvas implementation exists; all domain links are real anchors.

```bash
git add hugo-src/layouts/home/article.html hugo-src/layouts/partials/x7/home-constellation.html hugo-src/layouts/partials/x7/constellation-data.json hugo-src/content/_index.md hugo-src/static/css/x7-home.css tests/render-contracts.sh
git commit -m "feat: add semantic Knowledge Constellation homepage"
```

### Task 9: Add progressive Canvas constellation and quality policy

**Files:**
- Create: `hugo-src/static/js/x7/constellation-core.js`
- Create: `hugo-src/static/js/x7/constellation.js`
- Create: `tests/constellation-core.test.mjs`

- [ ] **Step 1: Write failing quality-policy tests**

Create `tests/constellation-core.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { qualityFor, placeNodes } from "../hugo-src/static/js/x7/constellation-core.js";

test("reduced motion disables animation", () => {
  assert.deepEqual(qualityFor({ width: 1200, reducedMotion: true, deviceMemory: 8 }), { animated: false, particles: 0, blur: 0 });
});
test("mobile receives a bounded particle budget", () => {
  assert.equal(qualityFor({ width: 390, reducedMotion: false, deviceMemory: 4 }).particles, 40);
});
test("node layout is deterministic", () => {
  assert.deepEqual(placeNodes([{ id: "a" }, { id: "b" }], 100, 100), [{ id: "a", x: 70, y: 50 }, { id: "b", x: 30, y: 50 }]);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `node --test tests/constellation-core.test.mjs`

Expected: FAIL because `constellation-core.js` does not exist.

- [ ] **Step 3: Implement deterministic layout and budgets**

Create `hugo-src/static/js/x7/constellation-core.js`:

```js
export function qualityFor({ width, reducedMotion, deviceMemory = 4 }) {
  if (reducedMotion) return { animated: false, particles: 0, blur: 0 };
  if (width < 640 || deviceMemory <= 2) return { animated: true, particles: 40, blur: 2 };
  return { animated: true, particles: 120, blur: 6 };
}
export function placeNodes(nodes, width, height) {
  return nodes.map((node, index) => {
    const angle = (Math.PI * 2 * index) / nodes.length;
    return { ...node, x: Math.round(width / 2 + Math.cos(angle) * width * .2), y: Math.round(height / 2 + Math.sin(angle) * height * .2) };
  });
}
```

- [ ] **Step 4: Implement Canvas lifecycle without owning interactions**

Create `hugo-src/static/js/x7/constellation.js`:

```js
import { qualityFor, placeNodes } from "./constellation-core.js";
export function initConstellation() {
  const canvas = document.querySelector("[data-x7-constellation]");
  const data = document.querySelector("[data-x7-constellation-data]");
  if (!canvas || !data) return;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const quality = qualityFor({ width: innerWidth, reducedMotion, deviceMemory: navigator.deviceMemory });
  if (!quality.animated) { canvas.hidden = true; return; }
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) { canvas.hidden = true; return; }
  const nodes = JSON.parse(data.textContent);
  let frame = 0;
  let requestId = 0;
  let running = false;
  const draw = () => {
    if (!running) return;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== Math.round(rect.width * ratio)) { canvas.width = Math.round(rect.width * ratio); canvas.height = Math.round(rect.height * ratio); }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);
    const placed = placeNodes(nodes, rect.width, rect.height);
    context.strokeStyle = "rgba(117,199,255,.15)";
    context.fillStyle = "rgba(220,244,255,.9)";
    placed.forEach((node, index) => { const next = placed[(index + 1) % placed.length]; context.beginPath(); context.moveTo(node.x, node.y); context.lineTo(next.x, next.y); context.stroke(); context.beginPath(); context.arc(node.x, node.y, 2.5 + Math.sin(frame / 80 + index), 0, Math.PI * 2); context.fill(); });
    frame += 1;
    requestId = requestAnimationFrame(draw);
  };
  const stop = () => { running = false; cancelAnimationFrame(requestId); requestId = 0; };
  const start = () => { if (running) return; running = true; canvas.style.visibility = "visible"; draw(); };
  const visibility = () => { if (document.hidden) { canvas.style.visibility = "hidden"; stop(); } else start(); };
  document.addEventListener("visibilitychange", visibility);
  start();
}
```

- [ ] **Step 5: Run unit and visual fallback checks**

Run: `npm test && bash tests/render-contracts.sh`

Expected: all tests PASS. With reduced motion emulation, Canvas is hidden and semantic domain links remain visible.

- [ ] **Step 6: Commit the enhancement**

```bash
git add hugo-src/static/js/x7/constellation-core.js hugo-src/static/js/x7/constellation.js tests/constellation-core.test.mjs
git commit -m "feat: add adaptive constellation enhancement"
```

### Task 10: Release gate, responsive QA, and GitHub Pages verification

**Files:**
- Modify: `tests/render-contracts.sh`
- Modify: `tests/check-links.mjs`
- Modify: `.github/workflows/hugo-pages.yml`
- Modify: `hugo-src/static/css/x7-shell.css`
- Modify: `hugo-src/static/css/x7-reading.css`
- Modify: `hugo-src/static/css/x7-home.css`
- Modify: `hugo-src/static/js/custom.js`

- [ ] **Step 1: Add final generated-output assertions**

Append to `tests/render-contracts.sh`:

```bash
test -f hugo-src/public-test/search.json
node -e 'JSON.parse(require("node:fs").readFileSync("hugo-src/public-test/search.json", "utf8"))'
rg -q 'x7-tokens.css' hugo-src/public-test/index.html
rg -q 'type=module[^>]+js/x7/bootstrap.js|js/x7/bootstrap.js[^>]+type=module' hugo-src/public-test/index.html
if rg -n 'href=""|src=""' hugo-src/public-test --glob '*.html'; then exit 1; fi
```

- [ ] **Step 2: Run the full automated gate**

Run:

```bash
npm test
bash tests/render-contracts.sh
npm run test:links
```

Expected: all unit tests pass; Hugo builds; render contracts pass; no broken internal links or empty assets are reported.

- [ ] **Step 3: Run local browser QA at representative viewports**

Serve: `python3 -m http.server 4173 --directory hugo-src/public-test`

Check these routes at 1440×900, 1024×768, and 390×844:

```text
/
/安全/
/tags/
one ordinary article
one article with 15+ headings
one article with a wide table or code block
```

For each route verify: no horizontal page overflow, visible focus, drawers close with Escape, search works by click and `Cmd/Ctrl+K`, current chapter updates, tags are links, and reduced motion keeps all content visible.

- [ ] **Step 4: Remove superseded legacy rules only after comparison**

Use `rg` to locate `.x7-home-*`, `.x7-feed-*`, heatmap, inline TOC, spotlight, and duplicate taxonomy rules in `custom.css`/`custom.js`. Delete only selectors and blocks whose generated DOM no longer exists. Re-run the full gate after every deleted group.

- [ ] **Step 5: Measure asset and page budgets**

Run:

```bash
find hugo-src/public-test/css hugo-src/public-test/js -type f -print0 | xargs -0 gzip -c | wc -c
du -sh hugo-src/public-test
```

Expected: new homepage animation modules are approximately 120 KB gzip or less; total published site remains comfortably below GitHub Pages' 1 GB limit. Record actual values in the commit body.

- [ ] **Step 6: Verify deployment workflow without publishing**

Run: `git diff --check && git status --short`

Inspect `.github/workflows/hugo-pages.yml` and confirm build order is checkout → Go/Hugo setup → tests → production build → Pages artifact → deploy, with `hugo-version: "0.161.1"` and `upload-pages-artifact@v4`.

- [ ] **Step 7: Commit the release gate**

```bash
git add tests .github/workflows/hugo-pages.yml hugo-src/static/css/x7-*.css hugo-src/static/js/custom.js
git commit -m "chore: gate Digital Nocturne release quality"
```

- [ ] **Step 8: Final verification before integration**

Run:

```bash
npm test && bash tests/render-contracts.sh && npm run test:links && git diff --check
```

Expected: exit code 0 for every command. Do not push or deploy until the user approves the verified local result.

---

## Implementation notes

- Preserve unrelated dirty worktree changes. Stage only files named by the current task.
- Use `superpowers:test-driven-development` for each feature task and `superpowers:verification-before-completion` before claiming a phase complete.
- Use project-owned overrides instead of editing the Go module cache or theme source.
- If Relearn's actual `_default/single.html` wrapper requires additional theme partials, copy the complete upstream wrapper into the project override and replace only the article-content call; verify the generated DOM contract before continuing.
- Treat the static semantic homepage and cockpit as the product. Canvas, preview, and transition features are enhancements that must fail closed without hiding content.
