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
  const mediaListeners = new Set();
  const connectionListeners = new Set();
  let resizeCallback;
  let intersectionCallback;
  const media = { matches: false, addEventListener: (_, fn) => mediaListeners.add(fn), removeEventListener: (_, fn) => mediaListeners.delete(fn) };
  const connection = { saveData: false, addEventListener: (_, fn) => connectionListeners.add(fn), removeEventListener: (_, fn) => connectionListeners.delete(fn) };
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
      document, navigator: { deviceMemory: 8, connection }, innerWidth: 1200, devicePixelRatio: 2,
      matchMedia: () => media, getComputedStyle: () => ({ getPropertyValue: () => "" }),
      requestAnimationFrame: (fn) => { requests += 1; frames.push(fn); return requests; }, cancelAnimationFrame: () => { cancelled += 1; },
      addEventListener() {}, removeEventListener() {},
      ResizeObserver: class { constructor(fn) { resizeCallback = fn; } observe() {} disconnect() { resizeCallback = undefined; } },
      IntersectionObserver: class { constructor(fn) { intersectionCallback = fn; } observe() {} disconnect() { intersectionCallback = undefined; } },
    }, canvas, fallback,
    requests: () => requests, cancelled: () => cancelled, listeners, runFrame: (time = 16) => frames.shift()?.(time),
    reduce: (value) => { media.matches = value; for (const fn of mediaListeners) fn(); },
    saveData: (value) => { connection.saveData = value; for (const fn of connectionListeners) fn(); },
    preferenceListeners: () => mediaListeners.size + connectionListeners.size,
    visible: (value) => { document.hidden = !value; listeners.get("visibilitychange")?.(); },
    intersect: (value) => intersectionCallback?.([{ isIntersecting: value }]),
    resize: () => resizeCallback?.(),
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

test("visibility, intersection, resize, and stale cleanup preserve one-loop lifecycle", () => {
  const context = new Proxy({ createRadialGradient: () => ({ addColorStop() {} }) }, { get: (target, key) => target[key] || (() => {}) });
  const setup = environment({ json: '[{"id":"a","title":"A","url":"/a/","count":1}]', context });
  const cleanup = initConstellation(setup.env);
  setup.visible(false);
  const stopped = setup.cancelled();
  assert.ok(stopped >= 1);
  setup.visible(true);
  setup.intersect(false);
  setup.intersect(true);
  setup.resize();
  cleanup(); cleanup();
  assert.ok(setup.cancelled() > stopped);
  const requests = setup.requests();
  setup.visible(true); setup.intersect(true); setup.resize();
  assert.equal(setup.requests(), requests);
});

test("live motion and data preferences stop and safely restore enhancement", () => {
  const context = new Proxy({ createRadialGradient: () => ({ addColorStop() {} }) }, { get: (target, key) => target[key] || (() => {}) });
  const setup = environment({ json: '[{"id":"a","title":"A","url":"/a/","count":1}]', context });
  const cleanup = initConstellation(setup.env);
  setup.runFrame();
  setup.reduce(true);
  assert.equal(setup.canvas.hidden, true);
  assert.equal(setup.fallback.dataset.state, undefined);
  setup.reduce(false);
  assert.equal(setup.canvas.hidden, false);
  assert.equal(setup.canvas.dataset.state, "preparing");
  setup.saveData(true);
  assert.equal(setup.canvas.hidden, true);
  cleanup(); cleanup();
  assert.equal(setup.preferenceListeners(), 0);
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
