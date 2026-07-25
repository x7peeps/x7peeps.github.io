import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sceneModuleUrl = new URL("../hugo-src/static/js/x7/home-scene.js", import.meta.url);
const homeModuleUrl = new URL("../hugo-src/static/js/x7/home.js", import.meta.url);
const sceneCssUrl = new URL("../hugo-src/static/css/x7-home.css", import.meta.url);

class FakeElement extends EventTarget {
  constructor(tagName = "div") {
    super();
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.children = [];
    this.className = "";
    this.dataset = {};
    this.hidden = false;
    this.parentNode = null;
    this.style = { setProperty() {} };
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }

  querySelector(selector) {
    if (!selector.startsWith(".")) return null;
    const className = selector.slice(1);
    return this.walk().find((node) => node.className.split(" ").includes(className)) || null;
  }

  walk() {
    return this.children.flatMap((child) => [child, ...child.walk()]);
  }

  getBoundingClientRect() {
    return { width: 1280, height: 720 };
  }

  getContext(kind) {
    if (kind !== "2d") return null;
    return {
      arc() {},
      beginPath() {},
      clearRect() {},
      fill() {},
      setTransform() {},
      set fillStyle(_value) {},
      set globalCompositeOperation(_value) {},
    };
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
}

class FakePreference {
  constructor(matches = false) {
    this.matches = matches;
    this.listeners = new Set();
  }

  addEventListener(type, listener) {
    if (type === "change") this.listeners.add(listener);
  }

  removeEventListener(type, listener) {
    if (type === "change") this.listeners.delete(listener);
  }

