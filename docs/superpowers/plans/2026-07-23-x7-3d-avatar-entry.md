# X7 3D Avatar Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a homepage-only 3D avatar entry prototype using the provided Meshy GLB while preserving the current X7 knowledge structure, heatmap, recent updates feed, sidebar, and article reading experience.

**Architecture:** Add an isolated homepage 3D module that is dynamically imported only from `home.js`. The module owns model loading, Three.js scene setup, intro completion, skip behavior, and failure fallback; existing homepage rendering and heatmap generation remain in `home.js`.

**Tech Stack:** Hugo static site, Relearn theme, vanilla ES modules, Three.js from CDN module imports, Node built-in test runner, existing CSS/JS contract tests.

---

## File Structure

- Create: `hugo-src/static/js/x7/home-avatar-entry.js`
  - Owns the Three.js homepage avatar entry.
  - Exports `initAvatarEntry(home, options)`.
  - Never runs on article pages.
- Modify: `hugo-src/static/js/x7/home.js`
  - Calls `initAvatarEntry()` from `initHomeMotion()`.
  - Keeps existing heatmap, particle, scroll, and reveal behavior intact.
- Modify: `hugo-src/layouts/partials/x7/home-constellation.html`
  - Adds a 3D mount inside `.x7-home-hero`.
  - Adds data attributes for model URL and reference image URL.
- Modify: `hugo-src/static/css/x7-home.css`
  - Adds full-bleed canvas, loading, skip, tag HUD, fallback, reduced-motion, and completion states.
- Create: `hugo-src/static/models/x7-avatar-entry.glb`
  - Copy from `/Users/pwndazhang/Downloads/Meshy_AI_Desert_Adventure_Self_0723150708_texture.glb`.
- Create: `hugo-src/static/images/x7-avatar-reference.png`
  - Copy from `/Users/pwndazhang/Downloads/43312f01-922f-4193-99c0-a4b85ad9db97.png`.
- Create: `tests/home-avatar-entry.test.mjs`
  - Contract tests for module isolation, fallbacks, reduced motion, and homepage-only markup.
- Modify: `tests/home-heatmap.test.mjs`
  - Add a regression assertion that heatmap and recent-update code paths still exist after the 3D mount is added.

## Task 1: Add Homepage Markup Contract

**Files:**
- Modify: `hugo-src/layouts/partials/x7/home-constellation.html`
- Test: `tests/home-avatar-entry.test.mjs`

- [ ] **Step 1: Write the failing markup contract test**

Create `tests/home-avatar-entry.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const homePartialPath = new URL("../hugo-src/layouts/partials/x7/home-constellation.html", import.meta.url);
const homeScriptPath = new URL("../hugo-src/static/js/x7/home.js", import.meta.url);

test("homepage declares an isolated 3d avatar entry mount with static asset urls", async () => {
  const html = await readFile(homePartialPath, "utf8");

  assert.match(html, /data-x7-avatar-entry/);
  assert.match(html, /data-model-url="{{ "models\/x7-avatar-entry\.glb" \| relURL }}"/);
  assert.match(html, /data-reference-url="{{ "images\/x7-avatar-reference\.png" \| relURL }}"/);
  assert.match(html, /class="x7-avatar-entry__stage"/);
  assert.match(html, /class="x7-avatar-entry__skip"/);
  assert.match(html, /Security Research/);
  assert.match(html, /Forensics/);
  assert.match(html, /Toolchain/);
  assert.match(html, /AI/);
  assert.match(html, /UAV/);
  assert.match(html, /Writing/);
});

test("home motion imports the 3d entry only from the homepage initializer", async () => {
  const script = await readFile(homeScriptPath, "utf8");

  assert.match(script, /import\("\.\/home-avatar-entry\.js"\)/);
  assert.match(script, /initAvatarEntry\(home/);
});
```

- [ ] **Step 2: Run the failing contract test**

Run: `node --test tests/home-avatar-entry.test.mjs`

Expected: FAIL because the 3D mount and dynamic import do not exist yet.

- [ ] **Step 3: Add the homepage 3D mount**

Insert this block immediately after `<div class="x7-home-atmosphere" aria-hidden="true"></div>` in `hugo-src/layouts/partials/x7/home-constellation.html`:

