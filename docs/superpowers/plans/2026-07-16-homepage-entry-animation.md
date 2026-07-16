# Homepage Entry Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the confirmed “Center Logo → Camera Split” homepage entry animation where the panda logo opens centered, the camera settles into the homepage, and the sidebar appears last.

**Architecture:** Use an early head script to mark eligible homepage loads before first paint, CSS to create the theater/camera/sidebar reveal states, and the existing `x7/home.js` module to mark animation completion. Keep Relearn source untouched and preserve the existing native sidebar scrolling fix.

**Tech Stack:** Hugo partials, Relearn theme, vanilla CSS keyframes, vanilla JavaScript ES modules, existing render contract shell tests.

## Global Constraints

- The entry animation triggers only on the homepage.
- The opening hides the left sidebar, centers the panda logo, shifts into the homepage composition, then reveals the sidebar.
- Total desktop duration should stay around 1.8–2.4 seconds.
- Article navigation must not replay the full homepage entry.
- `prefers-reduced-motion: reduce` must show the final static layout immediately.
- Do not change knowledge structure, article content, account/login behavior, heatmap data, or recent updates.
- Sidebar native scrolling and row-level non-scroll behavior must remain unchanged.
- Do not modify Relearn theme source directly.

---

## File Structure

- `hugo-src/layouts/partials/custom-header.html`
  - Owns early first-paint state classes.
  - Extends the existing early script that already wraps `PerfectScrollbar`.

- `hugo-src/static/css/x7-home.css`
  - Owns homepage-only entry visuals: blackout, centered logo, camera drift, staged hero reveal, sidebar reveal suppression.

- `hugo-src/static/js/x7/home.js`
  - Owns runtime completion: adds final-state class, stores session completion, cleans temporary entry state.

- `tests/render-contracts.sh`
  - Owns static contracts that prevent regressions: entry hook exists, reduced-motion path exists, no global page flash classes reappear, sidebar scroll constraints remain.

---

### Task 1: Early Homepage Entry State

**Files:**
- Modify: `hugo-src/layouts/partials/custom-header.html`
- Test: `tests/render-contracts.sh`

**Interfaces:**
- Consumes: `window.relearn.path`, `window.relearn.absBaseUri`, `sessionStorage`, `matchMedia("(prefers-reduced-motion: reduce)")`
- Produces:
  - `html.x7-home-entry-prime`: full homepage entry should run.
  - `html.x7-home-entry-reduced`: homepage entry is skipped for reduced-motion users.
  - `html.x7-home-entry-complete`: full homepage entry has already completed in the current tab/session.
  - session key `${window.relearn.absBaseUri || location.origin}/x7-home-entry-complete`

- [ ] **Step 1: Add the failing contract checks**

Add these checks near the existing custom-header checks in `tests/render-contracts.sh`:

```bash
  grep -Fq "x7-home-entry-prime" "$source_dir/layouts/partials/custom-header.html"
  grep -Fq "x7-home-entry-complete" "$source_dir/layouts/partials/custom-header.html"
  grep -Fq "x7-home-entry-reduced" "$source_dir/layouts/partials/custom-header.html"
  grep -Fq "x7-home-entry-complete" "$source_dir/static/js/x7/home.js"
```

- [ ] **Step 2: Run the contract to verify it fails**

Run:

```bash
GOPROXY=https://goproxy.cn,direct GOSUMDB=sum.golang.google.cn bash tests/render-contracts.sh
```

Expected: FAIL because `x7-home-entry-prime` and related markers do not exist yet.

- [ ] **Step 3: Extend the early head script**

In `hugo-src/layouts/partials/custom-header.html`, add this block at the top of the existing IIFE, before the current `navigationPrimeKey` logic:

