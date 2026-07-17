import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cssPath = new URL("../hugo-src/static/css/x7-reading.css", import.meta.url);

test("article prose links keep visible colors when the theme primary color is transparent", async () => {
  const css = await readFile(cssPath, "utf8");

  assert.match(
    css,
    /\.x7-article__prose a:not\(\.x7-theme-button\):not\(\.btn\)\s*\{[^}]*color:\s*var\(--x7-ion\)\s*!important;/s,
  );
  assert.match(
    css,
    /\.x7-article__prose a:not\(\.x7-theme-button\):not\(\.btn\):hover\s*\{[^}]*color:\s*var\(--x7-paper\)\s*!important;/s,
  );
});
