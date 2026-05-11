/**
 * Issue #322 / #308a — Schema Extension Verification
 *
 * AC1: activities table gains 6 new NULLable columns:
 *   dismissal_point text
 *   dismissal_point_map_url text
 *   meeting_lat numeric(10,7)
 *   meeting_lng numeric(10,7)
 *   dismissal_lat numeric(10,7)
 *   dismissal_lng numeric(10,7)
 *
 * AC2: New tables:
 *   activity_images   (kind CHECK 'cover'|'gallery', sort_order int DEFAULT 0)
 *   activity_plan_tiers (tier CHECK 'adult'|'child'|'infant', UNIQUE(plan_id, tier))
 *   Both have ON DELETE CASCADE FKs and RLS enabled.
 *
 * These tests query information_schema as the authoritative source of truth.
 * They will be RED until the migration is applied.
 *
 * NOTE: These tests require a live Supabase connection (SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY). They are expected to be RED in this branch
 * and GREEN after migration is applied on CI/staging.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const HAS_DB = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

/**
 * Execute a SQL query against the Supabase REST/RPC endpoint.
 * Uses the service role key for schema introspection.
 */
async function queryInformationSchema(sql) {
  if (!HAS_DB) {
    throw new Error('NO_DB_CONNECTION: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    throw new Error(`DB query failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

// ─── AC1: 6 new columns on activities ───────────────────────────────────────

const EXPECTED_NEW_COLUMNS = [
  { name: 'dismissal_point', data_type: 'text' },
  { name: 'dismissal_point_map_url', data_type: 'text' },
  { name: 'meeting_lat', data_type: 'numeric' },
  { name: 'meeting_lng', data_type: 'numeric' },
  { name: 'dismissal_lat', data_type: 'numeric' },
  { name: 'dismissal_lng', data_type: 'numeric' },
];

for (const col of EXPECTED_NEW_COLUMNS) {
  test(`AC1: activities has column "${col.name}" of type ${col.data_type}`, async () => {
    if (!HAS_DB) {
      throw new Error(`[EXPECTED-RED pre-migration] Column "${col.name}" not yet added — migration not applied`);
    }
    const rows = await queryInformationSchema(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'activities'
        AND column_name  = '${col.name}'
    `);
    assert.ok(rows.length > 0, `Column "${col.name}" not found on activities`);
    assert.equal(rows[0].data_type, col.data_type, `Column "${col.name}" has wrong data_type`);
    assert.equal(rows[0].is_nullable, 'YES', `Column "${col.name}" should be NULLable`);
  });
}

test('AC1: all 6 new columns exist on activities table', async () => {
  if (!HAS_DB) {
    throw new Error('[EXPECTED-RED pre-migration] 6 new columns not yet added — migration not applied');
  }
  const expectedNames = EXPECTED_NEW_COLUMNS.map((c) => c.name);
  const rows = await queryInformationSchema(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'activities'
      AND column_name  = ANY(ARRAY[${expectedNames.map((n) => `'${n}'`).join(',')}])
  `);
  const foundNames = rows.map((r) => r.column_name);
  for (const name of expectedNames) {
    assert.ok(foundNames.includes(name), `Missing column: ${name}`);
  }
  assert.equal(foundNames.length, 6, `Expected 6 columns, found ${foundNames.length}`);
});

// ─── AC2: activity_images table ──────────────────────────────────────────────

test('AC2: activity_images table exists', async () => {
  if (!HAS_DB) {
    throw new Error('[EXPECTED-RED pre-migration] activity_images table does not exist — migration not applied');
  }
  const rows = await queryInformationSchema(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name   = 'activity_images'
  `);
  assert.ok(rows.length > 0, 'Table activity_images not found');
});

test('AC2: activity_images.kind column has CHECK constraint (cover|gallery)', async () => {
  if (!HAS_DB) {
    throw new Error('[EXPECTED-RED pre-migration] activity_images table does not exist — migration not applied');
  }
  // Verify via pg_constraint
  const rows = await queryInformationSchema(`
    SELECT cc.check_clause
    FROM information_schema.check_constraints cc
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = cc.constraint_name
    WHERE ccu.table_schema = 'public'
      AND ccu.table_name   = 'activity_images'
      AND ccu.column_name  = 'kind'
  `);
  assert.ok(rows.length > 0, 'No CHECK constraint found on activity_images.kind');
  const clause = rows[0].check_clause;
  assert.ok(
    clause.includes('cover') && clause.includes('gallery'),
    `CHECK clause should include 'cover' and 'gallery', got: ${clause}`,
  );
});

test('AC2: activity_images.sort_order column has DEFAULT 0', async () => {
  if (!HAS_DB) {
    throw new Error('[EXPECTED-RED pre-migration] activity_images table does not exist — migration not applied');
  }
  const rows = await queryInformationSchema(`
    SELECT column_default, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'activity_images'
      AND column_name  = 'sort_order'
  `);
  assert.ok(rows.length > 0, 'Column sort_order not found on activity_images');
  assert.ok(
    rows[0].column_default?.includes('0'),
    `sort_order should have DEFAULT 0, got: ${rows[0].column_default}`,
  );
});

test('AC2: activity_images has index on (activity_id, sort_order)', async () => {
  if (!HAS_DB) {
    throw new Error('[EXPECTED-RED pre-migration] activity_images table does not exist — migration not applied');
  }
  const rows = await queryInformationSchema(`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename  = 'activity_images'
      AND indexdef LIKE '%activity_id%sort_order%'
  `);
  assert.ok(rows.length > 0, 'No index on (activity_id, sort_order) found for activity_images');
});

test('AC2: activity_images FK to activities has ON DELETE CASCADE', async () => {
  if (!HAS_DB) {
    throw new Error('[EXPECTED-RED pre-migration] activity_images table does not exist — migration not applied');
  }
  const rows = await queryInformationSchema(`
    SELECT rc.delete_rule
    FROM information_schema.referential_constraints rc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = rc.constraint_name
    WHERE kcu.table_schema = 'public'
      AND kcu.table_name   = 'activity_images'
      AND kcu.column_name  = 'activity_id'
  `);
  assert.ok(rows.length > 0, 'No FK constraint found for activity_images.activity_id');
  assert.equal(rows[0].delete_rule, 'CASCADE', 'FK should be ON DELETE CASCADE');
});

// ─── AC2: activity_plan_tiers table ──────────────────────────────────────────

test('AC2: activity_plan_tiers table exists', async () => {
  if (!HAS_DB) {
    throw new Error('[EXPECTED-RED pre-migration] activity_plan_tiers table does not exist — migration not applied');
  }
  const rows = await queryInformationSchema(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name   = 'activity_plan_tiers'
  `);
  assert.ok(rows.length > 0, 'Table activity_plan_tiers not found');
});

test('AC2: activity_plan_tiers.tier column has CHECK constraint (adult|child|infant)', async () => {
  if (!HAS_DB) {
    throw new Error('[EXPECTED-RED pre-migration] activity_plan_tiers table does not exist — migration not applied');
  }
  const rows = await queryInformationSchema(`
    SELECT cc.check_clause
    FROM information_schema.check_constraints cc
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = cc.constraint_name
    WHERE ccu.table_schema = 'public'
      AND ccu.table_name   = 'activity_plan_tiers'
      AND ccu.column_name  = 'tier'
  `);
  assert.ok(rows.length > 0, 'No CHECK constraint found on activity_plan_tiers.tier');
  const clause = rows[0].check_clause;
  assert.ok(
    clause.includes('adult') && clause.includes('child') && clause.includes('infant'),
    `CHECK clause should include 'adult', 'child', 'infant', got: ${clause}`,
  );
});

test('AC2: activity_plan_tiers has UNIQUE(plan_id, tier)', async () => {
  if (!HAS_DB) {
    throw new Error('[EXPECTED-RED pre-migration] activity_plan_tiers table does not exist — migration not applied');
  }
  const rows = await queryInformationSchema(`
    SELECT tc.constraint_type
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name
    WHERE tc.table_schema   = 'public'
      AND tc.table_name     = 'activity_plan_tiers'
      AND tc.constraint_type = 'UNIQUE'
      AND kcu.column_name   IN ('plan_id', 'tier')
    GROUP BY tc.constraint_name, tc.constraint_type
    HAVING COUNT(DISTINCT kcu.column_name) = 2
  `);
  assert.ok(rows.length > 0, 'No UNIQUE(plan_id, tier) constraint found on activity_plan_tiers');
});

test('AC2: activity_plan_tiers FK to activity_plans has ON DELETE CASCADE', async () => {
  if (!HAS_DB) {
    throw new Error('[EXPECTED-RED pre-migration] activity_plan_tiers table does not exist — migration not applied');
  }
  const rows = await queryInformationSchema(`
    SELECT rc.delete_rule
    FROM information_schema.referential_constraints rc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = rc.constraint_name
    WHERE kcu.table_schema = 'public'
      AND kcu.table_name   = 'activity_plan_tiers'
      AND kcu.column_name  = 'plan_id'
  `);
  assert.ok(rows.length > 0, 'No FK constraint found for activity_plan_tiers.plan_id');
  assert.equal(rows[0].delete_rule, 'CASCADE', 'FK should be ON DELETE CASCADE');
});

test('AC2: both new tables have RLS enabled', async () => {
  if (!HAS_DB) {
    throw new Error('[EXPECTED-RED pre-migration] new tables do not exist — migration not applied');
  }
  const rows = await queryInformationSchema(`
    SELECT relname, relrowsecurity
    FROM pg_class
    WHERE relname IN ('activity_images', 'activity_plan_tiers')
      AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  `);
  assert.equal(rows.length, 2, 'Expected 2 tables, found ' + rows.length);
  for (const row of rows) {
    assert.equal(row.relrowsecurity, true, `RLS not enabled on ${row.relname}`);
  }
});
