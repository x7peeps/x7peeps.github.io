#!/usr/bin/python3
"""Give tracked legacy articles a stable explicit publication date.

Only regular tracked Markdown pages without a front-matter ``date`` are
changed. The date is deterministically derived from the repository-relative
path, so rerunning this tool never changes an existing assignment.
"""

from __future__ import annotations

import argparse
import hashlib
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
CONTENT_ROOT = Path("hugo-src/content")
START = datetime(2024, 1, 1, tzinfo=timezone(timedelta(hours=8)))
END = datetime(2026, 5, 31, 23, 59, 59, tzinfo=timezone(timedelta(hours=8)))


def tracked_legacy_pages() -> list[Path]:
    result = subprocess.run(
        ["git", "ls-files", "-z", "--", str(CONTENT_ROOT)],
        cwd=REPO_ROOT,
        check=True,
        stdout=subprocess.PIPE,
    )
    paths = []
    for raw_path in result.stdout.split(b"\0"):
        if not raw_path:
            continue
        path = Path(raw_path.decode("utf-8"))
        if path.suffix != ".md" or path.name in {"_index.md", "privacy.md", "policy.md"}:
            continue
        paths.append(path)
    return paths


def front_matter_end(lines: list[str]) -> int | None:
    if not lines or lines[0].strip() not in {"---", "+++"}:
        return None
    delimiter = lines[0].strip()
    for index, line in enumerate(lines[1:], start=1):
        if line.strip() == delimiter:
            return index
    return None


def has_explicit_date(lines: list[str], end: int | None) -> bool:
    if end is None:
        return False
    if lines[0].strip() == "+++":
        return any(re.match(r"^date\s*=", line) for line in lines[1:end])
    return any(line.startswith("date:") for line in lines[1:end])


def stable_date(path: Path) -> datetime:
    digest = hashlib.sha256(path.as_posix().encode("utf-8")).digest()
    seconds = int.from_bytes(digest[:8], "big") % (int((END - START).total_seconds()) + 1)
    return START + timedelta(seconds=seconds)


def date_line(path: Path) -> str:
    return f"date: {stable_date(path).isoformat(timespec='seconds')}\n"


def header_lines(path: Path) -> list[str]:
    with (REPO_ROOT / path).open(encoding="utf-8") as source:
        lines = [source.readline()]
        if not lines[0] or lines[0].strip() not in {"---", "+++"}:
            return lines
        for line in source:
            lines.append(line)
            if line.strip() == "---":
                break
        return lines


def missing_date_pages() -> list[Path]:
    missing = []
    for path in tracked_legacy_pages():
        lines = header_lines(path)
        end = front_matter_end(lines)
        if not has_explicit_date(lines, end):
            missing.append(path)
    return missing


def apply_dates(pages: list[Path]) -> None:
    for path in pages:
        source = (REPO_ROOT / path).read_text(encoding="utf-8")
        lines = source.splitlines(keepends=True)
        end = front_matter_end(lines)
        newline = "\r\n" if lines and lines[0].endswith("\r\n") else "\n"
        if end is None:
            lines[0:0] = [f"---{newline}", date_line(path).replace("\n", newline), f"---{newline}"]
        elif lines[0].strip() == "+++":
            lines.insert(1, f'date = "{stable_date(path).isoformat(timespec="seconds")}"{newline}')
        else:
            lines.insert(1, date_line(path).replace("\n", newline))
        (REPO_ROOT / path).write_text("".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="fail when a tracked legacy page lacks a date")
    parser.add_argument("--dry-run", action="store_true", help="print the planned assignments without editing files")
    args = parser.parse_args()

    missing = missing_date_pages()
    if args.check:
        if missing:
            for path in missing:
                print(path)
            return 1
        return 0

    for path in missing:
        print(f"{path}: {date_line(path).strip()}")
    if args.dry_run:
        return 0

    apply_dates(missing)
    print(f"backfilled {len(missing)} tracked legacy article dates")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, subprocess.CalledProcessError, ValueError) as error:
        print(f"legacy date backfill failed: {error}", file=sys.stderr)
        raise SystemExit(1)
