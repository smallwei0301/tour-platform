"""Check whether the upstream GitHub repo has a newer version of this skill.

Usage (from the skill root):
    python scripts/check_update.py

Compares local files against the raw contents of the upstream repo's main
branch. Reports which files differ; never modifies anything. Exit code 0 =
up to date, 1 = updates available or a file could not be fetched.
"""
from __future__ import annotations

import sys
import urllib.error
import urllib.request
from pathlib import Path

REPO = "akseolabs-seo/fable-soul"
BRANCH = "main"
RAW_BASE = f"https://raw.githubusercontent.com/{REPO}/{BRANCH}/"

SKILL_ROOT = Path(__file__).resolve().parents[1]

TRACKED = [
    "SKILL.md",
    "CHANGELOG.md",
    "references/soul.md",
    "references/soul-compact.md",
    "references/maintenance.md",
    "references/transfer-prompts.md",
    "references/evals.md",
    "references/worked-examples.md",
    "examples/hooks.json",
    "scripts/sync_soul.py",
    "scripts/validate_skill.py",
    "scripts/check_update.py",
    "scripts/test_sync_soul.py",
]


def fetch(rel: str) -> bytes | None:
    try:
        with urllib.request.urlopen(RAW_BASE + rel, timeout=15) as resp:
            return resp.read()
    except (urllib.error.URLError, TimeoutError):
        return None


def normalize(data: bytes) -> bytes:
    # Ignore line-ending differences (git on Windows may check out CRLF).
    return data.replace(b"\r\n", b"\n")


def main() -> None:
    changed: list[str] = []
    unreachable: list[str] = []

    for rel in TRACKED:
        remote = fetch(rel)
        if remote is None:
            unreachable.append(rel)
            continue
        local_path = SKILL_ROOT / rel
        local = local_path.read_bytes() if local_path.exists() else b""
        if normalize(remote) != normalize(local):
            changed.append(rel)

    if unreachable:
        print("Could not fetch from upstream (offline or repo moved):")
        for rel in unreachable:
            print(f"  - {rel}")
        sys.exit(1)

    if changed:
        print(f"Updates available upstream ({REPO}@{BRANCH}):")
        for rel in changed:
            print(f"  - {rel}")
        print(f"\nReview and update: https://github.com/{REPO}")
        sys.exit(1)

    print("Up to date with upstream.")


if __name__ == "__main__":
    main()