```html
    <div
      class="x7-avatar-entry"
      data-x7-avatar-entry
      data-model-url="{{ "models/x7-avatar-entry.glb" | relURL }}"
      data-reference-url="{{ "images/x7-avatar-reference.png" | relURL }}"
      aria-hidden="true">
      <div class="x7-avatar-entry__stage"></div>
      <div class="x7-avatar-entry__loading">INITIALIZING AVATAR</div>
      <div class="x7-avatar-entry__tags" aria-hidden="true">
        <span data-tag="security">Security Research</span>
        <span data-tag="forensics">Forensics</span>
        <span data-tag="toolchain">Toolchain</span>
        <span data-tag="ai">AI</span>
        <span data-tag="uav">UAV</span>
        <span data-tag="writing">Writing</span>
      </div>
      <button class="x7-avatar-entry__skip" type="button" aria-label="跳过 3D 入场">Skip</button>
    </div>
```

- [ ] **Step 4: Add dynamic import hook**

Inside `initHomeMotion()` in `hugo-src/static/js/x7/home.js`, after `home.dataset.motion = "enhanced";`, add:

```js
  import("./home-avatar-entry.js")
    .then((module) => module.initAvatarEntry(home))
    .catch((error) => {
      console.warn("X7 avatar entry unavailable", error);
    });
```

- [ ] **Step 5: Run the markup contract test**

Run: `node --test tests/home-avatar-entry.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/home-avatar-entry.test.mjs hugo-src/layouts/partials/x7/home-constellation.html hugo-src/static/js/x7/home.js
git commit -m "feat(home): add avatar entry mount"
```

## Task 2: Add Assets Safely

**Files:**
- Create: `hugo-src/static/models/x7-avatar-entry.glb`
- Create: `hugo-src/static/images/x7-avatar-reference.png`
- Test: `tests/home-avatar-entry.test.mjs`

- [ ] **Step 1: Extend the asset contract test**

Append to `tests/home-avatar-entry.test.mjs`:

```js
import { stat } from "node:fs/promises";

test("avatar entry assets exist and model size is explicit", async () => {
  const model = await stat(new URL("../hugo-src/static/models/x7-avatar-entry.glb", import.meta.url));
  const reference = await stat(new URL("../hugo-src/static/images/x7-avatar-reference.png", import.meta.url));

  assert.ok(model.size > 25_000_000, "model should be the provided Meshy GLB");
  assert.ok(model.size < 35_000_000, "model should not be accidentally duplicated or replaced by a huge export");
  assert.ok(reference.size > 500_000, "reference image should be present");
  assert.ok(reference.size < 2_000_000, "reference image should stay web-reasonable");
});
```

- [ ] **Step 2: Run the failing asset contract test**

Run: `node --test tests/home-avatar-entry.test.mjs`

Expected: FAIL with missing asset paths.

- [ ] **Step 3: Copy the provided assets**

Run:

```bash
mkdir -p hugo-src/static/models hugo-src/static/images
cp "/Users/pwndazhang/Downloads/Meshy_AI_Desert_Adventure_Self_0723150708_texture.glb" hugo-src/static/models/x7-avatar-entry.glb
cp "/Users/pwndazhang/Downloads/43312f01-922f-4193-99c0-a4b85ad9db97.png" hugo-src/static/images/x7-avatar-reference.png
```

- [ ] **Step 4: Run the asset contract test**

Run: `node --test tests/home-avatar-entry.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/home-avatar-entry.test.mjs hugo-src/static/models/x7-avatar-entry.glb hugo-src/static/images/x7-avatar-reference.png
git commit -m "feat(home): add avatar entry assets"
```

## Task 3: Implement 3D Entry Module With Fallbacks

**Files:**
- Create: `hugo-src/static/js/x7/home-avatar-entry.js`
- Test: `tests/home-avatar-entry.test.mjs`

- [ ] **Step 1: Extend the module contract test**

Append to `tests/home-avatar-entry.test.mjs`:

```js
const avatarScriptPath = new URL("../hugo-src/static/js/x7/home-avatar-entry.js", import.meta.url);

test("avatar entry module is homepage-only, defensive, and skippable", async () => {
  const script = await readFile(avatarScriptPath, "utf8");

  assert.match(script, /export function initAvatarEntry\(home/);
  assert.match(script, /querySelector\("\[data-x7-avatar-entry\]"\)/);
  assert.match(script, /prefers-reduced-motion: reduce/);
  assert.match(script, /sessionStorage/);
  assert.match(script, /x7-avatar-entry-complete/);
  assert.match(script, /x7-avatar-entry-failed/);
  assert.match(script, /addEventListener\("click"/);
  assert.match(script, /addEventListener\("wheel"/);
  assert.match(script, /requestAnimationFrame/);
  assert.match(script, /three\.module\.js/);
  assert.match(script, /GLTFLoader\.js/);
});
```

