import assert from "node:assert/strict";
import test from "node:test";

import { initConstellation } from "../hugo-src/static/js/x7/constellation.js";

test("static constellation enhancement is inert without a DOM", () => {
  const before = new Set(Reflect.ownKeys(globalThis));
  const cleanup = initConstellation();

  assert.equal(typeof cleanup, "function");
  assert.doesNotThrow(() => cleanup());
  assert.deepEqual(new Set(Reflect.ownKeys(globalThis)), before);
});
