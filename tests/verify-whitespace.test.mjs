import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const helper = path.resolve("tests/check-release-whitespace.sh");

test("release whitespace helper rejects trailing whitespace committed after the base", () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), "x7-whitespace-"));
  try {
    const git = (...args) => execFileSync("git", args, { cwd: repo, stdio: "ignore" });
    git("init", "-q");
    git("config", "user.email", "test@example.invalid");
    git("config", "user.name", "Release Test");
    writeFileSync(path.join(repo, "fixture.txt"), "clean\n");
    git("add", "fixture.txt");
    git("commit", "-qm", "base");
    const base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
    writeFileSync(path.join(repo, "fixture.txt"), "bad trailing space \n");
    git("add", "fixture.txt");
    git("commit", "-qm", "bad");

    const result = spawnSync("bash", [helper], {
      cwd: repo,
      env: { ...process.env, X7_VERIFY_BASE: base },
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /trailing whitespace/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
