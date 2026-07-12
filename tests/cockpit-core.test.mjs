import test from "node:test";
import assert from "node:assert/strict";

import {
  activeHeadingIndex,
  matchesTreeQuery,
  readingProgress,
} from "../hugo-src/static/js/x7/cockpit.js";

test("readingProgress returns a rounded, clamped percentage", () => {
  assert.equal(readingProgress(50, 100, 20), 63);
  assert.equal(readingProgress(-20, 100, 20), 0);
  assert.equal(readingProgress(200, 100, 20), 100);
});

test("readingProgress safely handles unusable dimensions", () => {
  assert.equal(readingProgress(10, 0, 0), 0);
  assert.equal(readingProgress(10, 20, 20), 0);
  assert.equal(readingProgress(Number.NaN, 100, 20), 0);
  assert.equal(readingProgress(10, Number.POSITIVE_INFINITY, 20), 0);
});

test("matchesTreeQuery trims and NFKC/case normalizes values", () => {
  assert.equal(matchesTreeQuery("  ＡＧＥＮＴ ", "Building an agent system"), true);
  assert.equal(matchesTreeQuery("知识", "AI 知识库"), true);
  assert.equal(matchesTreeQuery("missing", "AI 知识库"), false);
});

test("matchesTreeQuery treats a blank query as match-all and nulls safely", () => {
  assert.equal(matchesTreeQuery("   ", null), true);
  assert.equal(matchesTreeQuery(null, "anything"), true);
  assert.equal(matchesTreeQuery("query", null), false);
});

test("activeHeadingIndex selects the last heading at or above the offset", () => {
  assert.equal(activeHeadingIndex([80, 160, 240], 120), 0);
  assert.equal(activeHeadingIndex([80, 160, 240], 160), 1);
  assert.equal(activeHeadingIndex([80, 160, 240], 239.9), 1);
});

test("activeHeadingIndex handles positions above and below all boundaries", () => {
  assert.equal(activeHeadingIndex([80, 160, 240], 40), 0);
  assert.equal(activeHeadingIndex([80, 160, 240], 400), 2);
  assert.equal(activeHeadingIndex([], 100), -1);
});
