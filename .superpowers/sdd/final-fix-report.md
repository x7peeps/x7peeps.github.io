## Final fix: homepage entry sidebar interactivity

- Root cause: `html.x7-home-entry-prime #R-sidebar` kept `pointer-events: none` for the entire prime state, so if the head script added the prime class but `home.js` failed before removing it, the sidebar could become visible after the CSS animation while remaining non-interactive.
- Fix: removed the persistent `pointer-events: none` from the prime sidebar rule in `hugo-src/static/css/x7-home.css`. Homepage JS trigger behavior was not changed.
- Regression contract: added a scoped `tests/render-contracts.sh` guard that parses the prime sidebar rule and fails if that rule contains `pointer-events: none`.

Verification:

- RED: `GOPROXY=https://goproxy.cn,direct GOSUMDB=sum.golang.google.cn bash tests/render-contracts.sh` exited 1 before the CSS fix with `Homepage entry contract failed: prime sidebar rule must remain interactive after CSS-only animation`.
- `git diff --check` exited 0.
- Targeted grep: `rg -n "html\\.x7-home-entry-prime #R-sidebar|pointer-events|Homepage entry contract|prime sidebar" hugo-src/static/css/x7-home.css tests/render-contracts.sh` confirmed the prime sidebar selector remains and no `pointer-events: none` appears inside that rule; remaining `pointer-events` matches are unrelated controls/canvases and the completion rule.
- GREEN: `GOPROXY=https://goproxy.cn,direct GOSUMDB=sum.golang.google.cn bash tests/render-contracts.sh` exited 0 after the CSS fix.