- [ ] **Step 2: Run the failing module contract test**

Run: `node --test tests/home-avatar-entry.test.mjs`

Expected: FAIL because `home-avatar-entry.js` does not exist.

- [ ] **Step 3: Create the 3D module**

Create `hugo-src/static/js/x7/home-avatar-entry.js`:

```js
const THREE_URL = "https://unpkg.com/three@0.160.0/build/three.module.js";
const GLTF_LOADER_URL = "https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";
const REDUCE_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const SESSION_KEY = "x7-avatar-entry-complete";
const DESKTOP_QUERY = "(min-width: 64rem)";

export function initAvatarEntry(home, options = {}) {
  const entry = home.querySelector("[data-x7-avatar-entry]");
  if (!entry || entry.dataset.ready === "true") return;
  entry.dataset.ready = "true";

  const root = document.documentElement;
  const reducedMotion = window.matchMedia(REDUCE_MOTION_QUERY).matches;
  const desktop = window.matchMedia(DESKTOP_QUERY).matches;
  const modelUrl = entry.dataset.modelUrl;
  const skip = entry.querySelector(".x7-avatar-entry__skip");
  const stage = entry.querySelector(".x7-avatar-entry__stage");
  const storage = options.storage || window.sessionStorage;
  const key = `${window.relearn?.absBaseUri || location.origin}/${SESSION_KEY}`;

  const complete = () => {
    try {
      storage.setItem(key, "1");
    } catch {
      // Session storage can be unavailable in strict privacy modes.
    }
    root.classList.add("x7-avatar-entry-complete");
    entry.dataset.state = "complete";
  };

  const fail = () => {
    root.classList.add("x7-avatar-entry-failed");
    entry.dataset.state = "failed";
    complete();
  };

  try {
    if (storage.getItem(key) === "1") {
      complete();
      return;
    }
  } catch {
    // If reading storage fails, run a normal fallback path.
  }

  if (!stage || !modelUrl || reducedMotion || !desktop) {
    complete();
    return;
  }

  skip?.addEventListener("click", complete, { once: true });
  entry.addEventListener("wheel", complete, { once: true, passive: true });

  runThreeEntry({ entry, stage, modelUrl, complete, fail });
}

async function runThreeEntry({ entry, stage, modelUrl, complete, fail }) {
  let frame = 0;
  let renderer;

  try {
    const [{ default: THREE }, { GLTFLoader }] = await Promise.all([
      import(THREE_URL),
      import(GLTF_LOADER_URL),
    ]);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    const loader = new GLTFLoader();
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    stage.appendChild(renderer.domElement);

    const ambient = new THREE.HemisphereLight(0x9fdfff, 0x0a0a0a, 1.6);
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(2.5, 3.5, 4);
    scene.add(ambient, key);

    const gltf = await loader.loadAsync(modelUrl);
    const model = gltf.scene;
    scene.add(model);
    frameModel(THREE, model);
    entry.dataset.state = "running";

    const startedAt = performance.now();
    const duration = 5200;

    const resize = () => {
      const rect = stage.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    const render = (time) => {
      resize();
      const progress = Math.min(1, (time - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const angle = -0.78 + eased * 1.18;
      const radius = 4.8 - eased * 1.15;
      camera.position.set(Math.sin(angle) * radius, 1.2 + eased * 0.28, Math.cos(angle) * radius);
      camera.lookAt(0, 0.95, 0);
      model.rotation.y = -angle * 0.55 + Math.sin(time * 0.0007) * 0.035;
      renderer.render(scene, camera);

      if (progress >= 1) {
        complete();
        return;
      }
      frame = window.requestAnimationFrame(render);
    };

    window.addEventListener("resize", resize, { passive: true });
    frame = window.requestAnimationFrame(render);
    window.addEventListener("pagehide", () => {
      if (frame) window.cancelAnimationFrame(frame);
      renderer?.dispose();
    }, { once: true });
  } catch (error) {
    console.warn("X7 avatar entry failed", error);
    if (frame) window.cancelAnimationFrame(frame);
    renderer?.dispose();
    fail();
  }
}

function frameModel(THREE, model) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const largest = Math.max(size.x, size.y, size.z) || 1;
  const scale = 2.25 / largest;
  model.position.sub(center);
  model.scale.setScalar(scale);
  model.position.y -= 0.15;
}
```

