import os, re, urllib.parse
md_image_regex = re.compile(r'!\[([^\]]*)\]\(([^)]+)\)')
for root, _, files in os.walk("hugo-src/content"):
    for f in files:
        if f.endswith(".md"):
            path = os.path.join(root, f)
            with open(path, "r", encoding="utf-8") as file:
                for match in md_image_regex.finditer(file.read()):
                    src = urllib.parse.unquote(match.group(2).split(' ')[0])
                    if src.startswith("http") or src.startswith("data:"): continue
                    if src.startswith("/"):
                        expected = os.path.join("hugo-src/static", src.lstrip("/"))
                    else:
                        expected = os.path.join(root, src)
                    if not os.path.exists(expected):
                        print(f"Missing: {src} in {path}")
