import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const homePartialPath = new URL("../hugo-src/layouts/partials/x7/home-constellation.html", import.meta.url);
const homeScriptPath = new URL("../hugo-src/static/js/x7/home.js", import.meta.url);

test("homepage renders a static root without a 3d scene or model", async () => {
  const [html, homeScript] = await Promise.all([
    readFile(homePartialPath, "utf8"),
    readFile(homeScriptPath, "utf8"),
  ]);

  assert.match(html, /data-x7-home/);
  assert.doesNotMatch(html, /data-scene-object=/);
  assert.doesNotMatch(html, /data-model-url=/);
  assert.doesNotMatch(html, /data-reference-url=/);
  assert.doesNotMatch(html, /x7-avatar-entry__stage/);
  assert.doesNotMatch(homeScript, /home-scene\.js/);
  assert.doesNotMatch(homeScript, /initHomeScene/);
  assert.doesNotMatch(homeScript, /home-avatar-entry\.js/);
  assert.doesNotMatch(
    homeScript,
    /function initParticleField|PARTICLE_FOCUS|getParticleFocusDuration/,
    "the obsolete hero particle runtime must be removed",
  );
});

test("home initializer keeps heatmap rendering without scene dependencies", async () => {
  const script = await readFile(homeScriptPath, "utf8");

  assert.match(script, /initHomeMotion/);
  assert.match(script, /markHomeEntryComplete/);
  assert.match(script, /window\.__heatmapDays/);
  assert.match(script, /heatmap\.appendChild\(frag\)/);
  assert.doesNotMatch(script, /import\("\."\/home-scene\.js"\)/);
  assert.doesNotMatch(script, /module\.initHomeScene/);
});