- [ ] **Step 4: Run the module contract test**

Run: `node --test tests/home-avatar-entry.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/home-avatar-entry.test.mjs hugo-src/static/js/x7/home-avatar-entry.js
git commit -m "feat(home): implement avatar entry module"
```

## Task 4: Style The Cinematic Layer

**Files:**
- Modify: `hugo-src/static/css/x7-home.css`
- Test: `tests/home-avatar-entry.test.mjs`

- [ ] **Step 1: Extend the CSS contract test**

Append to `tests/home-avatar-entry.test.mjs`:

```js
const homeCssPath = new URL("../hugo-src/static/css/x7-home.css", import.meta.url);

test("avatar entry css is full-bleed, skippable, and reduced-motion aware", async () => {
  const css = await readFile(homeCssPath, "utf8");

  assert.match(css, /\.x7-avatar-entry\s*\{/);
  assert.match(css, /\.x7-avatar-entry__stage\s*\{/);
  assert.match(css, /\.x7-avatar-entry__skip\s*\{/);
  assert.match(css, /\.x7-avatar-entry__tags\s*\{/);
  assert.match(css, /\.x7-avatar-entry-complete/);
  assert.match(css, /\.x7-avatar-entry-failed/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(css.match(/\.x7-avatar-entry\s*\{[^}]*\}/s)?.[0] || "", /border:/);
  assert.equal([...css].reduce((depth, char) => depth + (char === "{" ? 1 : char === "}" ? -1 : 0), 0), 0);
});
```

- [ ] **Step 2: Run the failing CSS contract test**

Run: `node --test tests/home-avatar-entry.test.mjs`

Expected: FAIL because the CSS classes are not defined.

- [ ] **Step 3: Add the CSS layer**

Append to `hugo-src/static/css/x7-home.css`:

```css
.x7-avatar-entry {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: grid;
  place-items: center;
  overflow: hidden;
  pointer-events: auto;
  opacity: 1;
  transition: opacity 680ms ease, visibility 680ms ease;
}

.x7-avatar-entry::before {
  content: "";
  position: absolute;
  inset: -12%;
  background:
    radial-gradient(circle at 50% 46%, rgb(90 220 255 / 16%), transparent 26rem),
    linear-gradient(90deg, transparent, rgb(120 245 255 / 8%), transparent);
  opacity: .82;
  transform: perspective(900px) rotateX(58deg) translateY(10%);
}

.x7-avatar-entry__stage {
  position: absolute;
  inset: 0;
  z-index: 1;
}

.x7-avatar-entry__stage canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.x7-avatar-entry__loading {
  position: absolute;
  z-index: 3;
  bottom: clamp(2rem, 7vh, 5rem);
  left: 50%;
  transform: translateX(-50%);
  color: rgb(124 236 255 / 72%);
  font-size: .72rem;
  letter-spacing: .24em;
  text-transform: uppercase;
}

.x7-avatar-entry__tags {
  position: absolute;
  z-index: 2;
  inset: 17% 13%;
  pointer-events: none;
}

.x7-avatar-entry__tags span {
  position: absolute;
  color: rgb(230 250 255 / 86%);
  font-size: clamp(.62rem, .72vw, .78rem);
  letter-spacing: .18em;
  text-transform: uppercase;
  text-shadow: 0 0 18px rgb(82 223 255 / 42%);
  opacity: .72;
}

.x7-avatar-entry__tags [data-tag="security"] { top: 12%; left: 21%; }
.x7-avatar-entry__tags [data-tag="forensics"] { top: 24%; right: 18%; }
.x7-avatar-entry__tags [data-tag="toolchain"] { bottom: 28%; left: 16%; }
.x7-avatar-entry__tags [data-tag="ai"] { top: 48%; right: 23%; }
.x7-avatar-entry__tags [data-tag="uav"] { bottom: 18%; right: 28%; }
.x7-avatar-entry__tags [data-tag="writing"] { top: 62%; left: 28%; }

.x7-avatar-entry__skip {
  position: absolute;
  z-index: 4;
  right: clamp(1rem, 3vw, 2rem);
  bottom: clamp(1rem, 3vw, 2rem);
  color: rgb(214 244 255 / 74%);
  background: rgb(0 0 0 / 28%);
  border: 1px solid rgb(132 226 255 / 22%);
  border-radius: 999px;
  padding: .45rem .7rem;
  font: inherit;
  font-size: .72rem;
  cursor: pointer;
}

.x7-avatar-entry-complete .x7-avatar-entry,
.x7-avatar-entry-failed .x7-avatar-entry {
  visibility: hidden;
  opacity: 0;
  pointer-events: none;
}

@media (max-width: 63.99rem), (prefers-reduced-motion: reduce) {
  .x7-avatar-entry {
    display: none;
  }
}
```