  set(matches) {
    this.matches = matches;
    for (const listener of this.listeners) listener({ matches });
  }
}

function createHarness({
  desktop = true,
  reducedMotion = false,
  saveData = false,
  deferFetch = false,
  loadTimeoutMs = 12_000,
  rejectModel = false,
} = {}) {
  const body = new FakeElement("body");
  const document = new EventTarget();
  document.body = body;
  document.hidden = false;
  document.documentElement = {
    classList: {
      add() {},
      remove() {},
    },
  };
  document.createElement = (tagName) => new FakeElement(tagName);
  document.querySelector = (selector) => {
    if (selector !== "[data-x7-home-scene]") return null;
    return body.children.find((child) => "x7HomeScene" in child.dataset) || null;
  };

  const window = new EventTarget();
  window.devicePixelRatio = 1;
  window.innerHeight = 720;
  window.innerWidth = 1280;
  window.location = { href: "https://example.test/" };
  const desktopPreference = new FakePreference(desktop);
  const reducedPreference = new FakePreference(reducedMotion);
  const connection = new FakePreference();
  connection.saveData = saveData;

  let nextFrame = 1;
  const rafCallbacks = new Map();
  const cancelledFrames = [];
  const requestAnimationFrame = (callback) => {
    const id = nextFrame++;
    rafCallbacks.set(id, callback);
    return id;
  };
  const cancelAnimationFrame = (id) => {
    cancelledFrames.push(id);
    rafCallbacks.delete(id);
  };

  const disposals = { geometry: 0, material: 0, renderer: 0, texture: 0 };
  const texture = {
    isTexture: true,
    dispose() {
      disposals.texture += 1;
    },
  };
  const material = {
    map: texture,
    emissiveMap: texture,
    dispose() {
      disposals.material += 1;
    },
  };
  const model = {
    material,
    geometry: { dispose: () => { disposals.geometry += 1; } },
    position: {
      x: 0,
      y: 0,
      z: 0,
      sub(value) {
        this.x -= value.x;
        this.y -= value.y;
        this.z -= value.z;
      },
    },
    rotation: { y: 0 },
    scale: {
      x: 1,
      setScalar(value) {
        this.x = value;
      },
    },
    traverse(callback) {
      callback(this);
    },
  };

  const rendererCanvases = [];
  class WebGLRenderer {
    constructor() {
      this.domElement = new FakeElement("canvas");
      rendererCanvases.push(this.domElement);
    }
    dispose() {
      disposals.renderer += 1;
    }
    render() {}
    setPixelRatio() {}
    setSize() {}
  }
  const cameraLookTargets = [];
  class PerspectiveCamera {
    constructor() {
      this.position = { set() {} };
    }
    lookAt(x, y, z) {
      cameraLookTargets.push({ x, y, z });
    }
    updateProjectionMatrix() {}
  }
  class Light {
    constructor() {
      this.position = { set() {} };
    }
  }
  class Box3 {
    setFromObject() {
      return this;
    }
    getSize(target) {
      return Object.assign(target, { x: 1, y: 2, z: 1 });
    }
    getCenter(target) {
      return Object.assign(target, { x: 0, y: 1, z: 0 });
    }
  }
  class Vector3 {}
  class GLTFLoader {
    async parseAsync() {
      if (rejectModel) throw new Error("model unavailable");
      return { scene: model };
    }
    async loadAsync() {
      if (rejectModel) throw new Error("model unavailable");
      return { scene: model };
    }
  }
  const THREE = {
    Box3,
    DirectionalLight: Light,
    HemisphereLight: Light,
    PerspectiveCamera,
    Scene: class { add() {} },
    SRGBColorSpace: "srgb",
    Vector3,
    WebGLRenderer,
  };

  let moduleLoads = 0;
  let fetchCalls = 0;
  let resolveFetch;
  const deferredFetch = deferFetch
    ? new Promise((resolve) => {
      resolveFetch = resolve;
    })
    : null;
  const response = {
    ok: true,
    async arrayBuffer() {
      return new ArrayBuffer(8);
    },
  };
  const fetch = async () => {
    fetchCalls += 1;
    return deferredFetch || response;
  };
  let aborts = 0;
  class AbortController {
    constructor() {
      this.signal = {};
    }
    abort() {
      aborts += 1;
      this.signal.aborted = true;
    }
  }

  const deps = {
    AbortController,
    cancelAnimationFrame,
    clearTimeout,
    document,
    fetch,
    importModules: async () => {
      moduleLoads += 1;
      return { THREE, GLTFLoader };
    },
    loadTimeoutMs,
    matchMedia: (query) => query.includes("min-width") ? desktopPreference : reducedPreference,
    navigator: { connection },
    requestAnimationFrame,
    setTimeout,
    window,
  };
  const home = new FakeElement("main");
  home.dataset.modelUrl = "/models/avatar.glb";

  return {
    cameraLookTargets,
    cancelledFrames,
    connection,
    deps,
    desktopPreference,
    disposals,
    document,
    get aborts() { return aborts; },
    get fetchCalls() { return fetchCalls; },
    get moduleLoads() { return moduleLoads; },
    home,
    model,
    rafCallbacks,
    reducedPreference,
    rendererCanvases,
    resolveFetch: () => resolveFetch?.(response),
    window,
  };
}

async function flushAsyncWork() {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

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

test("real scroll target dispatches exact reversible full-page scene progress", async () => {
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

test("late scene initialization replays the current restored scroll progress", async () => {
  const {
    initScrollCinematography,
    replayHomeSceneProgress,
  } = await import(homeModuleUrl.href);
  const target = new EventTarget();
  target.scrollTop = 1680;
  target.clientHeight = 720;
  target.getBoundingClientRect = () => ({ top: 48 });
  const home = new EventTarget();
  home.dataset = {};
  home.offsetHeight = 3720;
  home.style = { setProperty() {} };
  home.getBoundingClientRect = () => ({ top: 48 + 120 - target.scrollTop, height: 3720 });
  const windowRef = new EventTarget();
  windowRef.CustomEvent = class extends Event {
    constructor(type, options) {
      super(type);
      this.detail = options?.detail;
    }
  };
  windowRef.requestAnimationFrame = () => 1;
  windowRef.cancelAnimationFrame = () => {};

  const controller = initScrollCinematography(home, {
    documentRef: { querySelector: () => target },
    windowRef,
  });
  const received = [];
  home.addEventListener("x7:scene-progress", (event) => received.push(event.detail.progress));
  replayHomeSceneProgress(home, windowRef);

  assert.equal(home.dataset.sceneProgress, "0.52");
  assert.deepEqual(received, [0.52]);
  controller.destroy();
});

test("scene mode keeps desktop 3d persistent and degrades constrained devices", async () => {
  const { sceneModeFor } = await import(sceneModuleUrl.href);

  assert.equal(sceneModeFor({ desktop: true, reducedMotion: false, saveData: false }), "full");
  assert.equal(sceneModeFor({ desktop: true, reducedMotion: true, saveData: false }), "static");
  assert.equal(sceneModeFor({ desktop: false, reducedMotion: false, saveData: false }), "particles");
  assert.equal(sceneModeFor({ desktop: true, reducedMotion: false, saveData: true }), "particles");
});

test("scene progress uses five smooth deterministic and reversible keyframes", async () => {
  const { clampSceneProgress, sampleSceneFrame } = await import(sceneModuleUrl.href);

  assert.equal(clampSceneProgress(-1), 0);
  assert.equal(clampSceneProgress(2), 1);
  const anchors = [0, 0.22, 0.52, 0.82, 1].map(sampleSceneFrame);
  assert.deepEqual(anchors.map((frame) => frame.p), [0, 0.22, 0.52, 0.82, 1]);
  assert.deepEqual(sampleSceneFrame(0.18), sampleSceneFrame(0.18));
  assert.notDeepEqual(sampleSceneFrame(0.18), sampleSceneFrame(0.82));
  assert.ok(Math.abs(sampleSceneFrame(0.2201).cameraX - sampleSceneFrame(0.2199).cameraX) < 0.01);
});

test("scene keyframes retreat behind readable home content after the opening", async () => {
  const { sampleSceneFrame } = await import(sceneModuleUrl.href);
  const opening = sampleSceneFrame(0);
  const retreat = sampleSceneFrame(0.22);
  const readable = sampleSceneFrame(0.52);
  const silhouette = sampleSceneFrame(0.82);
  const ending = sampleSceneFrame(1);

  assert.ok(opening.modelScale >= 0.9);
  assert.ok(opening.opacity >= 0.9);

  assert.ok(retreat.modelX >= 1.7);
  assert.ok(retreat.modelScale <= 0.62);
  assert.ok(retreat.opacity <= 0.58);
  assert.ok(retreat.cameraZ >= 4.8);

  assert.ok(readable.modelX >= 2.05);
  assert.ok(readable.modelScale <= 0.42);
  assert.ok(readable.opacity <= 0.18);
  assert.ok(readable.cameraZ >= 5.4);

  assert.ok(silhouette.modelX >= 2.3);
  assert.ok(silhouette.modelScale <= 0.32);
  assert.ok(silhouette.opacity <= 0.08);
  assert.ok(ending.modelX >= 2.5);
  assert.ok(ending.opacity <= 0.05);
});

test("scene composition exposes a significant rightward retreat in screen space", async () => {
  const { sampleSceneFrame, sceneCompositionFor } = await import(sceneModuleUrl.href);
  const opening = sceneCompositionFor(sampleSceneFrame(0));
  const retreat = sceneCompositionFor(sampleSceneFrame(0.22));
  const readable = sceneCompositionFor(sampleSceneFrame(0.52));

  assert.equal(opening.normalizedHorizontalOffset, 0);
  assert.ok(retreat.cameraLookAtX >= sampleSceneFrame(0.22).modelX * 0.06);
  assert.ok(retreat.cameraLookAtX <= sampleSceneFrame(0.22).modelX * 0.1);
  assert.ok(retreat.normalizedHorizontalOffset >= 0.3);
  assert.ok(readable.normalizedHorizontalOffset > retreat.normalizedHorizontalOffset);
});

test("static scene keeps a small visible avatar without changing the full scroll curve", async () => {
  const { sampleSceneFrame, staticSceneProgress } = await import(sceneModuleUrl.href);
  const progress = staticSceneProgress();
  const frame = sampleSceneFrame(progress);

  assert.equal(progress, 0.34);
  assert.ok(frame.opacity >= 0.2 && frame.opacity <= 0.4);
  assert.ok(frame.modelScale <= 0.55);
  assert.ok(frame.modelX >= 1.3);
});

test("scene root never aria-hides its accessible skip button", async () => {
  const { initHomeScene } = await import(sceneModuleUrl.href);
  const harness = createHarness({ desktop: false });
  const controller = initHomeScene(harness.home, harness.deps);
  await controller.ready;

  const skip = controller.layer.querySelector(".x7-home-scene__skip");
  for (let ancestor = skip.parentNode; ancestor; ancestor = ancestor.parentNode) {
    assert.notEqual(ancestor.getAttribute("aria-hidden"), "true");
  }
  for (const selector of [
    ".x7-home-scene__webgl",
    ".x7-home-scene__particles",
    ".x7-home-scene__vignette",
    ".x7-home-scene__loading",
  ]) {
    assert.equal(controller.layer.querySelector(selector).getAttribute("aria-hidden"), "true");
  }
  controller.destroy();
});

test("sceneModeFor drives initialization and static loading renders a visible frame without a RAF", async () => {
  const { initHomeScene } = await import(sceneModuleUrl.href);
  const particles = createHarness({ desktop: false });
  const particleController = initHomeScene(particles.home, particles.deps);
  await particleController.ready;
  assert.equal(particleController.layer.dataset.mode, "particles");
  assert.equal(particles.moduleLoads, 0);
  assert.equal(particles.rafCallbacks.size, 1);
  particleController.destroy();

  const staticHarness = createHarness({ reducedMotion: true, deferFetch: true });
  const staticController = initHomeScene(staticHarness.home, staticHarness.deps);
  await flushAsyncWork();
  assert.equal(staticHarness.fetchCalls, 1);
  assert.equal(staticHarness.rafCallbacks.size, 0, "hidden particles must not animate during static load");
  staticHarness.resolveFetch();
  await staticController.ready;
  assert.equal(staticController.layer.dataset.mode, "static");
  assert.ok(staticHarness.model.material.opacity >= 0.2);
  assert.ok(staticHarness.model.material.opacity <= 0.4);
  assert.ok(staticHarness.model.position.x >= 1.3);
  assert.equal(staticHarness.rafCallbacks.size, 0);
  staticController.destroy();
});

test("live capability changes stop obsolete WebGL and recover without duplicate RAFs", async () => {
  const { initHomeScene } = await import(sceneModuleUrl.href);
  const harness = createHarness();
  const controller = initHomeScene(harness.home, harness.deps);
  await controller.ready;
  assert.equal(harness.rafCallbacks.size, 1);
  assert.equal(harness.rendererCanvases.length, 1);

  harness.desktopPreference.set(false);
  await controller.whenIdle();
  assert.equal(controller.layer.dataset.mode, "particles");
  assert.equal(harness.disposals.renderer, 1);
  assert.equal(harness.rafCallbacks.size, 1);

  harness.desktopPreference.set(true);
  await controller.whenIdle();
  assert.equal(controller.layer.dataset.mode, "full");
  assert.equal(harness.rendererCanvases.length, 2);
  assert.equal(harness.rafCallbacks.size, 1);

  harness.reducedPreference.set(true);
  await controller.whenIdle();
  assert.equal(controller.layer.dataset.mode, "static");
  assert.equal(harness.rafCallbacks.size, 0);

  harness.reducedPreference.set(false);
  await controller.whenIdle();
  assert.equal(controller.layer.dataset.mode, "full");
  assert.equal(harness.rafCallbacks.size, 1);

  harness.connection.saveData = true;
  harness.connection.set(false);
  await controller.whenIdle();
  assert.equal(controller.layer.dataset.mode, "particles");
  assert.equal(harness.rafCallbacks.size, 1);

  harness.connection.saveData = false;
  harness.connection.set(false);
  await controller.whenIdle();
  assert.equal(controller.layer.dataset.mode, "full");
  assert.equal(harness.rafCallbacks.size, 1);

  controller.destroy();
  assert.equal(harness.desktopPreference.listeners.size, 0);
  assert.equal(harness.reducedPreference.listeners.size, 0);
  assert.equal(harness.connection.listeners.size, 0);
});

test("model rejection degrades to particles and preserves the scene background", async () => {
  const { initHomeScene } = await import(sceneModuleUrl.href);
  const harness = createHarness({ rejectModel: true });
  const controller = initHomeScene(harness.home, harness.deps);
  await controller.ready;

  assert.equal(controller.layer.dataset.mode, "particles");
  assert.equal(harness.document.body.children[0], controller.layer);
  assert.ok(controller.layer.querySelector(".x7-home-scene__particles"));
  controller.destroy();
});

test("x7 scene progress events update the target without owning scroll math", async () => {
  const { initHomeScene } = await import(sceneModuleUrl.href);
  const harness = createHarness();
  const controller = initHomeScene(harness.home, harness.deps);
  await controller.ready;
  const initialTarget = harness.cameraLookTargets.at(-1);
  const progressEvent = new Event("x7:scene-progress");
  Object.defineProperty(progressEvent, "detail", { value: { progress: 0.82 } });
  harness.home.dispatchEvent(progressEvent);

  const [frameId, callback] = harness.rafCallbacks.entries().next().value;
  harness.rafCallbacks.delete(frameId);
  callback(16);

  assert.notDeepEqual(harness.cameraLookTargets.at(-1), initialTarget);
  assert.equal(harness.rafCallbacks.size, 1);
  controller.destroy();
});

test("model timeout aborts the fetch", async () => {
  const { initHomeScene } = await import(sceneModuleUrl.href);
  const harness = createHarness({ deferFetch: true, loadTimeoutMs: 2 });
  const controller = initHomeScene(harness.home, harness.deps);
  await controller.ready;

  assert.equal(harness.aborts, 1);
  assert.equal(controller.layer.dataset.mode, "particles");
  controller.destroy();
});

test("destroy aborts an in-flight model and late data never mounts", async () => {
  const { initHomeScene } = await import(sceneModuleUrl.href);
  const harness = createHarness({ deferFetch: true });
  const controller = initHomeScene(harness.home, harness.deps);
  await flushAsyncWork();
  assert.equal(harness.fetchCalls, 1);

  controller.destroy();
  assert.equal(harness.aborts, 1);
  harness.resolveFetch();
  await controller.ready;
  assert.equal(harness.document.body.children.length, 0);
  assert.equal(harness.rendererCanvases.length, 0);
});

test("permanent cleanup disposes geometry, material, and each shared texture once", async () => {
  const { initHomeScene } = await import(sceneModuleUrl.href);
  const harness = createHarness();
  const controller = initHomeScene(harness.home, harness.deps);
  await controller.ready;
  controller.destroy();

  assert.deepEqual(harness.disposals, {
    geometry: 1,
    material: 1,
    renderer: 1,
    texture: 1,
  });
});

test("pagehide and WebGL context cycles retain exactly one RAF", async () => {
  const { initHomeScene } = await import(sceneModuleUrl.href);
  const harness = createHarness();
  const controller = initHomeScene(harness.home, harness.deps);
  await controller.ready;

  harness.window.dispatchEvent(new Event("pagehide"));
  assert.equal(harness.rafCallbacks.size, 0);
  assert.equal(harness.cancelledFrames.length, 1);
  harness.window.dispatchEvent(new Event("pageshow"));
  assert.equal(harness.rafCallbacks.size, 1);

  const canvas = harness.rendererCanvases.at(-1);
  const lost = new Event("webglcontextlost", { cancelable: true });
  canvas.dispatchEvent(lost);
  canvas.dispatchEvent(new Event("webglcontextrestored"));
  canvas.dispatchEvent(new Event("webglcontextrestored"));
  assert.equal(lost.defaultPrevented, true);
  assert.equal(harness.rafCallbacks.size, 1);
  controller.destroy();
});

test("initial camera targets the framed model instead of a detached fixed point", async () => {
  const { initHomeScene } = await import(sceneModuleUrl.href);
  const harness = createHarness();
  const controller = initHomeScene(harness.home, harness.deps);
  await controller.ready;

  const target = harness.cameraLookTargets.at(-1);
  assert.equal(target.x, harness.model.position.x);
  assert.equal(target.y, harness.model.position.y);
  assert.equal(target.z, harness.model.position.z);
  controller.destroy();
});

test("scene loading and skip controls remain legible and interactive", async () => {
  const css = await readFile(sceneCssUrl, "utf8");
  assert.match(css, /\.x7-home-scene__loading\s*\{/);
  assert.match(css.match(/\.x7-home-scene__skip\s*\{\s*top:[^}]*\}/)?.[0] || "", /pointer-events:\s*auto/);
  const canvasRule = css.match(/\.x7-home-scene__webgl canvas\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(canvasRule, /display:\s*block/);
  assert.match(canvasRule, /width:\s*100%/);
  assert.match(canvasRule, /height:\s*100%/);
});
