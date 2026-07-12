# Digital Nocturne release verification — 2026-07-12

## Automated gate

- `node --check hugo-src/static/js/custom.js`: exit 0.
- `npm test`: exit 0; 47 tests passed, 0 failed.
- `npm run test:render`: exit 0; root and `/docs/` subpath contracts passed. The root build produced 4,595 pages, 18 paginator pages, 999 non-page files, and 51 static files with Hugo 0.161.1.
- `npm run test:links`: exit 0. The checker reported the existing 89 entries in `tests/link-baseline.txt` and no `NEW:` or `STALE:` lines. New broken links fail because `assessBaseline` rejects any current entry not in that checked-in baseline; baseline drift in either direction also fails.
- `hugo --minify --source hugo-src --destination public-release`: exit 0; 4,595 pages, 18 paginator pages, 999 non-page files, and 51 static files in 28,469 ms.

The production build emitted only known upstream/environment warnings: Relearn module GitInfo mapping in the worktree and Hugo deprecations for `LanguageCode`, `LanguageDirection`, `.Site.Sites`/`.Page.Sites`, and `.Site.Languages`. There were no X7 warnings or errors.

Generated contracts parse `search.json`; reject missing/duplicate X7 CSS and module assets, empty `href`/`src`, legacy feed/heatmap hooks, article constellation hooks, malformed search ownership, duplicate H1/IDs, empty related headings, and broken root/subpath X7 URLs. They exercise the homepage, every generated domain landing, article fixtures, tags/categories, search dialog/listbox ownership, labeled controls, an initially inert chapter drawer, and reduced-motion JS behavior. All four X7 stylesheets contain `prefers-reduced-motion` rules, while unit tests cover reduced-motion animation disabling and lifecycle restoration.

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

The constellation runtime is 2,497 gzip bytes, below the 120 KB gate. The complete generated site is 1,661,841,408 bytes (`du`: 1.5G) across 5,694 files. This exceeds the implementation plan's desired 1 GB comfort threshold and remains a deployment-size risk; this release-gate task intentionally does not alter legacy content or large files.

## Manual QA handoff

Browser QA was not claimed here. The measured `hugo-src/public-release` output was removed because it is generated and must not be committed. Rebuild it with the production command above, then serve it with `python3 -m http.server 4173 --directory hugo-src/public-release`. Representative routes are:

- `http://localhost:4173/`
- `http://localhost:4173/安全/`
- `http://localhost:4173/tags/`
- `http://localhost:4173/安全/安全基础/密码学基础/1-散列与认证/单向散列与HMAC机制底层解剖/`
