import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cssPath = new URL("../hugo-src/static/css/x7-home.css", import.meta.url);
const scriptPath = new URL("../hugo-src/static/js/x7/home.js", import.meta.url);
const homePartialPath = new URL("../hugo-src/layouts/partials/x7/home-constellation.html", import.meta.url);

test("heatmap source signature changes when Hugo publishes a new update", async () => {
  const { buildHeatmapSource } = await import(scriptPath);
  const before = buildHeatmapSource([
    { date: "2026-07-22", count: 1 },
    { date: "2026-07-23", count: 2 },
  ]);
  const after = buildHeatmapSource([
    { date: "2026-07-22", count: 1 },
    { date: "2026-07-23", count: 3 },
  ]);

  assert.equal(before.total, 3);
  assert.equal(after.total, 4);
  assert.notEqual(before.signature, after.signature);
});

test("heatmap rebuilds existing cells when its Hugo data signature changes", async () => {
  const script = await readFile(scriptPath, "utf8");

  assert.doesNotMatch(script, /if \(heatmap\.children\.length > 0\) return;/);
  assert.match(script, /heatmap\.dataset\.sourceSignature/);
  assert.match(script, /heatmap\.replaceChildren\(\)/);
});

test("heatmap template renders exactly 365 days ending at the newest article date", async () => {
  const html = await readFile(homePartialPath, "utf8");

  assert.match(html, /\$byLastmod := sort \$byPath "Lastmod" "desc"/);
  assert.match(html, /\$latestHeatmapDate/);
  assert.match(html, /\$start := \$latestHeatmapDate\.AddDate -1 0 1/);
  assert.match(html, /\$heatmapWindowDays := 365/);
  assert.match(html, /seq \$heatmapWindowDays/);
  assert.doesNotMatch(html, /\$now := now/);
  assert.doesNotMatch(html, /seq 371/);
});

test("heatmap reserves a visible square for every day in its generated week grid", async () => {
  const [css, script] = await Promise.all([
    readFile(cssPath, "utf8"),
    readFile(scriptPath, "utf8"),
  ]);
  const heatmapRule = css.match(/\.x7-heatmap\s*\{([^}]*)\}/)?.[1] ?? "";
  const cellRule = css.match(/\.x7-heatmap-cell\s*\{([^}]*)\}/)?.[1] ?? "";

  assert.match(css, /--x7-heatmap-week-count:\s*54;/);
  assert.match(heatmapRule, /width:\s*100%;/);
  assert.match(heatmapRule, /grid-template-columns:\s*repeat\(var\(--x7-heatmap-week-count\),\s*minmax\(0,\s*1fr\)\);/);
  assert.match(heatmapRule, /grid-template-rows:\s*repeat\(7,\s*minmax\(0,\s*1fr\)\);/);
  assert.doesNotMatch(heatmapRule, /mask-image/);
  assert.match(cellRule, /box-sizing:\s*border-box;/);
  assert.match(script, /heatmap\.style\.setProperty\("--x7-heatmap-week-count",\s*String\(weekCount\)\);/);
  assert.match(script, /heatmap\.style\.aspectRatio\s*=\s*`\$\{weekCount\}\s*\/\s*7`;/);
});

test("heatmap panel remains a dark field instead of a translucent blue card", async () => {
  const css = await readFile(cssPath, "utf8");
  const panelRule = css.match(/\.x7-heatmap-panel\s*\{([^}]*)\}/)?.[1] ?? "";

  assert.match(panelRule, /border-inline:\s*0;/);
  assert.match(panelRule, /rgb\(0 2 3 \/ 72%\)/);
  assert.doesNotMatch(panelRule, /backdrop-filter/);
  assert.equal([...css].reduce((depth, char) => depth + (char === "{" ? 1 : char === "}" ? -1 : 0), 0), 0);
});

test("avatar entry does not replace heatmap or recent update rendering", async () => {
  const [html, script] = await Promise.all([
    readFile(homePartialPath, "utf8"),
    readFile(scriptPath, "utf8"),
  ]);

  assert.match(html, /id="x7-heatmap"/);
  assert.match(html, /id="recent-updates"/);
  assert.match(html, /data-x7-latest-link/);
  assert.match(script, /window\.__heatmapDays/);
  assert.match(script, /heatmap\.appendChild\(frag\)/);
});
