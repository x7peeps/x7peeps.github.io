# X7PEEPS Fullscreen 3D Scroll Scene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hero-clipped, one-shot avatar entry with a persistent full-viewport 3D and particle scene whose camera visibly follows homepage scroll while preserving knowledge-tree and article readability.

**Architecture:** A new `home-scene.js` module owns one root-level fixed scene, one WebGL renderer, the particle layer, device-mode selection, camera keyframes, and lifecycle cleanup. `home.js` remains the homepage coordinator: it computes normalized whole-home scroll progress, dispatches progress events, renders heatmap data, and controls the separate first-entry content timeline.

**Tech Stack:** Hugo 0.161.1, Relearn theme, ES modules, Three.js 0.160.0, GLTFLoader, Canvas 2D, CSS fixed compositing layers, Node test runner, in-app browser verification.

---

## File Structure

- Create `hugo-src/static/js/x7/home-scene.js`: persistent fullscreen scene, pure keyframe helpers, capability selection, Three.js lifecycle and particle fallback.
- Modify `hugo-src/static/js/x7/home.js`: initialize the persistent scene independently from the entry timeline and emit whole-home scroll progress.
- Delete `hugo-src/static/js/x7/home-avatar-entry.js`: remove the obsolete one-shot renderer after the new scene is covered by tests.
- Modify `hugo-src/layouts/partials/x7/home-constellation.html`: move model configuration to the homepage root and remove the hero-contained scene markup.
- Modify `hugo-src/static/css/x7-home.css`: define viewport-wide scene layers, foreground stacking, sidebar readability, entry controls and responsive/reduced-motion behavior.
- Modify `tests/home-avatar-entry.test.mjs`: replace one-shot entry contracts with persistent fullscreen scene contracts.
- Create `tests/home-scroll-scene.test.mjs`: verify mode selection, keyframe interpolation, clamping and reversible scroll behavior.
- Modify `tests/render-contracts.sh`: assert rendered scene configuration and removal of the legacy hero-contained entry.

### Task 1: Reproduce the Current Error and Lock the Broken Behavior in Tests

**Files:**
- Modify: `tests/home-avatar-entry.test.mjs`
- Create: `tests/home-scroll-scene.test.mjs`

- [ ] **Step 1: Capture the current browser failure**

Open `http://127.0.0.1:4173/`, reload once, and record:

```text
document.querySelector("[data-x7-home-scene]")
document.querySelector(".x7-avatar-entry__stage canvas")
document.querySelector(".x7-home-particles").getBoundingClientRect()
document.documentElement.className
console errors and warnings
```

Expected current evidence: no root-level scene, the 3D stage is inside `.x7-home-hero`, the particle rectangle matches the right content region rather than the viewport, or the model loader reports the user-observed error.

- [ ] **Step 2: Replace the legacy markup contract with a failing root-scene contract**

Update `tests/home-avatar-entry.test.mjs` to require homepage-level model configuration and the new module:

```js
test("homepage configures one persistent root scene without a hero-contained stage", async () => {
  const [html, homeScript] = await Promise.all([
    readFile(homePartialPath, "utf8"),
    readFile(homeScriptPath, "utf8"),
  ]);

  assert.match(html, /data-x7-home/);
  assert.match(html, /data-model-url="{{ "models\/x7-avatar-entry\.glb" \| relURL }}"/);
  assert.doesNotMatch(html, /x7-avatar-entry__stage/);
  assert.match(homeScript, /import\("\.\/home-scene\.js"\)/);
  assert.doesNotMatch(homeScript, /home-avatar-entry\.js/);
});
```

- [ ] **Step 3: Add failing pure-behavior tests**

