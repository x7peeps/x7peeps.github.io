import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cssPath = new URL("../hugo-src/static/css/x7-home.css", import.meta.url);
const scriptPath = new URL("../hugo-src/static/js/x7/home.js", import.meta.url);

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
