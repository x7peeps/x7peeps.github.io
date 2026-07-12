import assert from "node:assert/strict";
import test from "node:test";

import {
  createAmbientParticles,
  createQualityDowngrader,
  placeNodes,
  qualityFor,
} from "../hugo-src/static/js/x7/constellation-core.js";

test("reduced motion and save-data disable animation", () => {
  for (const options of [{ reducedMotion: true }, { saveData: true }]) {
    assert.deepEqual(qualityFor({ width: 1200, deviceMemory: 8, ...options }), {
      animated: false, particles: 0, blur: 0, dprCap: 1,
    });
  }
});

test("quality tiers are bounded and tolerate non-finite input", () => {
  assert.deepEqual(qualityFor({ width: 390, deviceMemory: 4 }), { animated: true, particles: 40, blur: 2, dprCap: 1.5 });
  assert.deepEqual(qualityFor({ width: 1600, deviceMemory: 2 }), { animated: true, particles: 40, blur: 2, dprCap: 1.5 });
  assert.deepEqual(qualityFor({ width: 1600, deviceMemory: 8 }), { animated: true, particles: 120, blur: 6, dprCap: 2 });
  assert.deepEqual(qualityFor({ width: Number.NaN, deviceMemory: Infinity }), { animated: true, particles: 40, blur: 2, dprCap: 1.5 });
});

test("node layout is deterministic, bounded, and collision-free for varied counts", () => {
  for (const count of [1, 3, 5, 6]) {
    const input = Array.from({ length: count }, (_, id) => ({ id: String(id) }));
    const first = placeNodes(input, 600, 300);
    assert.deepEqual(first, placeNodes(input, 600, 300));
    assert.equal(new Set(first.map(({ x, y }) => `${x}:${y}`)).size, count);
    for (const node of first) {
      assert.ok(node.x >= 24 && node.x <= 576);
      assert.ok(node.y >= 24 && node.y <= 276);
    }
  }
});

test("ambient particles are seeded and never use unstable positions", () => {
  const first = createAmbientParticles(4, 300, 200, 123);
  assert.deepEqual(first, createAmbientParticles(4, 300, 200, 123));
  assert.notDeepEqual(first, createAmbientParticles(4, 300, 200, 124));
  assert.ok(first.every((p) => p.x >= 0 && p.x <= 300 && p.y >= 0 && p.y <= 200));
});

test("slow-frame downgrade is sustained and monotonic", () => {
  const downgrade = createQualityDowngrader({ particles: 120, blur: 6 }, { sampleSize: 4, threshold: 22 });
  assert.deepEqual([10, 30, 30].map(downgrade).at(-1), { particles: 120, blur: 6 });
  assert.deepEqual(downgrade(30), { particles: 60, blur: 3 });
  for (let i = 0; i < 8; i += 1) downgrade(10);
  assert.deepEqual(downgrade(10), { particles: 60, blur: 3 });
});
