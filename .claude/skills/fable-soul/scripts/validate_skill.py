from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / "SKILL.md"


def fail(message: str) -> None:
    print(f"FAIL: {message}")
    sys.exit(1)


def main() -> None:
    if not SKILL.exists():
        fail("SKILL.md is missing")

    text = SKILL.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        fail("SKILL.md frontmatter is missing")

    end = text.find("\n---\n", 4)
    if end == -1:
        fail("SKILL.md frontmatter is not closed")

    frontmatter = text[4:end]
    for field in ("name:", "description:"):
        if field not in frontmatter:
            fail(f"frontmatter missing {field}")

    missing = []
    for match in re.findall(r"\]\((references/[^)]+)\)", text):
        target = ROOT / match
        if not target.exists():
            missing.append(match)

    if missing:
        fail("missing referenced files: " + ", ".join(sorted(set(missing))))

    refs = sorted((ROOT / "references").glob("*.md"))
    if not refs:
        fail("references directory is empty")

    print(f"OK: {ROOT.name} skill validates ({len(refs)} references)")


if __name__ == "__main__":
    main()

