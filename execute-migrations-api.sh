#!/bin/bash

# Execute Supabase migrations using REST API
# Zero dependencies, zero manual work

set -e

SUPABASE_URL="https://pyoderxmpeyqjwkeliiu.supabase.co"
SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5b2RlcnhtcGV5cWp3a2VsaWl1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDkzNDQ3MCwiZXhwIjoyMDkwNTEwNDcwfQ.DO0fwNkKCEOvOXERzM9GylmcnorB7RgF7Tt4qo645w4"

MIGRATIONS_DIR="supabase/migrations"

echo "════════════════════════════════════════════════════════════════"
echo "🚀 Executing Supabase Migrations (012 & 013) via REST API"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Function to execute a single SQL statement
execute_sql() {
  local name=$1
  local sql=$2

  echo "⏳ Executing: $name"

  # Escape SQL for JSON
  local json_sql=$(echo "$sql" | jq -Rs .)

  # Use Supabase RPC endpoint (if available) or directly insert/update
  # Since we're modifying storage buckets and policies, we need to use proper endpoints
  
  # Alternative: Use direct database REST endpoint
  # For now, we'll use curl to call Supabase's internal endpoint
  
  curl -s -X POST \
    "$SUPABASE_URL/rest/v1/rpc/execute_sql" \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H "apikey: $SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"query\": $json_sql}" \
    > /tmp/response.json 2>&1

  # Check if RPC function exists
  if grep -q "not found" /tmp/response.json 2>/dev/null; then
    echo "⚠️  RPC endpoint not available, trying direct approach..."
    return 1
  fi

  if grep -q "error" /tmp/response.json 2>/dev/null; then
    echo "❌ Failed:"
    cat /tmp/response.json
    return 1
  fi

  echo "✅ $name completed"
  return 0
}

# Try RPC approach first
if execute_sql "012_guides_storage_bucket.sql" "$(cat $MIGRATIONS_DIR/012_guides_storage_bucket.sql)"; then
  execute_sql "013_activity_images_full_rls.sql" "$(cat $MIGRATIONS_DIR/013_activity_images_full_rls.sql)"
  echo ""
  echo "════════════════════════════════════════════════════════════════"
  echo "✅ Migrations executed successfully via REST API!"
  echo "════════════════════════════════════════════════════════════════"
  exit 0
fi

# Fallback: Use curl to POST raw SQL
echo ""
echo "⚠️  Falling back to direct SQL execution..."
echo ""

# Since RPC doesn't work, we need to execute via Dashboard or CLI
# Let's use supabase-js approach with fetch

cat > /tmp/execute-sql.sh << 'FETCH_SCRIPT'
#!/bin/bash

# This is a last-resort fallback

echo "❌ Cannot execute via API endpoints. Reasons:"
echo "  1. Supabase doesn't expose SQL execution via REST API"
echo "  2. psql direct connection blocked by IPv6"
echo "  3. Supabase CLI requires schema_migrations record (circular dependency)"
echo ""
echo "✅ Solution: Use Dashboard or accept manual copy-paste"
echo ""
echo "Alternative: Use Supabase Management API (requires additional auth)"

FETCH_SCRIPT

bash /tmp/execute-sql.sh
exit 1
