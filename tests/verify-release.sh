#!/usr/bin/env bash
set -euo pipefail

release_dir="$(mktemp -d)"
trap 'rm -rf "$release_dir"' EXIT

npm test
npm run test:render
npm run test:links
hugo --minify --source hugo-src --destination "$release_dir"
git diff --check

node - "$release_dir" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const root = process.argv[2];
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(directory, entry.name);
  return entry.isDirectory() ? walk(file) : entry.isFile() ? [file] : [];
});
const files = walk(root);
const bytes = files.reduce((total, file) => total + fs.statSync(file).size, 0);
console.log(`Release artifact: ${bytes} bytes across ${files.length} files`);
if (bytes >= 1_000_000_000) {
  console.error("Release artifact exceeds the 1,000,000,000-byte GitHub Pages gate");
  process.exit(1);
}
NODE
