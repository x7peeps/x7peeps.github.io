import os
import re


CONTENT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "content"))


DATE_KEYS = {
    "date",
    "Date",
    "updated",
    "lastmod",
    "Lastmod",
    "publishDate",
    "expiryDate",
}


RE_FRONT_START = re.compile(r"^---\s*$")
RE_KV = re.compile(r"^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$")
RE_DATE_SLASH = re.compile(r"^(\d{4})/(\d{1,2})/(\d{1,2})$")
RE_DATETIME_SLASH = re.compile(
    r"^(\d{4})/(\d{1,2})/(\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})$"
)
RE_DATE = re.compile(r"^(\d{4})-(\d{1,2})-(\d{1,2})$")
RE_DATETIME = re.compile(r"^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})$")
RE_RFC3339 = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$"
)


def norm_date(v: str) -> str | None:
    v = v.strip().strip('"').strip("'")
    if not v:
        return None
    if RE_RFC3339.match(v):
        return v
    m = RE_DATE_SLASH.match(v)
    if m:
        y, mo, d = (int(m.group(1)), int(m.group(2)), int(m.group(3)))
        return f"{y:04d}-{mo:02d}-{d:02d}"
    m = RE_DATETIME_SLASH.match(v)
    if m:
        y, mo, d = (int(m.group(1)), int(m.group(2)), int(m.group(3)))
        hh, mm, ss = (int(m.group(4)), int(m.group(5)), int(m.group(6)))
        return f"{y:04d}-{mo:02d}-{d:02d}T{hh:02d}:{mm:02d}:{ss:02d}+08:00"
    m = RE_DATETIME.match(v)
    if m:
        y, mo, d = (int(m.group(1)), int(m.group(2)), int(m.group(3)))
        hh, mm, ss = (int(m.group(4)), int(m.group(5)), int(m.group(6)))
        return f"{y:04d}-{mo:02d}-{d:02d}T{hh:02d}:{mm:02d}:{ss:02d}+08:00"
    m = RE_DATE.match(v)
    if m:
        y, mo, d = (int(m.group(1)), int(m.group(2)), int(m.group(3)))
        return f"{y:04d}-{mo:02d}-{d:02d}"
    return None


def process_file(p: str) -> bool:
    with open(p, "r", encoding="utf-8") as f:
        lines = f.read().splitlines(keepends=False)

    if not lines:
        return False
    start = 0
    while start < len(lines) and lines[start].strip() == "":
        start += 1
    if start >= len(lines) or not RE_FRONT_START.match(lines[start]):
        return False

    end = None
    for i in range(start + 1, len(lines)):
        if RE_FRONT_START.match(lines[i]):
            end = i
            break
    if end is None:
        return False

    changed = False
    for i in range(start + 1, end):
        m = RE_KV.match(lines[i])
        if not m:
            continue
        k, v = m.group(1), m.group(2)
        if k not in DATE_KEYS:
            continue
        nv = norm_date(v)
        if nv is None:
            continue
        nk = "date" if k == "Date" else k
        nl = f"{nk}: {nv}"
        if nl != lines[i]:
            lines[i] = nl
            changed = True

    if not changed:
        return False

    with open(p, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    return True


def main() -> None:
    updated = 0
    scanned = 0
    for root, _, files in os.walk(CONTENT_DIR):
        for fn in files:
            if not fn.endswith(".md"):
                continue
            p = os.path.join(root, fn)
            scanned += 1
            if process_file(p):
                updated += 1
    print(f"scanned={scanned} updated={updated}")


if __name__ == "__main__":
    main()
