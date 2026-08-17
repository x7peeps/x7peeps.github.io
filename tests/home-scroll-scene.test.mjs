import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const homeModuleUrl = new URL("../hugo-src/static/js/x7/home.js", import.meta.url);
const homePartialUrl = new URL("../hugo-src/layouts/partials/x7/home-constellation.html", import.meta.url);

test("home scroll progress spans the full home content and stays reversible", async () => {
  const { homeScrollProgress } = await import(homeModuleUrl.href);
  const geometry = {
    homeTop: 120,
    homeHeight: 3720,
    viewportHeight: 720,
  };
  const samples = [
    [120, 0],
    [780, 0.22],
    [1680, 0.52],
    [2580, 0.82],
    [3120, 1],
  ];

  for (const [scrollTop, expected] of samples) {
    assert.equal(homeScrollProgress({ ...geometry, scrollTop }), expected);
  }
  assert.equal(homeScrollProgress({ ...geometry, scrollTop: -200 }), 0);
  assert.equal(homeScrollProgress({ ...geometry, scrollTop: 4000 }), 1);
  assert.equal(homeScrollProgress({ ...geometry, scrollTop: 1680 }), 0.52);
});

test("home scrolling prefers Relearn's body scroller and falls back to window", async () => {
  const { resolveHomeScrollTarget } = await import(homeModuleUrl.href);
  const relearnScroller = new EventTarget();
  const windowRef = new EventTarget();

  assert.equal(
    resolveHomeScrollTarget({ querySelector: () => relearnScroller }, windowRef),
    relearnScroller,
  );
  assert.equal(
    resolveHomeScrollTarget({ querySelector: () => null }, windowRef),
    windowRef,
  );
});

test("real scroll target dispatches exact reversible full-page scroll progress", async () => {
  const { initScrollCinematography } = await import(homeModuleUrl.href);
  const target = new EventTarget();
  target.scrollTop = 0;
  target.clientHeight = 720;
  target.getBoundingClientRect = () => ({ top: 48 });

  const styleValues = new Map();
  const home = new EventTarget();
  home.offsetHeight = 3720;
  home.style = {
    setProperty(name, value) {
      styleValues.set(name, value);
    },
  };
  home.getBoundingClientRect = () => ({
    top: 48 + 120 - target.scrollTop,
    height: 3720,
  });

  let nextFrame = 1;
  const frames = new Map();
  const windowRef = new EventTarget();
  windowRef.CustomEvent = class extends Event {
    constructor(type, options) {
      super(type);
      this.detail = options?.detail;
    }
  };
  windowRef.requestAnimationFrame = (callback) => {
    const id = nextFrame++;
    frames.set(id, callback);
    return id;
  };
  windowRef.cancelAnimationFrame = (id) => frames.delete(id);
  const documentRef = { querySelector: () => target };
  const received = [];
  home.addEventListener("x7:scene-progress", (event) => {
    received.push(event.detail.progress);
    assert.equal(Number(styleValues.get("--x7-home-scroll-progress")), event.detail.progress);
  });

  const controller = initScrollCinematography(home, { documentRef, windowRef });
  const scrollTo = (scrollTop) => {
    target.scrollTop = scrollTop;
    target.dispatchEvent(new Event("scroll"));
    assert.equal(frames.size, 1);
    const [frameId, callback] = frames.entries().next().value;
    frames.delete(frameId);
    callback();
  };

  scrollTo(1680);
  scrollTo(2580);
  scrollTo(780);
  assert.deepEqual(received, [0, 0.52, 0.82, 0.22]);

  controller.destroy();
  target.dispatchEvent(new Event("scroll"));
  assert.equal(frames.size, 0);
});

test("BFCache suspends pending work, resumes progress, and permanent pagehide cleans up", async () => {
  const { initScrollCinematography } = await import(homeModuleUrl.href);
  class TrackingTarget extends EventTarget {
    constructor() {
      super();
      this.listeners = new Map();
    }
    addEventListener(type, listener, options) {
      super.addEventListener(type, listener, options);
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(listener);
    }
    removeEventListener(type, listener, options) {
      super.removeEventListener(type, listener, options);
      this.listeners.get(type)?.delete(listener);
    }
    listenerCount(type) {
      return this.listeners.get(type)?.size || 0;
    }
  }

  const target = new TrackingTarget();
  target.scrollTop = 0;
  target.clientHeight = 720;
  target.getBoundingClientRect = () => ({ top: 0 });
  const home = new EventTarget();
  home.offsetHeight = 3720;
  const received = [];
  home.style = { setProperty() {} };
  home.getBoundingClientRect = () => ({ top: 120 - target.scrollTop, height: 3720 });
  home.addEventListener("x7:scene-progress", (event) => received.push(event.detail.progress));

  let nextFrame = 1;
  const frames = new Map();
  const windowRef = new TrackingTarget();
  windowRef.CustomEvent = class extends Event {
    constructor(type, options) {
      super(type);
      this.detail = options?.detail;
    }
  };
  windowRef.requestAnimationFrame = (callback) => {
    const id = nextFrame++;
    frames.set(id, callback);
    return id;
  };
  windowRef.cancelAnimationFrame = (id) => frames.delete(id);
  const deps = {
    documentRef: { querySelector: () => target },
    windowRef,
  };

  initScrollCinematography(home, deps);
  initScrollCinematography(home, deps);
  assert.equal(target.listenerCount("scroll"), 1);
  assert.equal(windowRef.listenerCount("resize"), 1);
  assert.equal(windowRef.listenerCount("pagehide"), 1);
  assert.equal(windowRef.listenerCount("pageshow"), 1);

  target.scrollTop = 1680;
  target.dispatchEvent(new Event("scroll"));
  assert.equal(frames.size, 1);
  const cachedHide = new Event("pagehide");
  Object.defineProperty(cachedHide, "persisted", { value: true });
  windowRef.dispatchEvent(cachedHide);
  assert.equal(frames.size, 0);
  assert.equal(target.listenerCount("scroll"), 1);
  assert.equal(windowRef.listenerCount("resize"), 1);

  const cachedShow = new Event("pageshow");
  Object.defineProperty(cachedShow, "persisted", { value: true });
  windowRef.dispatchEvent(cachedShow);
  assert.deepEqual(received, [0, 0, 0.52]);

  target.scrollTop = 2580;
  target.dispatchEvent(new Event("scroll"));
  const [frameId, callback] = frames.entries().next().value;
  frames.delete(frameId);
  callback();
  assert.equal(received.at(-1), 0.82);

  const permanentHide = new Event("pagehide");
  Object.defineProperty(permanentHide, "persisted", { value: false });
  windowRef.dispatchEvent(permanentHide);
  assert.equal(target.listenerCount("scroll"), 0);
  assert.equal(windowRef.listenerCount("resize"), 0);
  assert.equal(windowRef.listenerCount("pagehide"), 0);
  assert.equal(windowRef.listenerCount("pageshow"), 0);
  assert.equal(frames.size, 0);
});

test("homepage root is static: no scene object, model url, or reference url", async () => {
  const html = await readFile(homePartialUrl, "utf8");

  assert.doesNotMatch(html, /data-scene-object=/);
  assert.doesNotMatch(html, /data-model-url=/);
  assert.doesNotMatch(html, /data-reference-url=/);
  assert.match(html, /data-x7-home/);
});
