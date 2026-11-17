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

# 技能库数字（skills.x7peeps.com 的数据源，抓不到不影响构建）
mkdir -p "$here/data"
curl -s -m 20 -o "$here/data/skills.json" \
  https://raw.githubusercontent.com/x7peeps/skills/main/data.json || true
[ -s "$here/data/skills.json" ] || rm -f "$here/data/skills.json"

python3 "$here/scripts/snapshot.py"

hugo --source "$here" --destination "$repo/portal-public" --minify --baseURL "https://x7peeps.com/" "$@"
echo "构建完成: $repo/portal-public"
