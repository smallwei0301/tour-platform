#!/bin/bash

# Execute Supabase migrations directly via psql (no CLI, no npm issues)
# No interactive prompts, zero manual work

set -e

DB_HOST="db.pyoderxmpeyqjwkeliiu.supabase.co"
DB_PORT="5432"
DB_NAME="postgres"
DB_USER="postgres"
DB_PASSWORD="tour-platform-prod-2025"

export PGPASSWORD="$DB_PASSWORD"

MIGRATIONS_DIR="supabase/migrations"

echo "════════════════════════════════════════════════════════════════"
echo "🚀 Executing Supabase Migrations (012 & 013) via psql"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Read migration files
MIGRATION_012=$(cat "$MIGRATIONS_DIR/012_guides_storage_bucket.sql")
MIGRATION_013=$(cat "$MIGRATIONS_DIR/013_activity_images_full_rls.sql")

# Execute 012
echo "⏳ Executing: 012_guides_storage_bucket.sql"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  -v ON_ERROR_STOP=1 \
  <<EOF
$MIGRATION_012
EOF

if [ $? -eq 0 ]; then
  echo "✅ Migration 012 completed"
else
  echo "❌ Migration 012 failed"
  exit 1
fi

echo ""

# Execute 013
echo "⏳ Executing: 013_activity_images_full_rls.sql"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  -v ON_ERROR_STOP=1 \
  <<EOF
$MIGRATION_013
EOF

if [ $? -eq 0 ]; then
  echo "✅ Migration 013 completed"
else
  echo "❌ Migration 013 failed"
  exit 1
fi

echo ""

# Record in schema_migrations
echo "⏳ Recording in schema_migrations..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  -v ON_ERROR_STOP=1 \
  <<EOF
INSERT INTO schema_migrations (version, name, statements) VALUES
  (12, '012_guides_storage_bucket', 'Executed via psql'),
  (13, '013_activity_images_full_rls', 'Executed via psql')
ON CONFLICT DO NOTHING;
EOF

echo "✅ Recorded in schema_migrations"
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "✅ All migrations executed successfully!"
echo ""
echo "Verify in Supabase Dashboard:"
echo "  • Storage → Check guides & activity-images buckets"
echo "  • Database → schema_migrations → Check versions 12 & 13"
echo "════════════════════════════════════════════════════════════════"
echo ""

unset PGPASSWORD
exit 0
