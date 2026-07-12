import test from "node:test";
import assert from "node:assert/strict";

import { getTaxonomyResultContainer, matchesTaxonomyFilters, normalizeFilterValue } from "../hugo-src/static/js/x7/taxonomy-filter.js";

test("normalizeFilterValue trims, case-folds, and normalizes Unicode", () => {
  assert.equal(normalizeFilterValue("  ＡＧＥＮＴ "), "agent");
  assert.equal(normalizeFilterValue(null), "");
});

test("matchesTaxonomyFilters requires every selected dimension", () => {
  const item = { section: "AI", year: "2026", type: "posts" };
  assert.equal(matchesTaxonomyFilters(item, { section: "ai", year: "2026", type: "posts" }), true);
  assert.equal(matchesTaxonomyFilters(item, { section: "security", year: "2026", type: "posts" }), false);
  assert.equal(matchesTaxonomyFilters(item, { section: "ai", year: "2025", type: "posts" }), false);
  assert.equal(matchesTaxonomyFilters(item, { section: "ai", year: "2026", type: "notes" }), false);
});

test("matchesTaxonomyFilters treats blank dimensions as wildcards", () => {
  assert.equal(matchesTaxonomyFilters({ section: "AI", year: "2026", type: "posts" }, {}), true);
  assert.equal(matchesTaxonomyFilters({}, { section: "", year: "", type: "" }), true);
});

test("getTaxonomyResultContainer targets the owning list item with a safe fallback", () => {
  const listItem = { hidden: false };
  const article = { closest: (selector) => selector === "li" ? listItem : null };
  assert.equal(getTaxonomyResultContainer(article), listItem);
  const orphan = { closest: () => null };
  assert.equal(getTaxonomyResultContainer(orphan), orphan);
});
