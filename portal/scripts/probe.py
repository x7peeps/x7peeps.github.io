#!/usr/bin/env python3
"""门户站验收探针：跑一次给出可判定的数字，退出码 0/1。

用法： python3 portal/scripts/probe.py [base_url] [out_dir]
检查项（任一命中即 FAIL）：
  - 横向溢出（documentElement 与 body 双口径）
  - 首屏能否看到主角（h1）与索引第一行
  - 主按钮唯一（.btn 只能有 1 个）
  - 死链 / 空 href
  - 移动端触控目标 < 40px
  - JS 运行时错误
  - 文字画出父盒（scrollWidth > clientWidth）
输出：<out_dir>/report.json + 各档位整页截图
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8801/"
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else "/tmp/portal-probe")
OUT.mkdir(parents=True, exist_ok=True)

VIEWPORTS = [("desk", 1280), ("tab", 820), ("phone", 500)]
SCHEMES = ["dark", "light"]

fail: list[str] = []
report: dict = {"base": BASE, "viewports": {}}

with sync_playwright() as p:
    browser = p.chromium.launch(
        channel="chrome",
        headless=True,
        args=[
            "--use-fake-device-for-media-stream",
            "--use-fake-ui-for-media-stream",
        ],
    )
    for scheme in SCHEMES:
        for name, width in VIEWPORTS:
            ctx = browser.new_context(
                viewport={"width": width, "height": 900},
                device_scale_factor=2,
                color_scheme=scheme,
            )
            pg = ctx.new_page()
            errs: list[str] = []
            pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
            pg.goto(BASE, wait_until="domcontentloaded")
            pg.wait_for_timeout(900)

            data = pg.evaluate(
                """() => {
                const de = document.documentElement;
                const body = document.body;
                const vw = window.innerWidth;
                const h1 = document.querySelector('h1');
                const firstRow = document.querySelector('.index__row');
                const btns = [...document.querySelectorAll('.btn')].filter(b => b.getBoundingClientRect().width > 0);
                const links = [...document.querySelectorAll('a')].map(a => ({
                   href: a.getAttribute('href'), text: (a.textContent||'').trim().slice(0,30),
                   r: a.getBoundingClientRect(), tabindex: a.tabIndex,
                }));
                const dead = links.filter(l => !l.href || l.href === '#' || l.href === 'javascript:void(0)');
                const small = links.filter(l => l.r.width > 0 && (l.r.height < 40 || l.r.width < 24));
                const bleed = [...document.querySelectorAll('main *')]
                   .filter(el => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible')
                   .slice(0, 6)
                   .map(el => el.className || el.tagName);
                const offRight = [...document.querySelectorAll('main *, header *, footer *')]
                   .filter(el => el.getBoundingClientRect().right > vw + 1)
                   .slice(0, 6)
                   .map(el => (el.className || el.tagName) + ':' + Math.round(el.getBoundingClientRect().right));
                const sizes = [...new Set([...document.querySelectorAll('h1,p,span,b,em,time,a,li')]
                   .filter(e => e.textContent.trim() && getComputedStyle(e).display !== 'none')
                   .map(e => getComputedStyle(e).fontSize))].sort();
                return {
                   vw,
                   deScroll: de.scrollWidth, bodyScroll: body.scrollWidth,
                   h1: h1 ? h1.getBoundingClientRect().toJSON() : null,
                   h1Text: h1 ? h1.textContent.trim() : null,
                   firstRowTop: firstRow ? Math.round(firstRow.getBoundingClientRect().top) : null,
                   btnCount: btns.length,
                   btnText: btns.map(b => b.textContent.trim()),
                   totalLinks: links.length,
                   dead: dead.map(d => d.text || d.href),
                   small: small.map(s => `${s.text}:${Math.round(s.r.width)}x${Math.round(s.r.height)}`),
                   bleed, offRight, sizes,
                };
            }"""
            )
            key = f"{name}-{scheme}"
            shot = OUT / f"{key}.png"
            pg.screenshot(path=str(shot), full_page=True)
            report["viewports"][key] = {**data, "errors": errs, "shot": str(shot)}

            if data["deScroll"] > data["vw"] or data["bodyScroll"] > data["vw"]:
                fail.append(f"[{key}] 横向溢出 de={data['deScroll']} body={data['bodyScroll']} vw={data['vw']}")
            if data["offRight"]:
                fail.append(f"[{key}] 越界元素 {data['offRight']}")
            if not data["h1"]:
                fail.append(f"[{key}] 没有 h1")
            elif data["h1"]["top"] > 900:
                fail.append(f"[{key}] h1 不在首屏")
            if data["firstRowTop"] is not None and data["firstRowTop"] > 900:
                fail.append(f"[{key}] 索引第一行不在首屏（top={data['firstRowTop']}）")
            if data["btnCount"] != 1:
                fail.append(f"[{key}] 主按钮不唯一：{data['btnText']}")
            if data["dead"]:
                fail.append(f"[{key}] 死链：{data['dead'][:5]}")
            if errs:
                fail.append(f"[{key}] JS 错误：{errs[:3]}")
            if data["bleed"]:
                fail.append(f"[{key}] 文字画出父盒：{data['bleed']}")
            if name == "phone" and data["small"]:
                fail.append(f"[{key}] 触控目标过小：{data['small'][:8]}")
            ctx.close()

    # 单页：产品详情（真实内容 + 内联 HTML）
    ctx = browser.new_context(viewport={"width": 1280, "height": 900}, device_scale_factor=2)
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE + "产品/澄片/", wait_until="domcontentloaded")
    pg.wait_for_timeout(600)
    detail = pg.evaluate(
        """() => {
        const de = document.documentElement;
        return { vw: innerWidth, scroll: de.scrollWidth, h1: document.querySelector('h1')?.textContent,
                 imgs: [...document.images].map(i => ({src: i.currentSrc.slice(0,60), ok: i.complete && i.naturalWidth > 0})) };
        }"""
    )
    pg.screenshot(path=str(OUT / "detail-product.png"), full_page=True)
    report["productPage"] = {**detail, "errors": errs}
    if detail["scroll"] > detail["vw"]:
        fail.append(f"[产品详情] 横向溢出 {detail['scroll']}>{detail['vw']}")

    # 404 页（老文章地址的兜底跳转）
    resp = pg.goto(BASE + "安全/某篇老文章/", wait_until="domcontentloaded")
    report["404status"] = resp.status if resp else None
    pg.screenshot(path=str(OUT / "404.png"), full_page=True)
    ctx.close()
    browser.close()

report["fail"] = fail
(OUT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
print(json.dumps({"fail": fail, "keys": list(report["viewports"])}, ensure_ascii=False, indent=1))
sys.exit(1 if fail else 0)
