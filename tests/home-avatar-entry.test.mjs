import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const homePartialPath = new URL("../hugo-src/layouts/partials/x7/home-constellation.html", import.meta.url);
const homeScriptPath = new URL("../hugo-src/static/js/x7/home.js", import.meta.url);

test("homepage configures one persistent root scene without a hero-contained stage", async () => {
  const [html, homeScript] = await Promise.all([
    readFile(homePartialPath, "utf8"),
    readFile(homeScriptPath, "utf8"),
  ]);

  assert.match(html, /data-x7-home/);
  assert.match(html, /data-model-url="{{ "models\/x7-avatar-entry\.glb" \| relURL }}"/);
  assert.match(html, /data-reference-url="{{ "images\/x7-avatar-reference\.png" \| relURL }}"/);
  assert.doesNotMatch(html, /x7-avatar-entry__stage/);
  assert.match(homeScript, /import\("\.\/home-scene\.js"\)/);
  assert.doesNotMatch(homeScript, /home-avatar-entry\.js/);
  assert.doesNotMatch(
    homeScript,
    /function initParticleField|PARTICLE_FOCUS|getParticleFocusDuration/,
    "the obsolete hero particle runtime must be removed",
  );
});

test("persistent scene initialization is independent from the session intro timeline", async () => {
  const script = await readFile(homeScriptPath, "utf8");
  const sceneImport = script.indexOf('import("./home-scene.js")');
  const sceneInitialization = script.search(/module\.initHomeScene\s*\(\s*home(?:\s*,|\s*\))/);
  const reducedMotionEntryGate = script.indexOf("if (reduceMotion)");
  const sessionIntroState = script.search(/sessionStorage|x7-home-entry-complete/);

  assert.ok(sceneImport >= 0, "home initializer should import the persistent scene");
  assert.ok(sceneInitialization >= 0, "home initializer should call initHomeScene(home)");
  assert.ok(
    sceneImport < sceneInitialization,
    "persistent scene should be imported before it is initialized",
  );
  assert.ok(
    sceneInitialization < reducedMotionEntryGate,
    "persistent scene should initialize before the intro timeline can return early",
  );
  assert.ok(
    sessionIntroState < 0 || sceneInitialization < sessionIntroState,
    "session intro state must not gate persistent scene initialization",
  );
});

test("avatar entry assets exist and model size is explicit", async () => {
  const model = await stat(new URL("../hugo-src/static/models/x7-avatar-entry.glb", import.meta.url));
  const reference = await stat(new URL("../hugo-src/static/images/x7-avatar-reference.png", import.meta.url));

  assert.ok(model.size > 25_000_000, "model should be the provided Meshy GLB");
  assert.ok(model.size < 35_000_000, "model should not be accidentally duplicated or replaced by a huge export");
  assert.ok(reference.size > 500_000, "reference image should be present");
  assert.ok(reference.size < 2_000_000, "reference image should stay web-reasonable");
});
