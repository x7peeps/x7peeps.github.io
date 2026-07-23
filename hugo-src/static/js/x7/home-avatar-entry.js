const THREE_URL = "https://esm.sh/three@0.160.0";
const GLTF_LOADER_URL = "https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";
const REDUCE_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const DESKTOP_QUERY = "(min-width: 64rem)";
const SESSION_KEY = "x7-avatar-entry-complete";

export function initAvatarEntry(home, options = {}) {
  const entry = home.querySelector("[data-x7-avatar-entry]");
  if (!entry || entry.dataset.ready === "true") return;
  entry.dataset.ready = "true";

  const root = document.documentElement;
  const reducedMotion = window.matchMedia(REDUCE_MOTION_QUERY).matches;
  const desktop = window.matchMedia(DESKTOP_QUERY).matches;
  const modelUrl = entry.dataset.modelUrl;
  const skip = entry.querySelector(".x7-avatar-entry__skip");
  const stage = entry.querySelector(".x7-avatar-entry__stage");
  const storage = options.storage || window.sessionStorage;
  const key = `${window.relearn?.absBaseUri || location.origin}/${SESSION_KEY}`;

  const complete = () => {
    try {
      storage.setItem(key, "1");
    } catch {
      // Session storage can be blocked in strict privacy modes.
    }
    root.classList.add("x7-avatar-entry-complete");
    entry.dataset.state = "complete";
  };

  const fail = () => {
    root.classList.add("x7-avatar-entry-failed");
    entry.dataset.state = "failed";
    complete();
  };

  try {
    if (storage.getItem(key) === "1") {
      complete();
      return;
    }
  } catch {
    // If storage read fails, continue with the normal defensive path.
  }

  if (!stage || !modelUrl || reducedMotion || !desktop) {
    complete();
    return;
  }

  skip?.addEventListener("click", complete, { once: true });
  entry.addEventListener("wheel", complete, { once: true, passive: true });

  runThreeEntry({ entry, stage, modelUrl, complete, fail });
}

async function runThreeEntry({ entry, stage, modelUrl, complete, fail }) {
  let frame = 0;
  let renderer;

  try {
    const [THREE, { GLTFLoader }] = await Promise.all([
      import(THREE_URL),
      import(GLTF_LOADER_URL),
    ]);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    const loader = new GLTFLoader();
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    stage.appendChild(renderer.domElement);

    const ambient = new THREE.HemisphereLight(0x9fdfff, 0x080a0a, 1.55);
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    const rim = new THREE.DirectionalLight(0x62f1ff, 1.1);
    key.position.set(2.5, 3.5, 4);
    rim.position.set(-3.5, 1.5, -2.5);
    scene.add(ambient, key, rim);

    const gltf = await loader.loadAsync(modelUrl);
    const model = gltf.scene;
    scene.add(model);
    frameModel(THREE, model);
    entry.dataset.state = "running";

    const startedAt = performance.now();
    const duration = 5200;

    const resize = () => {
      const rect = stage.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    const render = (time) => {
      resize();
      const progress = Math.min(1, (time - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const angle = -0.78 + eased * 1.18;
      const radius = 4.8 - eased * 1.15;
      camera.position.set(Math.sin(angle) * radius, 1.2 + eased * 0.28, Math.cos(angle) * radius);
      camera.lookAt(0, 0.95, 0);
      model.rotation.y = -angle * 0.55 + Math.sin(time * 0.0007) * 0.035;
      renderer.render(scene, camera);

      if (progress >= 1) {
        complete();
        return;
      }
      frame = window.requestAnimationFrame(render);
    };

    window.addEventListener("resize", resize, { passive: true });
    frame = window.requestAnimationFrame(render);
    window.addEventListener("pagehide", () => {
      if (frame) window.cancelAnimationFrame(frame);
      renderer?.dispose();
    }, { once: true });
  } catch (error) {
    console.warn("X7 avatar entry failed", error);
    if (frame) window.cancelAnimationFrame(frame);
    renderer?.dispose();
    fail();
  }
}

function frameModel(THREE, model) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const largest = Math.max(size.x, size.y, size.z) || 1;
  const scale = 2.25 / largest;
  model.position.sub(center);
  model.scale.setScalar(scale);
  model.position.y -= 0.15;
}