```html
  const homeEntryKey = `${window.relearn?.absBaseUri || location.origin}/x7-home-entry-complete`;
  const relearnPath = window.relearn?.path || location.pathname;
  const isHomeEntryPath = relearnPath === "/index.html" || relearnPath === "/" || /\/index\.html$/.test(relearnPath);
  const prefersReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (isHomeEntryPath) {
    try {
      if (prefersReducedMotion) {
        document.documentElement.classList.add("x7-home-entry-reduced", "x7-home-entry-complete");
      } else if (sessionStorage.getItem(homeEntryKey)) {
        document.documentElement.classList.add("x7-home-entry-complete");
      } else {
        document.documentElement.classList.add("x7-home-entry-prime");
      }
    } catch {
      document.documentElement.classList.add("x7-home-entry-prime");
    }
  }
```

Then update the existing `navigationPrimeKey` block so it does not also fire the global sidebar materialization while the homepage entry is active:

```html
  const navigationPrimeKey = `${window.relearn?.absBaseUri || location.origin}/x7-navigation-prime`;
  try {
    if (!isHomeEntryPath && !prefersReducedMotion && !sessionStorage.getItem(navigationPrimeKey)) {
      document.documentElement.classList.add("x7-navigation-prime");
      sessionStorage.setItem(navigationPrimeKey, "1");
    }
  } catch {
    if (!isHomeEntryPath) document.documentElement.classList.add("x7-navigation-prime");
  }
```

- [ ] **Step 4: Run the targeted checks**

Run:

```bash
grep -Fq "x7-home-entry-prime" hugo-src/layouts/partials/custom-header.html
grep -Fq "x7-home-entry-complete" hugo-src/layouts/partials/custom-header.html
grep -Fq "x7-home-entry-reduced" hugo-src/layouts/partials/custom-header.html
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add hugo-src/layouts/partials/custom-header.html tests/render-contracts.sh
git commit -m "Add homepage entry state hook"
```

---

### Task 2: Homepage Theater CSS

**Files:**
- Modify: `hugo-src/static/css/x7-home.css`
- Test: `tests/render-contracts.sh`

**Interfaces:**
- Consumes:
  - `html.x7-home-entry-prime`
  - `html.x7-home-entry-complete`
  - `html.x7-home-entry-reduced`
  - existing homepage classes `.x7-home-hero`, `.x7-home-avatar`, `.x7-hero-title`, `.x7-hero-subtitle`, `.x7-hero-mission`, `.x7-heatmap-panel`, `.x7-feed`
- Produces:
  - keyframes `x7-home-stage-blackout`, `x7-home-logo-center`, `x7-home-camera-settle`, `x7-home-entry-sidebar`, `x7-home-heatmap-ignite`

- [ ] **Step 1: Add failing CSS contract checks**

Add these checks to `tests/render-contracts.sh` near the homepage asset checks:

```bash
  grep -Fq "x7-home-stage-blackout" "$source_dir/static/css/x7-home.css"
  grep -Fq "x7-home-logo-center" "$source_dir/static/css/x7-home.css"
  grep -Fq "x7-home-entry-sidebar" "$source_dir/static/css/x7-home.css"
  grep -Fq "prefers-reduced-motion: reduce" "$source_dir/static/css/x7-home.css"
```

- [ ] **Step 2: Run the targeted checks to verify they fail**

Run:

```bash
grep -Fq "x7-home-stage-blackout" hugo-src/static/css/x7-home.css
```

Expected: FAIL because the keyframe does not exist yet.

- [ ] **Step 3: Add the homepage entry CSS**

Append this block before the existing `@media (prefers-reduced-motion: reduce)` section in `hugo-src/static/css/x7-home.css`:

```css
html.x7-home-entry-prime {
  background: #000;
}

html.x7-home-entry-prime body {
  overflow-x: hidden;
}

html.x7-home-entry-prime #R-sidebar {
  opacity: 0;
  transform: translate3d(-1.15rem, 0, 0);
  pointer-events: none;
  animation: x7-home-entry-sidebar .72s cubic-bezier(.16, 1, .3, 1) 1.48s both !important;
}

html.x7-home-entry-prime .x7-constellation-home::before {
  animation: x7-home-camera-settle 2.15s cubic-bezier(.16, 1, .3, 1) both;
}

html.x7-home-entry-prime .x7-home-hero::before {
  opacity: .34;
  animation: x7-home-stage-blackout 2.2s cubic-bezier(.16, 1, .3, 1) both;
}

html.x7-home-entry-prime .x7-home-avatar {
  position: relative;
  z-index: 6;
  animation: x7-home-logo-center 1.85s cubic-bezier(.16, 1, .3, 1) both;
}

html.x7-home-entry-prime .x7-home-kicker,
html.x7-home-entry-prime .x7-hero-title,
html.x7-home-entry-prime .x7-hero-subtitle,
html.x7-home-entry-prime .x7-hero-mission {
  animation: x7-home-copy-reveal .88s cubic-bezier(.16, 1, .3, 1) .82s both;
}

html.x7-home-entry-prime .x7-heatmap-panel {
  animation: x7-home-heatmap-ignite .94s cubic-bezier(.16, 1, .3, 1) 1.12s both;
}

html.x7-home-entry-prime .x7-feed {
  animation: x7-home-feed-rise .72s cubic-bezier(.16, 1, .3, 1) 1.42s both;
}

html.x7-home-entry-complete #R-sidebar,
html.x7-home-entry-reduced #R-sidebar {
  opacity: 1;
  transform: none;
  pointer-events: auto;
}

@keyframes x7-home-stage-blackout {
  0% {
    background: radial-gradient(circle at 50% 48%, rgb(0 0 0 / 92%), rgb(0 0 0 / 100%) 62%);
  }
  48% {
    background: radial-gradient(circle at 50% 48%, rgb(98 232 255 / 5%), rgb(0 0 0 / 88%) 64%);
  }
  100% {
    background: transparent;
  }
}

@keyframes x7-home-logo-center {
  0% {
    transform: translate3d(0, 18vh, 0) scale(1.18);
    opacity: 0;
    filter: blur(10px) saturate(.85);
    box-shadow: 0 0 0 .9rem rgb(255 255 255 / 2%), 0 0 5rem rgb(98 232 255 / 0%);
  }
  24% {
    opacity: 1;
    filter: blur(0) saturate(1);
  }
  58% {
    transform: translate3d(0, 18vh, 0) scale(1.18);
    box-shadow: 0 0 0 .9rem rgb(255 255 255 / 3%), 0 0 5rem rgb(98 232 255 / 18%);
  }
  100% {
    transform: translate3d(0, 0, 0) scale(1);
    opacity: 1;
    filter: none;
  }
}

@keyframes x7-home-camera-settle {
  0% {
    transform: scale(1.055) translate3d(0, 1.4rem, 0);
  }
  100% {
    transform: scale(1) translate3d(0, 0, 0);
  }
}

@keyframes x7-home-copy-reveal {
  from {
    opacity: 0;
    transform: translate3d(0, .8rem, 0);
    filter: blur(7px);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
    filter: none;
  }
}

@keyframes x7-home-heatmap-ignite {
  from {
    opacity: 0;
    transform: translate3d(0, 1rem, 0) scale(.985);
    filter: blur(8px);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
    filter: none;
  }
}

@keyframes x7-home-feed-rise {
  from {
    opacity: 0;
    transform: translate3d(0, 1.25rem, 0);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

@keyframes x7-home-entry-sidebar {
  from {
    opacity: 0;
    transform: translate3d(-1.15rem, 0, 0);
    filter: blur(7px);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
    filter: none;
  }
}
```

- [ ] **Step 4: Add reduced-motion override**

Inside the existing `@media (prefers-reduced-motion: reduce)` block in `hugo-src/static/css/x7-home.css`, add:

