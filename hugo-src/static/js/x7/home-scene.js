const THREE_URL = "https://esm.sh/three@0.160.0";
const GLTF_LOADER_URL = "https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";
const DESKTOP_QUERY = "(min-width: 30rem)";
const REDUCE_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const LOAD_TIMEOUT_MS = 12_000;
const STATIC_SCENE_PROGRESS = 0.34;
const CAMERA_MODEL_FOLLOW = 0.08;
const disposedModels = new WeakSet();

const sceneFrames = [
  { p: 0, cameraX: 1.55, cameraY: 1.35, cameraZ: 4.55, fov: 42, modelX: 0, modelY: 0.16, modelScale: 1.08, opacity: 1 },
  { p: 0.22, cameraX: 0.45, cameraY: 1.25, cameraZ: 5.1, fov: 44, modelX: 1.7, modelY: -0.04, modelScale: 0.58, opacity: 0.52 },
  { p: 0.52, cameraX: -0.2, cameraY: 1.05, cameraZ: 5.6, fov: 46, modelX: 2.05, modelY: 0.06, modelScale: 0.38, opacity: 0.16 },
  { p: 0.82, cameraX: 0.3, cameraY: 1.14, cameraZ: 6, fov: 48, modelX: 2.3, modelY: 0.12, modelScale: 0.3, opacity: 0.07 },
  { p: 1, cameraX: 0.55, cameraY: 1.2, cameraZ: 6.4, fov: 50, modelX: 2.5, modelY: 0.16, modelScale: 0.26, opacity: 0.04 },
];