Create `tests/home-scroll-scene.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  clampSceneProgress,
  sceneModeFor,
  sampleSceneFrame,
} from "../hugo-src/static/js/x7/home-scene.js";

test("scene mode keeps desktop 3d persistent and degrades constrained devices", () => {
  assert.equal(sceneModeFor({ desktop: true, reducedMotion: false, saveData: false }), "full");
  assert.equal(sceneModeFor({ desktop: true, reducedMotion: true, saveData: false }), "static");
  assert.equal(sceneModeFor({ desktop: false, reducedMotion: false, saveData: false }), "particles");
  assert.equal(sceneModeFor({ desktop: true, reducedMotion: false, saveData: true }), "particles");
});

test("scene progress clamps and camera frames are reversible", () => {
  assert.equal(clampSceneProgress(-1), 0);
  assert.equal(clampSceneProgress(2), 1);
  const forward = sampleSceneFrame(0.52);
  const backward = sampleSceneFrame(0.52);
  assert.deepEqual(forward, backward);
  assert.ok(forward.cameraX < sampleSceneFrame(0).cameraX);
  assert.ok(forward.fov < sampleSceneFrame(0).fov);
});
```

- [ ] **Step 4: Run the focused tests and verify RED**

Run:

```bash
node --test tests/home-avatar-entry.test.mjs tests/home-scroll-scene.test.mjs
```

Expected: FAIL because `home-scene.js` and its exported helpers do not exist and the old hero-contained markup remains.

- [ ] **Step 5: Commit the regression tests**

```bash
git add tests/home-avatar-entry.test.mjs tests/home-scroll-scene.test.mjs
git commit -m "test(home): define fullscreen 3d scene contracts"
```

### Task 2: Add the Root-Level Fullscreen Scene Mount and Layering

**Files:**
- Modify: `hugo-src/layouts/partials/x7/home-constellation.html`
- Modify: `hugo-src/static/css/x7-home.css`
- Modify: `tests/render-contracts.sh`

- [ ] **Step 1: Move scene configuration to the homepage root**

Change the homepage article opening tag to:

```go-html-template
<article
  class="x7-constellation-home x7-home-cinematic"
  data-x7-home
  data-model-url="{{ "models/x7-avatar-entry.glb" | relURL }}"
  data-reference-url="{{ "images/x7-avatar-reference.png" | relURL }}">
```

Remove the entire `.x7-avatar-entry` block from `.x7-home-hero`. Keep `.x7-home-atmosphere` because it remains a foreground readability treatment.

- [ ] **Step 2: Add the failing render contract**

Add to `tests/render-contracts.sh` after the homepage marker assertions:

```js
if (!/\bdata-model-url=\/models\/x7-avatar-entry\.glb\b/.test(html)) {
  fail("homepage is missing persistent scene model configuration");
}
if (/x7-avatar-entry__stage/.test(html)) {
  fail("legacy hero-contained 3d stage is still rendered");
}
```

- [ ] **Step 3: Define viewport and foreground layer contracts**

Replace legacy `.x7-avatar-entry*` rules with:

```css
.x7-home-scene {
  position: fixed;
  inset: 0;
  z-index: 0;
  width: 100vw;
  height: 100dvh;
  overflow: hidden;
  pointer-events: none;
  background: #000102;
  contain: strict;
}

.x7-home-scene__webgl,
.x7-home-scene__particles,
.x7-home-scene__vignette {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.x7-home-scene__vignette {
  z-index: 3;
  background:
    radial-gradient(circle at 66% 42%, transparent 0 24%, rgb(0 0 0 / 34%) 66%, rgb(0 0 0 / 76%) 100%),
    linear-gradient(90deg, rgb(0 0 0 / 62%), transparent 34% 76%, rgb(0 0 0 / 22%));
}

body > #R-body,
body > #R-sidebar {
  position: relative;
  z-index: 2;
}

.x7-constellation-home {
  background: transparent;
  overflow: visible;
}

aside#R-sidebar {
  background: rgb(0 1 2 / 82%);
  backdrop-filter: blur(10px);
}
```

Do not assign opacity or animation to `body`, `#R-body`, or the entire viewport.

- [ ] **Step 4: Add responsive and reduced-motion contracts**

```css
@media (max-width: 63.99rem) {
  .x7-home-scene__webgl { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .x7-home-scene { animation: none !important; }
  .x7-home-scene__particles { display: none; }
}
```

