#!/usr/bin/env bash
# check-docs-sync.sh
# 簡單檢查 README.md 中的 Sprint/Phase 關鍵字是否在 docs/04-tech/03-dev-timeline/* 出現
# 用法: ./check-docs-sync.sh [repo-root]

set -euo pipefail
ROOT_DIR=${1:-$(pwd)}
README="$ROOT_DIR/README.md"
DOCS_DIR="$ROOT_DIR/docs/04-tech/03-dev-timeline"

if [ ! -f "$README" ]; then
  echo "ERROR: README.md not found at $README" >&2
  exit 2
fi
if [ ! -d "$DOCS_DIR" ]; then
  echo "ERROR: docs directory not found at $DOCS_DIR" >&2
  exit 2
fi

# Extract obvious progress keywords from README (Phase 4 / Sprint 4 / Sprint 4.2 等)
KEYWORDS=$(grep -Eoi "(Phase [0-9]+|Sprint [0-9]+(\.[0-9]+)?)" "$README" | sort -u || true)
if [ -z "$KEYWORDS" ]; then
  echo "No Phase/Sprint keywords found in README.md — nothing to check." 
  exit 0
fi

echo "Found keywords in README.md:"
echo "$KEYWORDS"

ahead=0
mismatch=0

for kw in $KEYWORDS; do
  # check presence in docs files
  if grep -Riq -- "$kw" "$DOCS_DIR"; then
    echo "[OK] $kw found in docs/" 
    ahead=$((ahead+1))
  else
    echo "[MISSING] $kw NOT found in docs/" 
    mismatch=$((mismatch+1))
  fi
done

if [ $mismatch -gt 0 ]; then
  echo "Mismatch detected: $mismatch keywords missing in docs/" >&2
  exit 3
fi

echo "All checked keywords present in docs/ — docs appear synced for the detected keywords." 
exit 0
