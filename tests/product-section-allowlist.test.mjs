import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

// 「产品」区是老大自有产品的展示位，不是内容栏目。
// 第三方工具/产品分析（评测、竞品拆解、源码复盘）属于文章，应归到
// 开源项目 / AI / 安全 等分类。历史上 Narro、OpenBot、《网页朗读的隐私账单》
// 三篇就是被每日写作产线以 menu.main.parent="产品" 塞进来的（2026-11-17 清理）。
// 新增自有产品时，在此显式登记一行——故意让"多出一个产品"必须人工确认。
const FIRST_PARTY_PRODUCTS = new Set([
  "AInative",
  "OfflinePassbook",
  "dark-directory-hugo-theme",
  "澄片",
  "灵感工坊",
]);

const productRoot = new URL("../hugo-src/content/产品/", import.meta.url);

async function productDirs() {
  const entries = await readdir(productRoot, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

test("产品区只包含已登记的自有产品目录", async () => {
  const unexpected = (await productDirs()).filter((name) => !FIRST_PARTY_PRODUCTS.has(name));
  assert.deepEqual(
    unexpected,
    [],
    `content/产品 只允许自有产品；发现未登记目录（第三方文章请改投 开源项目/AI/安全）：${unexpected.join(" / ")}`,
  );
});

test("每个产品目录都有带 title 的 _index.md", async () => {
  for (const name of await productDirs()) {
    const file = new URL(`${name}/_index.md`, productRoot);
    const text = await readFile(file, "utf8");
    assert.match(text, /^(?:\+\+\+|---)[\s\S]*?\ntitle\s*[:=]\s*\S/m, `${name} 缺少 title frontmatter`);
  }
});

test("没有文章把菜单挂到产品区却落在别的分类", async () => {
  const contentRoot = fileURLToPath(new URL("../hugo-src/content/", import.meta.url));
  const offenders = [];

  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (entry.name !== "_index.md") continue;
      const relative = path.relative(contentRoot, full).split(path.sep).join("/");
      if (relative.startsWith("产品/")) continue;
      const text = await readFile(full, "utf8");
      const frontmatter = text.match(/^(?:---|\+\+\+)\n([\s\S]*?)\n(?:---|\+\+\+)/)?.[1] ?? "";
      if (/menu:\s*\n\s*main:\s*\n\s*parent:\s*["']?产品["']?/.test(frontmatter)) offenders.push(relative);
    }
  }

  await walk(contentRoot);
  assert.deepEqual(offenders, [], `这些文章把菜单挂到产品区但不在 content/产品/ 下：${offenders.join(" / ")}`);
});