export function clampSceneProgress(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

export function sceneModeFor({ desktop, reducedMotion, saveData }) {
  if (reducedMotion) return "static";
  if (!desktop || saveData) return "particles";
  return "full";
}

export function staticSceneProgress() {
  return STATIC_SCENE_PROGRESS;
}

export function sceneCompositionFor(frame) {
  const cameraLookAtX = frame.modelX * CAMERA_MODEL_FOLLOW;
  const cameraLookAtY = frame.modelY;
  return {
    cameraLookAtX,
    cameraLookAtY,
    normalizedHorizontalOffset: (frame.modelX - cameraLookAtX) / Math.max(0.0001, frame.cameraZ),
  };
}

export function sampleSceneFrame(progress) {
  const p = clampSceneProgress(progress);
  if (p === 0) return { ...sceneFrames[0] };
  const foundIndex = sceneFrames.findIndex((frame) => frame.p >= p);
  const upperIndex = foundIndex < 0 ? sceneFrames.length - 1 : foundIndex;
  const start = sceneFrames[Math.max(0, upperIndex - 1)];
  const end = sceneFrames[upperIndex];
  const local = (p - start.p) / Math.max(0.0001, end.p - start.p);
  const eased = local * local * (3 - 2 * local);
  return Object.fromEntries(Object.keys(start).map((key) => [
    key,
    key === "p" ? p : start[key] + (end[key] - start[key]) * eased,
  ]));
}

function browserDependencies(overrides = {}) {
  const windowRef = overrides.window ?? window;
  const documentRef = overrides.document ?? windowRef.document;
  return {
    AbortController: overrides.AbortController ?? windowRef.AbortController,
    cancelAnimationFrame: overrides.cancelAnimationFrame ?? windowRef.cancelAnimationFrame.bind(windowRef),
    clearTimeout: overrides.clearTimeout ?? windowRef.clearTimeout.bind(windowRef),
    console: overrides.console ?? windowRef.console,
    document: documentRef,
    fetch: overrides.fetch ?? windowRef.fetch?.bind(windowRef),
    importModules: overrides.importModules ?? (async () => {
      const [THREE, { GLTFLoader }] = await Promise.all([
        import(THREE_URL),
        import(GLTF_LOADER_URL),
      ]);
      return { THREE, GLTFLoader };
    }),
    loadTimeoutMs: overrides.loadTimeoutMs ?? LOAD_TIMEOUT_MS,
    matchMedia: overrides.matchMedia ?? windowRef.matchMedia.bind(windowRef),
    navigator: overrides.navigator ?? windowRef.navigator,
    requestAnimationFrame: overrides.requestAnimationFrame ?? windowRef.requestAnimationFrame.bind(windowRef),
    setTimeout: overrides.setTimeout ?? windowRef.setTimeout.bind(windowRef),
    window: windowRef,
  };
}

function createLayer(documentRef) {
  const layer = documentRef.createElement("div");
  layer.className = "x7-home-scene";
  layer.dataset.x7HomeScene = "";
  layer.setAttribute("data-x7-home-scene", "");
  layer.setAttribute("role", "presentation");

  const visual = (tagName, className) => {
    const element = documentRef.createElement(tagName);
    element.className = className;
    element.setAttribute("aria-hidden", "true");
    return element;
  };
  const webgl = visual("div", "x7-home-scene__webgl");
  const particles = visual("canvas", "x7-home-scene__particles");
  const vignette = visual("div", "x7-home-scene__vignette");
  const loading = visual("div", "x7-home-scene__loading");
  loading.textContent = "正在构建场景";
  const skip = documentRef.createElement("button");
  skip.className = "x7-home-scene__skip";
  skip.type = "button";
  skip.textContent = "跳过开场";
  skip.setAttribute("aria-label", "跳过 3D 开场动画");

  layer.appendChild(webgl);
  layer.appendChild(particles);
  layer.appendChild(vignette);
  layer.appendChild(loading);
  layer.appendChild(skip);
  return { layer, loading, particles, skip, webgl };
}

function promiseWithTimeout(promise, env, message) {
  let timer = 0;
  const timeout = new Promise((_, reject) => {
    timer = env.setTimeout(() => reject(new Error(message)), env.loadTimeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) env.clearTimeout(timer);
  });
}

function disposeModel(model) {
  if (!model || disposedModels.has(model)) return;
  disposedModels.add(model);
  const disposed = new Set();
  const disposeOnce = (resource) => {
    if (!resource?.dispose || disposed.has(resource)) return;
    disposed.add(resource);
    resource.dispose();
  };
  model.traverse?.((node) => {
    disposeOnce(node.geometry);
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.filter(Boolean).forEach((material) => {
      Object.values(material).forEach((value) => {
        if (value?.isTexture) disposeOnce(value);
      });
      disposeOnce(material);
    });
  });
}

function frameModel(THREE, model) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const largest = Math.max(size.x, size.y, size.z) || 1;
  model.position.sub(center);
  model.scale.setScalar(2.25 / largest);
}

