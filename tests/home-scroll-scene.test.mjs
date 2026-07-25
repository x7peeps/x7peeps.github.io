import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sceneModuleUrl = new URL("../hugo-src/static/js/x7/home-scene.js", import.meta.url);

test("scene mode keeps desktop 3d persistent and degrades constrained devices", async () => {
  const { sceneModeFor } = await import(sceneModuleUrl.href);

  assert.equal(sceneModeFor({ desktop: true, reducedMotion: false, saveData: false }), "full");
  assert.equal(sceneModeFor({ desktop: true, reducedMotion: true, saveData: false }), "static");
  assert.equal(sceneModeFor({ desktop: false, reducedMotion: false, saveData: false }), "particles");
  assert.equal(sceneModeFor({ desktop: true, reducedMotion: false, saveData: true }), "particles");
});

test("scene progress clamps and camera frames are deterministic and reversible", async () => {
  const { clampSceneProgress, sampleSceneFrame } = await import(sceneModuleUrl.href);

  assert.equal(clampSceneProgress(-1), 0);
  assert.equal(clampSceneProgress(2), 1);
  const low = sampleSceneFrame(0.18);
  const high = sampleSceneFrame(0.82);
  const returnedLow = sampleSceneFrame(0.18);

  assert.deepEqual(returnedLow, low, "returning to a lower progress should restore its complete frame");
  assert.deepEqual(sampleSceneFrame(0.82), high, "sampling the same progress should be deterministic");
  assert.notDeepEqual(high, low, "higher progress should produce a distinct camera frame");
});

test("scene module owns a body-level mount, loading fallback, and renderer lifecycle", async () => {
  const script = await readFile(sceneModuleUrl, "utf8");

  assert.match(script, /data-x7-home-scene/, "scene should expose one root mount marker");
  assert.match(script, /document\.body/, "scene should mount outside the hero at document.body");
  assert.match(script, /GLTFLoader|loadAsync/, "scene should load the configured GLB");
  assert.match(script, /catch|timed out/, "scene should handle Three or GLB loading failures");
  assert.match(
    script,
    /dataset\.mode\s*=\s*["']particles["']/,
    "scene loading failure should switch to the particle fallback mode",
  );
  assert.match(script, /pagehide/, "scene should stop its renderer when the page is hidden");
  assert.match(script, /webglcontextlost/, "scene should handle WebGL context loss");
  assert.match(script, /webglcontextrestored/, "scene should handle WebGL context restoration");
});
