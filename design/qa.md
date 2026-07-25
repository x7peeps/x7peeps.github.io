# X7PEEPS 首页全屏 3D 滚动场景 — design QA

prototype: Hugo source and rendered contracts for the homepage scene
source: `docs/superpowers/specs/2026-07-24-x7-fullscreen-3d-scroll-scene-design.md`

## Browser QA

- PASS — desktop `p=0`: the avatar is prominent and centered for the opening.
- PASS — desktop `p=0.220` / `scrollTop=664`: the avatar moves clearly right to a position above and beside “最近更新” without obscuring its heading.
- PASS — desktop `p≈0.298`: the avatar continues rightward and fades while foreground content remains readable.
- PASS — desktop `p≈0.524`: the avatar is only a weak silhouette on the right.
- PASS — reversing from `p≈0.524` to `p≈0.220` restores the same composition continuously.
- PASS — the checked desktop sequence retains exactly one scene and one WebGL canvas, with no horizontal overflow, warnings, or errors.
- PASS — mobile `390×844` uses the particle path with zero WebGL canvases, full-screen coverage, 365 valid heatmap dates, 18 recent updates, and no horizontal overflow.
- PASS — reduced-motion desktop uses `mode=static` with the dedicated `p=0.34` frame, hidden particles, one WebGL canvas, and immediate completion. The identifiable avatar sits behind and to the right of the heading without blocking the subtitle or heatmap; there is no horizontal overflow, continuous RAF, or browser error.
- PASS — BFCache navigation across homepage → article → browser Back restores progress, scroll position, one running scene, and one WebGL canvas without warnings or errors.

Horizontal camera follow is `0.08`, while `modelX` advances through `1.7`, `2.05`, `2.3`, and `2.5`. The pure composition contract measures normalized horizontal offset `0` at `p=0`, approximately `0.307` at `p=0.22`, and approximately `0.337` at `p=0.52`.

The five keyframes remain at `0`, `0.22`, `0.52`, `0.82`, and `1`. Existing smooth interpolation and reversible full-page scroll mapping are unchanged. Automated contracts now enforce the opening prominence, early right/back retreat, readable-content thresholds, and final silhouette opacity.

## Reading and knowledge usability

- VERIFIED BY SOURCE AND RENDER CONTRACT: homepage knowledge structure, heatmap, recent-update ordering, article links, and tags are unchanged.
- PASS — the corrected composition gives the avatar a measurable rightward screen-space retreat while retaining the scale and opacity reductions needed for recent updates and continuous reading.
- Reading clarity remains the priority: foreground knowledge content must stay readable, clickable, and quickly scannable over the persistent scene.

## Known caveats

- Automated and browser checks do not establish full WCAG conformance; a manual screen-reader pass remains recommended.
- The desktop GLB is approximately 29 MB. Compression or a lighter/WebM alternative remains a known production-performance follow-up; mobile avoids loading the GLB.

## Verdict

READY — desktop composition and readability, reversible scrolling, mobile fallback, reduced-motion behavior, and BFCache restoration have passed browser QA. The camera-follow correction is protected by pure composition and runtime contracts; the screen-reader and asset-size caveats remain documented follow-ups.
