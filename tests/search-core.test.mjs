import assert from "node:assert/strict";
import test from "node:test";

import { normalizeSearchText, searchDocuments } from "../hugo-src/static/js/x7/search-core.js";
import { createSearchIndexLoader, nextActiveIndex } from "../hugo-src/static/js/x7/search-dialog.js";

const docs = [
  { title: "TLS", url: "/tls/", section: "Security", summary: "Transport security", tags: ["crypto"], updated: "2025-01-01" },
  { title: "TLS internals", url: "/tls-internals/", section: "Security", summary: "Protocol notes", tags: ["network"], updated: "2025-03-01" },
  { title: "Crypto notes", url: "/crypto/", section: "Security", summary: "TLS overview", tags: ["tls"], updated: "2025-02-01" },
  { title: "认证指南", url: "/auth/", section: "安全", summary: "散列与消息认证", tags: ["密码学"], updated: "2025-04-01" },
];

test("normalizes NFKC, locale case, whitespace, and null", () => {
  assert.equal(normalizeSearchText("  ＴＬＳ  "), "tls");
  assert.equal(normalizeSearchText(null), "");
});

test("ranks exact titles above title matches and exact tags", () => {
  assert.deepEqual(searchDocuments(docs, "TLS").map(({ url }) => url), [
    "/tls/",
    "/tls-internals/",
    "/crypto/",
  ]);
});

test("matches Chinese text without word boundaries", () => {
  assert.deepEqual(searchDocuments(docs, "消息认证").map(({ url }) => url), ["/auth/"]);
});

test("requires every whitespace-delimited token somewhere in a document", () => {
  assert.deepEqual(searchDocuments(docs, "TLS protocol").map(({ url }) => url), ["/tls-internals/"]);
});

test("ranks a whole-query exact title above newer token-distributed title matches", () => {
  const competing = [
    { title: "foo xx bar", url: "/partial/", updated: "2026-01-01" },
    { title: "foo bar", url: "/exact/", updated: "2025-01-01" },
  ];
  assert.deepEqual(searchDocuments(competing, "foo bar").map(({ url }) => url), ["/exact/", "/partial/"]);
});

test("applies an exact normalized section filter", () => {
  const mixed = [...docs, { title: "TLS", url: "/other/", section: "Networking", updated: "2026-01-01" }];
  assert.deepEqual(searchDocuments(mixed, "tls", { section: "security" }).map(({ url }) => url), [
    "/tls/",
    "/tls-internals/",
    "/crypto/",
  ]);
});

test("blank queries return recent URLs in requested order then latest fallback with a cap", () => {
  assert.deepEqual(searchDocuments(docs, " ", { recentUrls: ["/crypto/", "/missing/"], limit: 3 }).map(({ url }) => url), [
    "/crypto/",
    "/auth/",
    "/tls-internals/",
  ]);
});

test("uses deterministic updated, title, and permalink tie breakers", () => {
  const tied = [
    { title: "Zulu term", url: "/z/", summary: "term", updated: "2025-01-01" },
    { title: "Alpha term", url: "/b/", summary: "term", updated: "2025-02-01" },
    { title: "Alpha term", url: "/a/", summary: "term", updated: "2025-02-01" },
  ];
  assert.deepEqual(searchDocuments(tied, "term").map(({ url }) => url), ["/a/", "/b/", "/z/"]);
});

test("handles null fields and inputs without mutating source documents", () => {
  const source = [{ title: null, url: "/safe/", section: null, summary: "Needle", tags: null, updated: null }];
  const snapshot = structuredClone(source);
  assert.deepEqual(searchDocuments(source, "needle"), source);
  assert.deepEqual(source, snapshot);
  assert.deepEqual(searchDocuments(null, "needle"), []);
});

test("nextActiveIndex wraps without moving physical focus", () => {
  assert.equal(nextActiveIndex(-1, 3, 1), 0);
  assert.equal(nextActiveIndex(2, 3, 1), 0);
  assert.equal(nextActiveIndex(0, 3, -1), 2);
  assert.equal(nextActiveIndex(0, 0, 1), -1);
});

test("search index loader retries after a failed fetch", async () => {
  let attempts = 0;
  const loader = createSearchIndexLoader(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("offline");
    return { ok: true, json: async () => [{ title: "Recovered" }] };
  }, "/search.json");
  await assert.rejects(loader.load(), /offline/);
  assert.deepEqual(await loader.load(), [{ title: "Recovered" }]);
  assert.equal(attempts, 2);
});