- [ ] **Step 5: Run render and CSS contracts**

Run:

```bash
node --test tests/home-avatar-entry.test.mjs tests/home-heatmap.test.mjs
npm run test:render
```

Expected: the markup/CSS assertions pass; module tests still fail until Task 3.

- [ ] **Step 6: Commit the mount and layer changes**

```bash
git add hugo-src/layouts/partials/x7/home-constellation.html hugo-src/static/css/x7-home.css tests/render-contracts.sh
git commit -m "feat(home): add fullscreen scene layer"
```

### Task 3: Implement Persistent 3D, Particles, Capability Modes, and Cleanup

**Files:**
- Create: `hugo-src/static/js/x7/home-scene.js`
- Modify: `hugo-src/static/js/x7/home.js`
- Delete: `hugo-src/static/js/x7/home-avatar-entry.js`
- Test: `tests/home-avatar-entry.test.mjs`
- Test: `tests/home-scroll-scene.test.mjs`

- [ ] **Step 1: Implement pure capability and interpolation helpers**

Create the top of `home-scene.js`:

```js
const THREE_URL = "https://esm.sh/three@0.160.0";
const GLTF_LOADER_URL = "https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";

export function clampSceneProgress(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

export function sceneModeFor({ desktop, reducedMotion, saveData }) {
  if (reducedMotion) return "static";
  if (!desktop || saveData) return "particles";
  return "full";
}

const frames = [
  { p: 0, cameraX: 1.55, cameraY: 1.35, cameraZ: 4.55, fov: 42, modelX: 0, modelY: -0.08, modelScale: 1, opacity: 1 },
  { p: .22, cameraX: .65, cameraY: 1.22, cameraZ: 3.75, fov: 37, modelX: .78, modelY: -.06, modelScale: .86, opacity: .94 },
  { p: .52, cameraX: -.25, cameraY: .92, cameraZ: 3.3, fov: 34, modelX: 1.05, modelY: .05, modelScale: .72, opacity: .72 },
  { p: .82, cameraX: .35, cameraY: 1.05, cameraZ: 4.6, fov: 43, modelX: 1.48, modelY: .12, modelScale: .58, opacity: .34 },
  { p: 1, cameraX: .6, cameraY: 1.15, cameraZ: 5.1, fov: 46, modelX: 1.62, modelY: .16, modelScale: .54, opacity: .22 },
];

export function sampleSceneFrame(progress) {
  const p = clampSceneProgress(progress);
  const upperIndex = Math.max(1, frames.findIndex((frame) => frame.p >= p));
  const start = frames[upperIndex - 1];
  const end = frames[upperIndex];
  const local = (p - start.p) / Math.max(.0001, end.p - start.p);
  const eased = local * local * (3 - 2 * local);
  return Object.fromEntries(Object.keys(start).map((key) => [
    key,
    key === "p" ? p : start[key] + (end[key] - start[key]) * eased,
  ]));
}
```

- [ ] **Step 2: Implement one root scene and a particles-first startup**

`initHomeScene(home)` must:

1. Return early when `document.querySelector("[data-x7-home-scene]")` already exists.
2. Create `.x7-home-scene` with WebGL, particles, vignette, loading label and skip button children.
3. Append the scene directly to `document.body`.
4. Start Canvas 2D particles immediately.
5. Select `full`, `static`, or `particles` using `sceneModeFor`.
6. Load Three.js and the GLB only in `full` or `static`.
7. Store the current target progress from `x7:scene-progress` events.
8. Keep rendering after entry completion.

Use one public initializer:

```js
export function initHomeScene(home) {
  if (!home || document.querySelector("[data-x7-home-scene]")) return;
  const mode = sceneModeFor({
    desktop: matchMedia("(min-width: 64rem)").matches,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    saveData: navigator.connection?.saveData === true,
  });
  // create layer, start particles, optionally start Three.js
}
```

- [ ] **Step 3: Keep entry state separate from persistent scene state**

The skip button and wheel handler may:

