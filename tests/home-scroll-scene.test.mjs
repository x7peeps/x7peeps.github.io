import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sceneModuleUrl = new URL("../hugo-src/static/js/x7/home-scene.js", import.meta.url);
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

test("sceneModeFor drives initialization and static loading owns no particle RAF", async () => {
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