```css
  html.x7-home-entry-prime #R-sidebar,
  html.x7-home-entry-prime .x7-home-avatar,
  html.x7-home-entry-prime .x7-home-kicker,
  html.x7-home-entry-prime .x7-hero-title,
  html.x7-home-entry-prime .x7-hero-subtitle,
  html.x7-home-entry-prime .x7-hero-mission,
  html.x7-home-entry-prime .x7-heatmap-panel,
  html.x7-home-entry-prime .x7-feed {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
    filter: none !important;
  }
```

- [ ] **Step 5: Run targeted checks**

Run:

```bash
grep -Fq "x7-home-stage-blackout" hugo-src/static/css/x7-home.css
grep -Fq "x7-home-logo-center" hugo-src/static/css/x7-home.css
grep -Fq "x7-home-entry-sidebar" hugo-src/static/css/x7-home.css
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add hugo-src/static/css/x7-home.css tests/render-contracts.sh
git commit -m "Add cinematic homepage entry styles"
```

---

### Task 3: Runtime Completion and Session Behavior

**Files:**
- Modify: `hugo-src/static/js/x7/home.js`
- Test: `tests/render-contracts.sh`

**Interfaces:**
- Consumes:
  - `html.x7-home-entry-prime`
  - session key `${window.relearn.absBaseUri || location.origin}/x7-home-entry-complete`
  - existing `initHomeMotion()`
- Produces:
  - `markHomeEntryComplete()` function
  - `html.x7-home-entry-complete` class after animation end
  - removal of `html.x7-home-entry-prime` after animation end

- [ ] **Step 1: Add failing JS contract checks**

Add these checks to `tests/render-contracts.sh`:

```bash
  grep -Fq "function markHomeEntryComplete" "$source_dir/static/js/x7/home.js"
  grep -Fq "x7-home-entry-prime" "$source_dir/static/js/x7/home.js"
```

- [ ] **Step 2: Run targeted check to verify failure**

Run:

```bash
grep -Fq "function markHomeEntryComplete" hugo-src/static/js/x7/home.js
```

Expected: FAIL because the function does not exist yet.

- [ ] **Step 3: Call completion from `initHomeMotion()`**

In `hugo-src/static/js/x7/home.js`, update `initHomeMotion()` so it calls completion handling before returning:

```js
function initHomeMotion() {
  const home = document.querySelector("[data-x7-home]");
  if (!home || home.dataset.motionReady === "true") return;
  home.dataset.motionReady = "true";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) {
    home.dataset.motion = "reduced";
    markHomeEntryComplete();
    return;
  }

  home.dataset.motion = "enhanced";
  initParticleField(home);
  initScrollCinematography(home);
  initRevealSequence(home);
  markHomeEntryComplete();
}
```

- [ ] **Step 4: Add `markHomeEntryComplete()`**

Add this function after `initHomeMotion()`:

```js
function markHomeEntryComplete() {
  const root = document.documentElement;
  if (!root.classList.contains("x7-home-entry-prime")) {
    root.classList.add("x7-home-entry-complete");
    return;
  }

  const key = `${window.relearn?.absBaseUri || location.origin}/x7-home-entry-complete`;
  const finish = () => {
    root.classList.remove("x7-home-entry-prime");
    root.classList.add("x7-home-entry-complete");
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      // If storage is unavailable, still leave the visual state complete.
    }
  };

  window.setTimeout(finish, 2350);
}
```

- [ ] **Step 5: Run JS syntax check**

Run:

```bash
node --check hugo-src/static/js/x7/home.js
```

Expected: no output, exit 0.

- [ ] **Step 6: Run targeted checks**

Run:

```bash
grep -Fq "function markHomeEntryComplete" hugo-src/static/js/x7/home.js
grep -Fq "x7-home-entry-prime" hugo-src/static/js/x7/home.js
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit**

```bash
git add hugo-src/static/js/x7/home.js tests/render-contracts.sh
git commit -m "Complete homepage entry animation state"
```

---

### Task 4: Render Validation and Local Preview

**Files:**
- Modify: none unless validation exposes issues.
- Test: `tests/render-contracts.sh`

**Interfaces:**
- Consumes: all changes from Tasks 1–3.
- Produces: validated `hugo-src/public-test` preview and running local server on `http://localhost:4173/`.

- [ ] **Step 1: Run full render contract**

Run:

```bash
GOPROXY=https://goproxy.cn,direct GOSUMDB=sum.golang.google.cn bash tests/render-contracts.sh
```

Expected: PASS. If it hangs before Hugo output because of the stale Hugo build lock, run the build validation in Step 2 with `--noBuildLock` and record that full contract was blocked by local lock state.

- [ ] **Step 2: Run direct Hugo build fallback if needed**

Run only if Step 1 hangs:

```bash
GOPROXY=https://goproxy.cn,direct GOSUMDB=sum.golang.google.cn hugo --source hugo-src --destination public-test --minify --noBuildLock
```

Expected: PASS with Hugo page counts.

- [ ] **Step 3: Verify generated homepage contains entry hooks**

Run:

```bash
grep -Fq "x7-home-entry-prime" hugo-src/public-test/index.html
grep -Fq "x7-home-stage-blackout" hugo-src/public-test/css/x7-home.css
grep -Fq "function markHomeEntryComplete" hugo-src/public-test/js/x7/home.js
```

Expected: all commands exit 0.

- [ ] **Step 4: Restart local static preview**

Run:

```bash
lsof -ti tcp:4173 | xargs -r kill
python3 -m http.server 4173 --bind 127.0.0.1 --directory hugo-src/public-test
```

Expected: server starts and keeps running.

- [ ] **Step 5: Verify local assets**

In a second terminal, run:

```bash
curl -I --max-time 3 http://localhost:4173/
curl -fsS http://localhost:4173/css/x7-home.css | grep -n "x7-home-stage-blackout"
curl -fsS http://localhost:4173/js/x7/home.js | grep -n "markHomeEntryComplete"
```

Expected: HTTP 200 and matching CSS/JS lines.

- [ ] **Step 6: Manual QA checklist**

Open `http://localhost:4173/` in a new tab and verify:

```text
1. Sidebar is hidden at the beginning of the homepage entry.
2. Panda logo appears centered first.
3. Logo settles into the normal hero area.
4. X7PEEPS, subtitle, heatmap, and feed reveal without layout jump.
5. Sidebar appears last and remains scrollable with the trackpad.
6. Clicking an article does not replay the full homepage entry.
7. Returning to homepage does not produce a full-screen flash.
```

- [ ] **Step 7: Commit any validation fixes**

Only if Steps 1–6 required code changes:

```bash
git add hugo-src/layouts/partials/custom-header.html hugo-src/static/css/x7-home.css hugo-src/static/js/x7/home.js tests/render-contracts.sh
git commit -m "Validate homepage entry animation"
```

If no fixes were required, do not create an empty commit.

---

## Self-Review

Spec coverage:

- Centered logo first: Task 2.
- Sidebar hidden during opening and revealed last: Task 2.
- Homepage-only trigger: Task 1.
- No article replay: Task 1 and Task 3 session behavior.
- Reduced motion: Task 1 and Task 2.
- Native sidebar scrolling preserved: Task 2 does not change scroll container; Task 4 manual QA verifies.
- No Relearn source modification: File Structure and all tasks touch only custom project files.

Placeholder scan:

- No TBD/TODO placeholders.
- All commands include expected outcomes.
- All code-producing steps include exact snippets.

Type/name consistency:

- `x7-home-entry-prime`, `x7-home-entry-complete`, and `x7-home-entry-reduced` are consistently used in the head script, CSS, JS, and contracts.
- `markHomeEntryComplete()` is defined and called in `initHomeMotion()`.