- [ ] **Step 4: Run the CSS contract test**

Run: `node --test tests/home-avatar-entry.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/home-avatar-entry.test.mjs hugo-src/static/css/x7-home.css
git commit -m "feat(home): style avatar entry layer"
```

## Task 5: Preserve Heatmap And Recent Updates

**Files:**
- Modify: `tests/home-heatmap.test.mjs`
- Modify only if needed: `hugo-src/static/js/x7/home.js`

- [ ] **Step 1: Add regression assertions to the existing heatmap test**

Append to `tests/home-heatmap.test.mjs`:

```js
test("avatar entry does not replace heatmap or recent update rendering", async () => {
  const [html, script] = await Promise.all([
    readFile(new URL("../hugo-src/layouts/partials/x7/home-constellation.html", import.meta.url), "utf8"),
    readFile(scriptPath, "utf8"),
  ]);

  assert.match(html, /id="x7-heatmap"/);
  assert.match(html, /id="recent-updates"/);
  assert.match(html, /data-x7-latest-link/);
  assert.match(script, /window\.__heatmapDays/);
  assert.match(script, /heatmap\.appendChild\(frag\)/);
});
```

- [ ] **Step 2: Run the regression tests**

Run: `node --test tests/home-heatmap.test.mjs tests/home-avatar-entry.test.mjs`

Expected: PASS.

- [ ] **Step 3: Run all Node tests**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 4: Commit if the heatmap test changed**

```bash
git add tests/home-heatmap.test.mjs
git commit -m "test(home): preserve heatmap with avatar entry"
```

## Task 6: Local Render And Browser Verification

**Files:**
- No code changes expected unless verification finds a defect.

- [ ] **Step 1: Run whitespace and render checks**

Run:

```bash
git diff --check
npm test
npm run test:render
```

Expected: all checks pass.

- [ ] **Step 2: Start the local Hugo preview**

Use the existing local preview command for this repository. If the current server is stale, restart it on an available localhost port and record the URL.

Expected: homepage is reachable, usually at `http://localhost:4173/` or a nearby port.

- [ ] **Step 3: Verify desktop behavior in browser**

Open the homepage and verify:

- the avatar entry mount exists only on the homepage
- the canvas becomes nonblank after the model loads
- the model is centered and framed
- labels do not overlap the X7 title after completion
- Skip exits the entry immediately
- the sidebar appears after completion
- heatmap cells render
- recent updates remain visible and clickable

- [ ] **Step 4: Verify mobile/reduced behavior**

Use a mobile viewport and verify:

- the 3D layer is not blocking the homepage
- the logo, subtitle, heatmap, and recent updates remain readable
- there is no horizontal scroll introduced by tags or canvas

- [ ] **Step 5: Commit verification fixes only if needed**

If verification requires CSS or JS fixes, commit only those changed files:

```bash
git add hugo-src/static/css/x7-home.css hugo-src/static/js/x7/home-avatar-entry.js hugo-src/static/js/x7/home.js
git commit -m "fix(home): polish avatar entry verification"
```

## Task 7: Final Git Sync

**Files:**
- All files touched by Tasks 1-6.

- [ ] **Step 1: Confirm scoped status**

Run: `git status --short`

Expected: only unrelated pre-existing `.trae`, article-generation, or other user files remain unstaged. No avatar-entry implementation files should be uncommitted.

- [ ] **Step 2: Push the current branch**

Run: `git push origin master`

Expected: push succeeds and GitHub Pages receives the implementation commits.

- [ ] **Step 3: Report the result**

Report:

- local preview URL
- commits created
- checks run
- push result
- any fallback limitations, especially the 29 MB model cost
