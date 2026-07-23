import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const homePartialPath = new URL("../hugo-src/layouts/partials/x7/home-constellation.html", import.meta.url);
const homeScriptPath = new URL("../hugo-src/static/js/x7/home.js", import.meta.url);
const avatarScriptPath = new URL("../hugo-src/static/js/x7/home-avatar-entry.js", import.meta.url);
const homeCssPath = new URL("../hugo-src/static/css/x7-home.css", import.meta.url);

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

test("avatar entry assets exist and model size is explicit", async () => {
  const model = await stat(new URL("../hugo-src/static/models/x7-avatar-entry.glb", import.meta.url));
  const reference = await stat(new URL("../hugo-src/static/images/x7-avatar-reference.png", import.meta.url));

  assert.ok(model.size > 25_000_000, "model should be the provided Meshy GLB");
  assert.ok(model.size < 35_000_000, "model should not be accidentally duplicated or replaced by a huge export");
  assert.ok(reference.size > 500_000, "reference image should be present");
  assert.ok(reference.size < 2_000_000, "reference image should stay web-reasonable");
});

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
  assert.match(script, /esm\.sh\/three@0\.160\.0/);
  assert.match(script, /GLTFLoader\.js/);
});

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
