#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

missing=0
check_file() {
  if [[ ! -f "$1" ]]; then
    echo "[MISSING] $1"
    missing=1
  else
    echo "[OK] $1"
  fi
}

echo "== File checks =="
check_file "apps/web/package.json"
check_file "apps/web/app/page.tsx"
check_file "apps/web/app/api/orders/route.ts"
check_file "supabase/migrations/001_mvp_core.sql"
check_file "scripts/demo-smoke.sh"

echo

echo "== Test checks =="
npm run test -w @tour/web

if [[ "$missing" -ne 0 ]]; then
  echo "❌ Preflight failed: missing required files"
  exit 1
fi

echo "✅ Preflight passed"