```js
const finishEntry = () => {
  root.classList.add("x7-avatar-entry-complete");
  layer.dataset.entry = "complete";
};
```

They must not hide `.x7-home-scene`, remove the canvas, cancel the persistent render loop, or set a session key that blocks future scene initialization.

- [ ] **Step 4: Implement stable renderer lifecycle**

The renderer loop must lerp toward the latest scroll frame and pause safely:

```js
let targetProgress = 0;
let renderedProgress = 0;
let frameId = 0;
let active = true;

const render = () => {
  if (!active || frameId) return;
  const tick = () => {
    renderedProgress += (targetProgress - renderedProgress) * .075;
    const frame = sampleSceneFrame(renderedProgress);
    applyFrame(frame);
    renderer.render(scene, camera);
    frameId = requestAnimationFrame(tick);
  };
  frameId = requestAnimationFrame(tick);
};
```

`pagehide` and `visibilitychange` must cancel exactly one loop. `pageshow` and visibility restoration may restart only when `frameId === 0`. Dispose geometry, materials and renderer when the homepage scene is permanently removed.

- [ ] **Step 5: Add bounded load and WebGL context failure handling**

Race model loading against a 12-second timeout:

```js
const modelPromise = loader.loadAsync(modelUrl);
const timeoutPromise = new Promise((_, reject) => {
  window.setTimeout(() => reject(new Error("X7 scene model load timed out")), 12_000);
});
const gltf = await Promise.race([modelPromise, timeoutPromise]);
```

Attach context lifecycle handlers to the renderer canvas:

```js
renderer.domElement.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  stop();
  layer.dataset.state = "context-lost";
});

renderer.domElement.addEventListener("webglcontextrestored", () => {
  layer.dataset.state = "running";
  start();
});
```

If import, timeout, GLB load or context restoration fails, set `layer.dataset.mode = "particles"`, remove only the WebGL canvas, keep the particle/vignette layer, and log one warning guarded by a boolean.

- [ ] **Step 6: Switch the homepage coordinator to the new module**

In `home.js`, replace:

```js
import("./home-avatar-entry.js")
  .then((module) => module.initAvatarEntry(home))
```

with:

```js
import("./home-scene.js")
  .then((module) => module.initHomeScene(home))
  .catch((error) => {
    home.dataset.scene = "failed";
    console.warn("X7 fullscreen scene unavailable", error);
  });
```

Call this import before the reduced-motion entry-timeline early return so static mode still initializes.

- [ ] **Step 7: Remove the obsolete one-shot module**

Delete `hugo-src/static/js/x7/home-avatar-entry.js` only after no test, template or source file references it:

```bash
rg -n "home-avatar-entry|initAvatarEntry" hugo-src tests
```

Expected after deletion: no results except historical docs if present.

- [ ] **Step 8: Run focused tests and verify GREEN**

Run:

```bash
node --test tests/home-avatar-entry.test.mjs tests/home-scroll-scene.test.mjs
```

Expected: PASS, including persistent scene, mode and reversible frame assertions.

- [ ] **Step 9: Commit the persistent renderer**

```bash
git add hugo-src/static/js/x7/home-scene.js hugo-src/static/js/x7/home.js hugo-src/static/js/x7/home-avatar-entry.js tests/home-avatar-entry.test.mjs tests/home-scroll-scene.test.mjs
git commit -m "feat(home): persist 3d scene across scroll"
```

### Task 4: Drive the Scene Through the Entire Homepage Scroll Range

**Files:**
- Modify: `hugo-src/static/js/x7/home.js`
- Modify: `tests/home-scroll-scene.test.mjs`

- [ ] **Step 1: Add a failing whole-page progress test**

Extend `tests/home-scroll-scene.test.mjs`:

