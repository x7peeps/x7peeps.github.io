#!/usr/bin/env bash
# 门户站构建：先把博客源里属于门户的内容同步进来，再生成真实数字，最后建站。
# 内容只有一个源（hugo-src），这个目录里不放任何正文。
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/.." && pwd)"
dest="$here/content"

mkdir -p "$dest"

for section in 产品 关于 隐私政策; do
  src="$repo/hugo-src/content/$section"
  if [ ! -d "$src" ]; then
    echo "缺少源内容目录: $src" >&2
    exit 1
  fi
  rsync -a --delete "$src/" "$dest/$section/"
done

# ---------------------------------------------------------------------------
# 技能库 / 提示词样本册：它们各自是 GitHub Pages 子站，而 GitHub 给这两个子域的
# 证书一直没签发（线上发的是 *.github.io 证书，HTTPS 直接报证书错，只有 HTTP 能开）。
# 所以把这两个纯静态站原样搬到主域子路径下，共用主域已签发的证书：
#   x7peeps.com/skills/  ← x7peeps/skills
#   x7peeps.com/prompt/  ← x7peeps/prompt
# 两个站内部用的都是相对路径（data/samples.json、assets/…），换前缀即可用。
# ---------------------------------------------------------------------------
fetch_static_site() {
  local repo_name="$1" target="$2" from_domain="$3" to_path="$4"
  local tmp
  tmp="$(mktemp -d)"
  if ! curl -sL -m 90 "https://codeload.github.com/x7peeps/${repo_name}/tar.gz/refs/heads/main" \
       | tar xz -C "$tmp" --strip-components=1 2>/dev/null; then
    echo "拉取 ${repo_name} 失败，跳过 ${target}" >&2
    rm -rf "$tmp"
    return 0
  fi
  mkdir -p "${here}/static/${target}"
  rsync -a --delete --exclude 'robots.txt' --exclude 'sitemap.xml' --exclude 'CNAME' \
    --exclude '.nojekyll' --exclude '.git*' --exclude 'README.md' --exclude 'build.py' \
    --exclude 'scripts' --exclude 'probe*' "$tmp/" "${here}/static/${target}/"
  # rsync 的 --delete 不会删「被 --exclude 保护」的目标端文件，所以这里必须显式清：
  # 子目录里留着 CNAME，GitHub Pages 会把该目录当成独立站，301 到那个子域去。
  rm -f "${here}/static/${target}/CNAME" "${here}/static/${target}/.nojekyll" \
    "${here}/static/${target}/robots.txt" "${here}/static/${target}/sitemap.xml" \
    "${here}/static/${target}/README.md" "${here}/static/${target}/build.py"
  rm -rf "${here}/static/${target}/scripts" "${here}/static/${target}/.git"
  rm -rf "$tmp"
  # 域引用改写到主域子路径（og:image / canonical / 自链 / 互相引用）
  python3 - "$here/static/${target}/index.html" "$from_domain" "$to_path" <<'PY'
import sys, pathlib
path, frm, to = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
MAP = {
    "https://skills.x7peeps.com/": "https://x7peeps.com/skills/",
    "https://prompt.x7peeps.com/": "https://x7peeps.com/prompt/",
}
if path.exists():
    text = path.read_text(encoding="utf-8")
    for a, b in MAP.items():
        text = text.replace(a, b)
    path.write_text(text, encoding="utf-8")
    print(f"  {path.name}: 子域引用已改写到主域")
PY
}

echo "同步技能库与提示词样本册："
fetch_static_site skills skills skills.x7peeps.com /skills
fetch_static_site prompt prompt prompt.x7peeps.com /prompt

# 技能库数字（skills.x7peeps.com 的数据源，抓不到不影响构建）
mkdir -p "$here/data"
curl -s -m 25 -o "$here/data/skills.json" \
  https://raw.githubusercontent.com/x7peeps/skills/main/data.json || true
[ -s "$here/data/skills.json" ] || rm -f "$here/data/skills.json"

python3 "$here/scripts/snapshot.py"

hugo --source "$here" --destination "$repo/portal-public" --minify --baseURL "https://x7peeps.com/" "$@"
echo "构建完成: $repo/portal-public"
