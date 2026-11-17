#!/usr/bin/env node
// 门户站构建产物的静态契约：不启浏览器，只查「结构有没有塌」。
// 视觉与几何由 portal/scripts/probe.py 负责（本机跑，需要 playwright）。

import fs from "node:fs";
import path from "node:path";

const root = process.argv[2] || "portal-public";
const fail = [];
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const home = read("index.html");
const must = [
  [/<h1[^>]*>x7peeps<\/h1>/, "首页缺 h1：x7peeps"],
  [/独立工作室/, "首页缺品类词「独立工作室」"],
  [/blog\.x7peeps\.com/, "首页没有博客入口"],
  [/prompt\.x7peeps\.com/, "首页没有提示词入口"],
  [/skills\.x7peeps\.com/, "首页没有技能库入口"],
  [/tools\.x7peeps\.com/, "首页没有工具入口"],
];
for (const [re, msg] of must) if (!re.test(home)) fail.push(msg);

// minify 会把 class="btn" 压成 class=btn，两种写法都要算
const btn = (home.match(/class=(?:"btn"|btn(?=[\s>]))/g) || []).length;
if (btn !== 1) fail.push(`首页主按钮应恰好 1 个，实际 ${btn}`);

for (const bad of ["{{", "}}", "undefined", "NaN", "<no value>"]) {
  if (home.includes(bad)) fail.push(`首页出现模板残留/空值: ${bad}`);
}

// 产品：首页 5 行 + /产品/ 页 5 个入口 + 详情页存在
const productNames = ["澄片", "灵感工坊", "OfflinePassbook", "AInative", "Dark Directory Hugo Theme"];
for (const n of productNames) {
  if (!home.includes(n)) fail.push(`首页缺产品: ${n}`);
}

const productsIndex = read(path.join("产品", "index.html"));
const cards = (productsIndex.match(/<li><a href=/g) || []).length;
if (cards !== productNames.length) fail.push(`/产品/ 应有 ${productNames.length} 个入口，实际 ${cards}`);

for (const dir of ["澄片", "灵感工坊", "OfflinePassbook", "AInative", "dark-directory-hugo-theme"]) {
  const f = path.join(root, "产品", dir, "index.html");
  if (!fs.existsSync(f)) fail.push(`缺产品详情页: 产品/${dir}`);
}

// 关于 / 隐私政策 / App Store 别名 / 404
for (const [f, label] of [
  [["关于", "index.html"], "/关于/"],
  [["隐私政策", "index.html"], "/隐私政策/"],
  [["lrse-ios", "index.html"], "App Store 别名 /lrse-ios/"],
  [["404.html"], "404.html"],
]) {
  if (!fs.existsSync(path.join(root, ...f))) fail.push(`缺页面: ${label}`);
}

if (fail.length) {
  console.error("门户构建契约失败：");
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`门户构建契约通过：${productNames.length} 个产品、主按钮唯一、入口齐全`);
