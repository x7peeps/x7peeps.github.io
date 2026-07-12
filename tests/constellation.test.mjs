import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { initConstellation } from "../hugo-src/static/js/x7/constellation.js";

test("static constellation enhancement is inert without a DOM", () => {
  const before = new Set(Reflect.ownKeys(globalThis));
  const cleanup = initConstellation();

  assert.equal(typeof cleanup, "function");
  assert.doesNotThrow(() => cleanup());
  assert.deepEqual(new Set(Reflect.ownKeys(globalThis)), before);
});

function environment({ json = "[]", context = {} } = {}) {
  const listeners = new Map();
  let requests = 0;
  let cancelled = 0;
  const frames = [];
  const canvas = {
    hidden: true, width: 0, height: 0, style: {}, dataset: {},
    getContext: () => context,
    getBoundingClientRect: () => ({ width: 500, height: 240, left: 0, top: 0 }),
  };
  const fallback = { style: {}, dataset: {} };
  const hero = { addEventListener() {}, removeEventListener() {}, getBoundingClientRect: canvas.getBoundingClientRect };
  const data = { textContent: json };
  const document = {
    hidden: false,
    documentElement: { style: { getPropertyValue: () => "" } },
    querySelector: (selector) => ({
      "[data-x7-constellation]": canvas,
      "[data-x7-constellation-data]": data,
      "[data-x7-constellation-fallback]": fallback,
      ".x7-ch-hero": hero,
    })[selector] || null,
    querySelectorAll: () => [],
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name),
  };
  return {
    env: {
      document, navigator: { deviceMemory: 8, connection: { saveData: false } }, innerWidth: 1200, devicePixelRatio: 2,
      matchMedia: () => ({ matches: false }), getComputedStyle: () => ({ getPropertyValue: () => "" }),
      requestAnimationFrame: (fn) => { requests += 1; frames.push(fn); return requests; }, cancelAnimationFrame: () => { cancelled += 1; },
      addEventListener() {}, removeEventListener() {},
    }, canvas, fallback,
    requests: () => requests, cancelled: () => cancelled, listeners, runFrame: (time = 16) => frames.shift()?.(time),
  };
}

test("invalid graph and missing canvas context remain inert", () => {
  for (const setup of [environment({ json: "{}" }), environment({ json: "not-json" }), environment({ context: null })]) {
    const cleanup = initConstellation(setup.env);
    assert.equal(setup.requests(), 0);
    assert.equal(setup.canvas.hidden, true);
    assert.doesNotThrow(cleanup);
  }
});

test("initialization is idempotent and cleanup cancels the only animation loop", () => {
  const context = new Proxy({ createRadialGradient: () => ({ addColorStop() {} }) }, { get: (target, key) => target[key] || (() => {}) });
  const setup = environment({ json: '[{"id":"a","title":"A","url":"/a/","count":1}]', context });
  const first = initConstellation(setup.env);
  const second = initConstellation(setup.env);
  assert.equal(setup.requests(), 1);
  assert.equal(setup.canvas.hidden, false);
  assert.equal(setup.canvas.dataset.state, "preparing");
  assert.equal(setup.canvas.dataset.x7Enhanced, undefined);
  setup.runFrame();
  assert.equal(setup.canvas.dataset.state, "enhanced");
  assert.equal(setup.fallback.dataset.state, "enhanced");
  first();
  assert.equal(setup.cancelled(), 1);
  second();
  assert.equal(setup.canvas.hidden, true);
});

test("canvas is a non-interactive visual layer", async () => {
  const css = await readFile(new URL("../hugo-src/static/css/x7-home.css", import.meta.url), "utf8");
  assert.match(css, /\.x7-ch-visual canvas\s*\{[^}]*position:\s*absolute[^}]*pointer-events:\s*none/s);
  assert.match(css, /canvas\[data-state="preparing"\][^{]*\{[^}]*opacity:\s*0/s);
  assert.match(css, /canvas\[data-state="enhanced"\][^{]*\{[^}]*opacity:\s*1/s);
  assert.match(css, /transition:\s*opacity\s+\.35s/);
});
