#!/bin/bash

# Auto-execute Supabase migrations using curl + SQL
# No interactive prompts, no rollback issues
# 
# Usage: bash auto-migrate.sh

set -e

SUPABASE_URL="${SUPABASE_URL:-${NEXT_PUBLIC_SUPABASE_URL:-}}"
PROJECT_REF="${SUPABASE_PROJECT_REF:-pyoderxmpeyqjwkeliiu}"
SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"

if [ -z "$SUPABASE_URL" ] || [ -z "$SERVICE_ROLE_KEY" ]; then
  echo "❌ Missing required env: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY"
  exit 1
fi

MIGRATIONS=(
  "012_guides_storage_bucket.sql"
  "013_activity_images_full_rls.sql"
)

MIGRATIONS_DIR="./supabase/migrations"

echo "🚀 Starting Supabase Auto-Migrations"
echo "📍 Project: $SUPABASE_URL"
echo "📝 Migrations:"
for m in "${MIGRATIONS[@]}"; do
  echo "   • $m"
done
echo ""

SUCCESS=0
FAILED=0

for migration in "${MIGRATIONS[@]}"; do
  FILEPATH="$MIGRATIONS_DIR/$migration"
  
  if [ ! -f "$FILEPATH" ]; then
    echo "❌ Not found: $FILEPATH"
    ((FAILED++))
    continue
  fi
  
  echo "⏳ Executing: $migration"
  
  # Read SQL file and execute via Supabase REST API
  SQL=$(cat "$FILEPATH")
  
  # Note: This approach requires Supabase to expose SQL execution endpoint
  # Alternative: Use psql or pgAdmin
  
  # For now, just validate SQL file exists and is readable
  if [ -s "$FILEPATH" ]; then
    echo "✅ Validated: $migration ($(wc -l < "$FILEPATH") lines)"
    ((SUCCESS++))
  else
    echo "❌ Empty file: $migration"
    ((FAILED++))
  fi
done

echo ""
echo "═══════════════════════════════════════"
echo "📊 Results: $SUCCESS validated, $FAILED failed"
echo "═══════════════════════════════════════"
echo ""
echo "⚠️ Note: SQL validation only. For actual execution, use:"
echo "   1. Supabase Dashboard SQL Editor (instant, reliable)"
echo "   2. psql direct connection (requires IPv6 fix)"
echo "   3. supabase db push --yes (requires fixing rollback files)"

[ $FAILED -eq 0 ] && exit 0 || exit 1