```js
import { homeScrollProgress } from "../hugo-src/static/js/x7/home.js";

test("whole-home progress spans the hero, heatmap, and recent updates", () => {
  assert.equal(homeScrollProgress({ scrollY: 100, homeTop: 100, homeHeight: 2400, viewportHeight: 800 }), 0);
  assert.equal(homeScrollProgress({ scrollY: 900, homeTop: 100, homeHeight: 2400, viewportHeight: 800 }), .5);
  assert.equal(homeScrollProgress({ scrollY: 1700, homeTop: 100, homeHeight: 2400, viewportHeight: 800 }), 1);
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test tests/home-scroll-scene.test.mjs
```

Expected: FAIL because `homeScrollProgress` is not exported.

- [ ] **Step 3: Implement whole-home progress**

Add to `home.js`:

```js
export function homeScrollProgress({ scrollY, homeTop, homeHeight, viewportHeight }) {
  const range = Math.max(1, homeHeight - viewportHeight);
  return Math.min(1, Math.max(0, (scrollY - homeTop) / range));
}
```

Replace the hero-only progress calculation with:

```js
const rect = home.getBoundingClientRect();
const homeTop = window.scrollY + rect.top;
const progress = homeScrollProgress({
  scrollY: window.scrollY,
  homeTop,
  homeHeight: home.offsetHeight,
  viewportHeight: window.innerHeight,
});
home.style.setProperty("--x7-home-scroll-progress", progress.toFixed(4));
home.dispatchEvent(new CustomEvent("x7:scene-progress", {
  detail: { progress },
}));
```

The scroll listener must remain passive and update through `requestAnimationFrame`.

- [ ] **Step 4: Verify scroll tests**

Run:

```bash
node --test tests/home-scroll-scene.test.mjs tests/home-heatmap.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit the scroll driver**

```bash
git add hugo-src/static/js/x7/home.js tests/home-scroll-scene.test.mjs
git commit -m "feat(home): drive scene from full page scroll"
```

### Task 5: Full Verification, Browser QA, Error Closure, and Push

**Files:**
- Verify all modified source and test files.

- [ ] **Step 1: Run all automated verification**

Run:

```bash
npm test
npm run test:render
git diff --check
```

Expected: all Node tests pass, Hugo builds successfully, render contracts pass, and no whitespace errors are reported.

- [ ] **Step 2: Start the real Hugo development server**

Run:

```bash
hugo server --source hugo-src --bind 127.0.0.1 --port 4173 --baseURL http://127.0.0.1:4173/ --disableFastRender
```

Expected: `Web Server is available at http://127.0.0.1:4173/`.

- [ ] **Step 3: Verify desktop behavior in the in-app browser**

At a desktop viewport, reload with homepage entry session state cleared and verify:

```text
one [data-x7-home-scene] direct child of body
scene rect equals viewport rect
one WebGL canvas
one particle canvas
3D remains visible after entry completion
scroll progress moves through at least 0, 0.22, 0.52, 0.82
camera/model state changes at each checkpoint
365 visible heatmap days
18 recent update links
no horizontal overflow
no repeated console errors
```

- [ ] **Step 4: Verify mobile and reduced-motion behavior**

At 390 px width:

```text
no WebGL canvas
particle/vignette layer covers the full viewport
knowledge tree and content remain usable
no horizontal overflow
```

With reduced motion:

```text
no moving particle loop
static or fallback scene remains readable
entry content is immediately visible
```

- [ ] **Step 5: Confirm the reported error is closed**

Compare the console and DOM evidence captured in Task 1. If the original error remains, do not commit a completion claim; return to Task 3 and fix the exact failing boundary.

- [ ] **Step 6: Commit any verification-only contract corrections**

If browser QA required a scoped correction, stage only the files changed for this feature and commit:

```bash
git add hugo-src/layouts/partials/x7/home-constellation.html hugo-src/static/css/x7-home.css hugo-src/static/js/x7/home.js hugo-src/static/js/x7/home-scene.js tests/home-avatar-entry.test.mjs tests/home-scroll-scene.test.mjs tests/render-contracts.sh
git commit -m "fix(home): complete fullscreen scene verification"
```

- [ ] **Step 7: Push the verified branch**

Run:

```bash
git push origin master
```

Expected: `master -> master` with the final feature commits and no unrelated working-tree files staged.
