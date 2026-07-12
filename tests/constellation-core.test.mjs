import assert from "node:assert/strict";
import test from "node:test";

import {
  createAmbientParticles,
  createQualityDowngrader,
  mapSemanticCenters,
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

test("semantic card centers preserve grid topology in canvas safe bounds", () => {
  for (const columns of [2, 3]) {
    for (const count of [3, 5, 6]) {
      const rects = Array.from({ length: count }, (_, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        return { id: String(index), left: 100 + column * 180, top: 500 + row * 100, width: 140, height: 70 };
      });
      const mapped = mapSemanticCenters(rects, { left: 90, top: 490, width: columns * 180, height: Math.ceil(count / columns) * 100 }, 600, 300, 24);
      assert.equal(mapped.length, count);
      assert.equal(new Set(mapped.map(({ x, y }) => `${x}:${y}`)).size, count);
      assert.ok(mapped.every(({ x, y }) => x >= 24 && x <= 576 && y >= 24 && y <= 276));
      if (count > columns) assert.ok(mapped[columns].y > mapped[0].y);
      if (columns > 1) assert.ok(mapped[1].x > mapped[0].x);
    }
  }
});

test("semantic center mapping rejects unusable geometry", () => {
  assert.deepEqual(mapSemanticCenters([{ id: "a", left: 0, top: 0, width: 1, height: 1 }], { left: 0, top: 0, width: 0, height: 0 }, 300, 200), []);
});

test("semantic center mapping separates exact overlaps", () => {
  const rects = Array.from({ length: 6 }, (_, index) => ({ id: String(index), left: 10, top: 10, width: 20, height: 20 }));
  const mapped = mapSemanticCenters(rects, { left: 0, top: 0, width: 40, height: 40 }, 160, 120, 24);
  assert.equal(new Set(mapped.map(({ x, y }) => `${x}:${y}`)).size, 6);
});

test("collision resolution terminates at every boundary and in tiny safe canvases", { timeout: 500 }, () => {
  for (const [left, top] of [[0, 0], [40, 0], [0, 40], [40, 40]]) {
    const rects = Array.from({ length: 4 }, (_, index) => ({ id: String(index), left, top, width: 0, height: 0 }));
    const mapped = mapSemanticCenters(rects, { left: 0, top: 0, width: 40, height: 40 }, 49, 49, 24);
    assert.equal(mapped.length, 4);
    assert.equal(new Set(mapped.map(({ x, y }) => `${x}:${y}`)).size, 4);
    assert.ok(mapped.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y) && x >= 24 && x <= 25 && y >= 24 && y <= 25));
  }
});

test("collision resolution terminates for 32 identical bottom-right cards", { timeout: 500 }, () => {
  const rects = Array.from({ length: 32 }, (_, index) => ({ id: String(index), left: 40, top: 40, width: 0, height: 0 }));
  const mapped = mapSemanticCenters(rects, { left: 0, top: 0, width: 40, height: 40 }, 49, 49, 24);
  assert.equal(mapped.length, 32);
  assert.equal(new Set(mapped.map(({ x, y }) => `${x}:${y}`)).size, 32);
  assert.ok(mapped.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)));
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