function createSecurityCore(THREE) {
  const group = new THREE.Group();
  const materials = [];
  const addMaterial = (material) => {
    materials.push(material);
    return material;
  };
  const cyan = new THREE.Color(0x65ecff);
  const green = new THREE.Color(0x72ffbb);
  const amber = new THREE.Color(0xffc66d);

  const coreMaterial = addMaterial(new THREE.MeshPhysicalMaterial({
    color: 0x061114,
    emissive: 0x163f46,
    emissiveIntensity: 0.62,
    metalness: 0.25,
    roughness: 0.18,
    transmission: 0.28,
    transparent: true,
    opacity: 0.88,
  }));
  const shellMaterial = addMaterial(new THREE.MeshBasicMaterial({
    color: cyan,
    transparent: true,
    opacity: 0.18,
    wireframe: true,
  }));
  const ringMaterial = addMaterial(new THREE.MeshBasicMaterial({
    color: cyan,
    transparent: true,
    opacity: 0.46,
  }));
  const accentMaterial = addMaterial(new THREE.MeshBasicMaterial({
    color: green,
    transparent: true,
    opacity: 0.5,
  }));
  const amberMaterial = addMaterial(new THREE.MeshBasicMaterial({
    color: amber,
    transparent: true,
    opacity: 0.34,
  }));

  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.72, 2), coreMaterial);
  core.rotation.set(0.2, -0.4, 0.12);
  group.add(core);

  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1.12, 1), shellMaterial);
  shell.rotation.set(-0.4, 0.2, 0.35);
  group.add(shell);

  [
    { radius: 1.52, tube: 0.008, y: 0, z: 0, material: ringMaterial },
    { radius: 1.85, tube: 0.006, y: Math.PI / 2.5, z: 0.34, material: accentMaterial },
    { radius: 2.18, tube: 0.005, y: -Math.PI / 2.8, z: -0.24, material: amberMaterial },
  ].forEach((ring) => {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(ring.radius, ring.tube, 8, 160), ring.material);
    mesh.rotation.set(Math.PI / 2.2, ring.y, ring.z);
    group.add(mesh);
  });

  for (let index = 0; index < 18; index += 1) {
    const angle = (Math.PI * 2 * index) / 18;
    const radius = 1.42 + (index % 3) * 0.28;
    const height = 0.22 + (index % 5) * 0.1;
    const material = index % 4 === 0 ? amberMaterial : accentMaterial;
    const node = new THREE.Mesh(new THREE.BoxGeometry(0.018, height, 0.018), material);
    node.position.set(Math.cos(angle) * radius, -0.62 + (index % 4) * 0.38, Math.sin(angle) * radius);
    node.rotation.set(0.4, -angle, 0.2);
    group.add(node);
  }

  const particleGeometry = new THREE.BufferGeometry();
  const positions = [];
  for (let index = 0; index < 96; index += 1) {
    const angle = index * 2.39996;
    const radius = 0.9 + ((index * 37) % 100) / 55;
    positions.push(
      Math.cos(angle) * radius,
      -1.15 + ((index * 17) % 100) / 45,
      Math.sin(angle) * radius,
    );
  }
  particleGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const particleMaterial = addMaterial(new THREE.PointsMaterial({
    color: cyan,
    size: 0.024,
    transparent: true,
    opacity: 0.62,
    sizeAttenuation: true,
  }));
  group.add(new THREE.Points(particleGeometry, particleMaterial));

  group.userData.x7Materials = materials;
  group.userData.x7Animate = (progress) => {
    core.rotation.y = progress * 1.2;
    shell.rotation.y = -0.35 + progress * 0.9;
    shell.rotation.z = 0.35 + progress * 0.28;
  };
  return group;
}

function modelResourcePath(modelUrl, baseUrl) {
  try {
    return new URL(".", new URL(modelUrl, baseUrl)).href;
  } catch {
    return "";
  }
}

