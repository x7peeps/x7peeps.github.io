#!/usr/bin/env python3
"""从博客源生成门户站需要的真实数字与最近文章。

口径与博客首页一致（hugo-src/layouts/partials/x7/home-constellation.html）：
  site.Pages 里取 kind=page，或 kind=section 且没有任何子页面的节点，
  再排除 URL 含 /privacy/、/policy/、/关于/ 的页面。
这样两个站显示的文章数永远相等，不会出现「主页 876 / 博客 881」这种对不上的数。

输出：portal/data/site.json
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import urllib.parse
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "hugo-src" / "content"
OUT = ROOT / "portal" / "data" / "site.json"

CST = timezone(timedelta(hours=8))

# 产品详情、关于、隐私政策、技能库入口不是「文章」，两个站的口径都要把它们排掉
EXCLUDE_SECTIONS = {"产品", "关于", "隐私政策", "技能库"}

DATE_RE = re.compile(r"^(?:date|publishDate)\s*[:=]\s*[\"']?([0-9]{4}-[0-9]{2}-[0-9]{2})", re.M)
TITLE_YAML = re.compile(r"^title\s*:\s*[\"']?(.+?)[\"']?\s*$", re.M)
TITLE_TOML = re.compile(r"^title\s*=\s*[\"'](.+?)[\"']\s*$", re.M)
H1_RE = re.compile(r"^#\s+(.+)$", re.M)


def frontmatter(text: str) -> str:
    if text.startswith("---"):
        end = text.find("\n---", 3)
        return text[3:end if end > 0 else len(text)]
    if text.startswith("+++"):
        end = text.find("\n+++", 3)
        return text[3:end if end > 0 else len(text)]
    return ""


def read_meta(md: Path) -> dict:
    raw = md.read_text(encoding="utf-8", errors="replace")
    fm = frontmatter(raw)
    title = None
    for rx in (TITLE_TOML, TITLE_YAML):
        m = rx.search(fm)
        if m:
            title = m.group(1).strip()
            break
    if not title:
        m = H1_RE.search(raw)
        title = m.group(1).strip() if m else md.parent.name
    m = DATE_RE.search(fm)
    date = m.group(1) if m else None
    return {"title": title, "date": date}


def url_for(rel: Path) -> str:
    parts = [urllib.parse.quote(p, safe="") for p in rel.parts]
    return "/" + "/".join(parts) + "/"


def git_date(path: Path) -> str | None:
    """没有 frontmatter date 的页面，用 git 提交日期（与 Hugo :git 口径一致）。"""
    try:
        out = subprocess.run(
            ["git", "-C", str(ROOT), "log", "-1", "--format=%cs", "--", str(path)],
            capture_output=True,
            text=True,
            timeout=20,
        )
        val = out.stdout.strip()
        return val if re.fullmatch(r"\d{4}-\d{2}-\d{2}", val) else None
    except Exception:
        return None


def main() -> int:
    if not CONTENT.is_dir():
        print(f"找不到博客内容目录: {CONTENT}", file=sys.stderr)
        return 1

    pages: list[dict] = []

    def add(p: Path, rel: Path, kind: str) -> None:
        meta = read_meta(p)
        url = url_for(rel)
        if any(x in url for x in ("/privacy/", "/policy/", "/关于/")):
            return
        if rel.parts and rel.parts[0] in EXCLUDE_SECTIONS:
            return
        pages.append(
            {
                "title": meta["title"],
                "date": meta["date"] or git_date(p),
                "url": url,
                "section": rel.parts[0] if rel.parts else "",
                "kind": kind,
            }
        )

    for dirpath, dirnames, filenames in __import__("os").walk(CONTENT):
        d = Path(dirpath)
        dirnames[:] = [n for n in dirnames if not n.startswith(".")]
        rel_dir = d.relative_to(CONTENT)
        has_index = "_index.md" in filenames
        flat = sorted(n for n in filenames if n.endswith(".md") and n != "_index.md")
        child_dirs = [n for n in dirnames if any((d / n).rglob("*.md"))]

        if has_index:
            # 有子页面 = section（不计入文章数）；没有子页面 = 计 1 篇（与模板口径一致）
            if not child_dirs and not flat:
                add(d / "_index.md", rel_dir, "section-empty")
        for name in flat:
            add(d / name, rel_dir / name[: -len(".md")], "page")

    dated = [p for p in pages if p["date"]]
    dated.sort(key=lambda p: (p["date"], p["url"]), reverse=True)

    sections: dict[str, int] = {}
    for p in pages:
        key = p["section"]
        if key:
            sections[key] = sections.get(key, 0) + 1

    # 技能库与提示词样本册的真实数字取自各自数据文件（抓不到就退化为 None，模板里不显示）
    skills_total = live_total = None
    try:
        data = json.loads((ROOT / "portal" / "data" / "skills.json").read_text(encoding="utf-8"))
        meta = data.get("meta", {})
        skills_total = meta.get("totalSkills")
        live_total = meta.get("liveCount")
    except Exception:
        pass

    payload = {
        "articles": len(pages),
        "sections": dict(sorted(sections.items(), key=lambda kv: -kv[1])),
        "latest": dated[:8],
        "latestDate": dated[0]["date"] if dated else None,
        "skillsTotal": skills_total,
        "skillsLive": live_total,
        "generatedAt": datetime.now(CST).strftime("%Y-%m-%d %H:%M"),
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(
        f"site.json 写好: 文章 {payload['articles']} 篇 / 分区 {len(sections)} 个 / "
        f"最近 {payload['latestDate']} / 技能 {skills_total}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
