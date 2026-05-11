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
 * These tests query information_schema.columns as the authoritative
 * source of truth. They will be RED until the migration is applied.
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
      // Pre-migration environment without DB — mark as expected-RED
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

// ─── AC1: all 6 columns present in single query ──────────────────────────────

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