export function initHomeScene(home, overrides = {}) {
  if (!home) return null;
  const env = browserDependencies(overrides);
  if (env.document.querySelector("[data-x7-home-scene]")) return null;

  const { layer, loading, particles, skip, webgl } = createLayer(env.document);
  env.document.body.appendChild(layer);
  layer.dataset.entry = "running";
  layer.dataset.state = "particles";

  const desktopPreference = env.matchMedia(DESKTOP_QUERY);
  const reducedPreference = env.matchMedia(REDUCE_MOTION_QUERY);
  const connection = env.navigator.connection;
  const particleContext = particles.getContext("2d", { alpha: true });
  const particlePoints = Array.from({ length: 64 }, (_, index) => ({
    x: ((index * 47) % 101) / 101,
    y: ((index * 71) % 103) / 103,
    phase: index * 0.67,
    radius: 0.45 + (index % 5) * 0.18,
  }));

  let activeAbortController = null;
  let camera = null;
  let contextListeners = null;
  let currentMode = "particles";
  let destroyed = false;
  let frameId = 0;
  let generation = 0;
  let lastTransition = Promise.resolve();
  let model = null;
  let modelBasePosition = { x: 0, y: 0, z: 0 };
  let modelBaseScale = 1;
  let modelMaterials = [];
  let modules = null;
  let modulePromise = null;
  let particleHeight = 1;
  let particleWidth = 1;
  let paused = false;
  let renderedProgress = 0;
  let renderer = null;
  let scene = null;
  let targetProgress = 0;
  let warned = false;
  let webglAvailable = false;

  const warnOnce = (error) => {
    if (warned) return;
    warned = true;
    env.console?.warn?.("X7 fullscreen scene fell back to particles", error);
  };

  const resizeParticles = () => {
    particleWidth = Math.max(1, Math.floor(env.window.innerWidth || 1));
    particleHeight = Math.max(1, Math.floor(env.window.innerHeight || 1));
    const dpr = Math.min(env.window.devicePixelRatio || 1, 2);
    particles.width = Math.floor(particleWidth * dpr);
    particles.height = Math.floor(particleHeight * dpr);
    particles.style.width = `${particleWidth}px`;
    particles.style.height = `${particleHeight}px`;
    particleContext?.setTransform?.(dpr, 0, 0, dpr, 0, 0);
  };

  const drawParticles = (time = 0) => {
    if (!particleContext || currentMode === "static") return;
    particleContext.clearRect(0, 0, particleWidth, particleHeight);
    particleContext.globalCompositeOperation = "lighter";
    particlePoints.forEach((point) => {
      const x = point.x * particleWidth;
      const y = (point.y * particleHeight + time * (0.003 + point.radius * 0.002)) % particleHeight;
      const alpha = 0.025 + (Math.sin(time * 0.0007 + point.phase) + 1) * 0.025;
      particleContext.beginPath();
      particleContext.fillStyle = `rgba(116, 235, 255, ${alpha})`;
      particleContext.arc(x, y, point.radius, 0, Math.PI * 2);
      particleContext.fill();
    });
  };

  const resizeRenderer = () => {
    if (!renderer || !camera) return;
    const rect = webgl.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };

  const applyFrame = (frame) => {
    if (!camera || !model) return;
    camera.position.set(frame.cameraX, frame.cameraY, frame.cameraZ);
    camera.fov = frame.fov;
    camera.updateProjectionMatrix();
    model.position.x = modelBasePosition.x + frame.modelX;
    model.position.y = modelBasePosition.y + frame.modelY;
    model.position.z = modelBasePosition.z;
    model.scale.setScalar(modelBaseScale * frame.modelScale);
    model.rotation.y = -0.16 + frame.p * 0.24;
    model.userData?.x7Animate?.(frame.p);
    const composition = sceneCompositionFor(frame);
    camera.lookAt(
      modelBasePosition.x + composition.cameraLookAtX,
      modelBasePosition.y + composition.cameraLookAtY,
      modelBasePosition.z,
    );
    modelMaterials.forEach((material) => {
      material.transparent = true;
      material.opacity = frame.opacity;
    });
  };

  const renderWebgl = () => {
    if (!webglAvailable || !renderer || !scene || !camera) return;
    if (currentMode === "full") renderedProgress += (targetProgress - renderedProgress) * 0.075;
    const progress = currentMode === "static" ? staticSceneProgress() : renderedProgress;
    applyFrame(sampleSceneFrame(progress));
    renderer.render(scene, camera);
  };

  const stop = () => {
    if (!frameId) return;
    env.cancelAnimationFrame(frameId);
    frameId = 0;
  };
  const tick = (time) => {
    frameId = 0;
    if (destroyed || paused || currentMode === "static") return;
    drawParticles(time);
    try {
      renderWebgl();
    } catch (error) {
      fallbackToParticles(error);
      return;
    }
    frameId = env.requestAnimationFrame(tick);
  };
  const start = () => {
    if (destroyed || paused || currentMode === "static" || frameId) return;
    frameId = env.requestAnimationFrame(tick);
  };

  const abortLoad = () => {
    activeAbortController?.abort();
    activeAbortController = null;
  };
  const disposeWebgl = () => {
    webglAvailable = false;
    if (contextListeners && renderer?.domElement) {
      renderer.domElement.removeEventListener("webglcontextlost", contextListeners.lost);
      renderer.domElement.removeEventListener("webglcontextrestored", contextListeners.restored);
    }
    contextListeners = null;
    renderer?.domElement?.remove?.();
    renderer?.dispose?.();
    disposeModel(model);
    renderer = null;
    model = null;
    modelMaterials = [];
    camera = null;
    scene = null;
  };

  const fallbackToParticles = (error) => {
    if (destroyed) return;
    abortLoad();
    disposeWebgl();
    currentMode = "particles";
    layer.dataset.mode = "particles";
    layer.dataset.state = "fallback";
    loading.hidden = true;
    warnOnce(error);
    start();
  };

  const loadModules = async () => {
    if (modules) return modules;
    if (!modulePromise) {
      modulePromise = promiseWithTimeout(
        env.importModules(),
        env,
        "X7 scene module load timed out",
      );
    }
    try {
      modules = await modulePromise;
      return modules;
    } finally {
      modulePromise = null;
    }
  };

  const fetchAndParseModel = async (loader, token) => {
    if (!env.fetch || !env.AbortController || typeof loader.parseAsync !== "function") {
      return promiseWithTimeout(
        loader.loadAsync(home.dataset.modelUrl),
        env,
        "X7 scene model load timed out",
      );
    }

    const controller = new env.AbortController();
    activeAbortController = controller;
    let timer = 0;
    const download = (async () => {
      const response = await env.fetch(home.dataset.modelUrl, { signal: controller.signal });
      if (!response?.ok) throw new Error(`X7 scene model request failed (${response?.status || "network"})`);
      const buffer = await response.arrayBuffer();
      return loader.parseAsync(
        buffer,
        modelResourcePath(home.dataset.modelUrl, env.window.location?.href),
      );
    })();
    download.then((gltf) => {
      if (controller.signal.aborted && token === generation) disposeModel(gltf.scene);
    }).catch(() => {});
    const timeout = new Promise((_, reject) => {
      timer = env.setTimeout(() => {
        controller.abort();
        reject(new Error("X7 scene model load timed out"));
      }, env.loadTimeoutMs);
    });
    try {
      return await Promise.race([download, timeout]);
    } finally {
      if (timer) env.clearTimeout(timer);
      if (activeAbortController === controller) activeAbortController = null;
    }
  };

  const buildWebgl = async (token) => {
    const { THREE, GLTFLoader } = await loadModules();
    if (destroyed || token !== generation) return;
    const useSecurityCore = home.dataset.sceneObject === "security-core";
    if (useSecurityCore) {
      model = createSecurityCore(THREE);
    } else {
      const loader = new GLTFLoader();
      const gltf = await fetchAndParseModel(loader, token);
      if (destroyed || token !== generation) {
        disposeModel(gltf.scene);
        return;
      }
      model = gltf.scene;
      frameModel(THREE, model);
    }
    modelBaseScale = model.scale.x || 1;
    modelBasePosition = {
      x: model.position.x || 0,
      y: model.position.y || 0,
      z: model.position.z || 0,
    };
    modelMaterials = [];
    model.traverse?.((node) => {
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      modelMaterials.push(...materials.filter(Boolean));
    });
    modelMaterials.push(...(model.userData?.x7Materials || []));
    modelMaterials = Array.from(new Set(modelMaterials));

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(env.window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.32;
    webgl.appendChild(renderer.domElement);
    const ambient = new THREE.HemisphereLight(0xc6f4ff, 0x090b0b, 2.1);
    const key = new THREE.DirectionalLight(0xffffff, 3.1);
    const rim = new THREE.DirectionalLight(0x62f1ff, 1.85);
    const fill = new THREE.DirectionalLight(0xffd8a4, 0.95);
    key.position.set(2.5, 3.5, 4);
    rim.position.set(-3.5, 1.5, -2.5);
    fill.position.set(-2, 1.8, 3);
    scene.add(ambient, key, rim, fill, model);

    const lost = (event) => {
      event.preventDefault();
      webglAvailable = false;
      layer.dataset.state = "context-lost";
    };
    const restored = () => {
      if (destroyed || !renderer) return;
      webglAvailable = true;
      layer.dataset.state = "running";
      resume();
    };
    contextListeners = { lost, restored };
    renderer.domElement.addEventListener("webglcontextlost", lost);
    renderer.domElement.addEventListener("webglcontextrestored", restored);
    webglAvailable = true;
    layer.dataset.state = "running";
    loading.hidden = true;
    resizeRenderer();
    renderWebgl();
  };

  const desiredMode = () => sceneModeFor({
    desktop: desktopPreference.matches,
    reducedMotion: reducedPreference.matches,
    saveData: connection?.saveData === true,
  });

  const applyMode = async (token) => {
    const nextMode = desiredMode();
    currentMode = nextMode;
    layer.dataset.mode = nextMode;
    if (nextMode === "particles") {
      abortLoad();
      disposeWebgl();
      loading.hidden = true;
      layer.dataset.state = "particles";
      start();
      return;
    }
    if (nextMode === "static") stop();
    else start();
    if (!renderer || !model) {
      loading.hidden = false;
      try {
        await buildWebgl(token);
      } catch (error) {
        if (!destroyed && token === generation) fallbackToParticles(error);
        return;
      }
    }
    if (destroyed || token !== generation) return;
    if (nextMode === "static") {
      stop();
      renderWebgl();
    } else {
      start();
    }
  };

  const scheduleMode = () => {
    generation += 1;
    abortLoad();
    const token = generation;
    lastTransition = applyMode(token);
    return lastTransition;
  };

  const finishEntry = () => {
    env.document.documentElement.classList.remove?.("x7-home-entry-prime");
    env.document.documentElement.classList.add("x7-home-entry-complete");
    layer.dataset.entry = "complete";
  };
  const onProgress = (event) => {
    targetProgress = clampSceneProgress(event.detail?.progress ?? event.detail);
  };
  const onPageHide = (event) => {
    if (event.persisted === false) {
      destroy();
      return;
    }
    paused = true;
    stop();
  };
  function resume() {
    paused = env.document.hidden === true;
    if (paused) return;
    try {
      if (currentMode === "static") renderWebgl();
      else start();
    } catch (error) {
      fallbackToParticles(error);
    }
  }
  const onVisibilityChange = () => {
    if (env.document.hidden === true) {
      paused = true;
      stop();
    } else {
      resume();
    }
  };
  const onResize = () => {
    resizeParticles();
    resizeRenderer();
  };

  home.addEventListener("x7:scene-progress", onProgress);
  skip.addEventListener("click", finishEntry, { once: true });
  layer.addEventListener("wheel", finishEntry, { once: true, passive: true });
  env.window.addEventListener("pagehide", onPageHide);
  env.window.addEventListener("pageshow", resume);
  env.window.addEventListener("resize", onResize, { passive: true });
  env.document.addEventListener("visibilitychange", onVisibilityChange);
  desktopPreference.addEventListener?.("change", scheduleMode);
  reducedPreference.addEventListener?.("change", scheduleMode);
  connection?.addEventListener?.("change", scheduleMode);

  resizeParticles();
  scheduleMode();

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    generation += 1;
    stop();
    abortLoad();
    disposeWebgl();
    home.removeEventListener("x7:scene-progress", onProgress);
    env.window.removeEventListener("pagehide", onPageHide);
    env.window.removeEventListener("pageshow", resume);
    env.window.removeEventListener("resize", onResize);
    env.document.removeEventListener("visibilitychange", onVisibilityChange);
    desktopPreference.removeEventListener?.("change", scheduleMode);
    reducedPreference.removeEventListener?.("change", scheduleMode);
    connection?.removeEventListener?.("change", scheduleMode);
    layer.remove();
  }

  return {
    destroy,
    layer,
    get ready() {
      return lastTransition;
    },
    whenIdle() {
      return lastTransition;
    },
  };
}
