# Digital Nocturne release verification — 2026-07-12

## Automated gate

- `node --check hugo-src/static/js/custom.js`: exit 0.
- `npm run verify`: exit 0. Its unit phase passed 47 tests with 0 failures; root and `/docs/` render contracts passed; the 89-entry legacy link baseline had no `NEW:` or `STALE:` delta; the clean production build and `git diff --check` passed.
- The clean production build produced 4,595 pages, 18 paginator pages, 999 non-page files, and 51 static files with Hugo 0.161.1 in 19,429 ms.

The production build emitted only known upstream/environment warnings: Relearn module GitInfo mapping in the worktree and Hugo deprecations for `LanguageCode`, `LanguageDirection`, `.Site.Sites`/`.Page.Sites`, and `.Site.Languages`. There were no X7 warnings or errors.

Generated contracts parse `search.json`; reject missing/duplicate X7 CSS and module assets, empty `href`/`src`, legacy feed/heatmap hooks, article constellation hooks, malformed search ownership, duplicate H1/IDs, empty related headings, and broken root/subpath X7 URLs. They exercise the homepage, every generated domain landing, article fixtures, tags/categories, search dialog/listbox ownership, labeled controls, an initially inert chapter drawer, and reduced-motion JS behavior. All four X7 stylesheets contain `prefers-reduced-motion` rules, while unit tests cover reduced-motion animation disabling and lifecycle restoration.

Taxonomy and term pages now use a compact sidebar boundary. It preserves the Relearn aside/header, logo, global search, footer, top-level domain links, Tags/Categories links, accessible label, and current taxonomy state, but deliberately omits the recursive knowledge tree and its filter. Regular articles and sections retain the full `data-x7-knowledge-tree`. The representative minified tag term `tags/监控安全/index.html` is 11,960 bytes against the 120,000-byte contract.

The legacy global pointer spotlight and perspective grid were intentionally removed: Digital Nocturne supplies a scoped background and motion system, so keeping the global effects would duplicate rendering work and visual treatment.

## Asset and site measurements

Commands:

```sh
for f in hugo-src/public-release/css/x7-*.css hugo-src/public-release/js/x7/*.js; do printf '%s\t' "${f#hugo-src/public-release/}"; gzip -c "$f" | wc -c; done
find hugo-src/public-release/css hugo-src/public-release/js/x7 -type f \( -name 'x7-*.css' -o -name '*.js' \) -exec gzip -c {} \; | wc -c
du -sk hugo-src/public-release
find hugo-src/public-release -type f | wc -l
```

Results (gzip bytes):

| Asset | Bytes |
|---|---:|
| css/x7-home.css | 2,296 |
| css/x7-reading.css | 1,407 |
| css/x7-shell.css | 2,047 |
| css/x7-tokens.css | 399 |
| js/x7/bootstrap.js | 320 |
| js/x7/cockpit.js | 3,930 |
| js/x7/constellation-core.js | 1,910 |
| js/x7/constellation.js | 2,497 |
| js/x7/search-core.js | 1,111 |
| js/x7/search-dialog.js | 2,596 |
| **All new X7 CSS/JS** | **18,513** |

The constellation runtime is 2,497 gzip bytes, below the 120 KB gate. The clean production artifact is **754,783,426 bytes across 5,694 files**, below the enforced 1,000,000,000-byte release ceiling. `tests/verify-release.sh` calculates exact file bytes in a temporary clean build and fails at or above that ceiling.

## Manual QA handoff

Browser QA remains pending and was not claimed here. Build a local artifact with `hugo --minify --source hugo-src --destination public-release`, then serve it with `python3 -m http.server 4173 --directory hugo-src/public-release`. Representative routes are:

- `http://localhost:4173/`
- `http://localhost:4173/安全/`
- `http://localhost:4173/tags/`
- `http://localhost:4173/安全/安全基础/密码学基础/1-散列与认证/单向散列与HMAC机制底层解剖/`
