import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(
  __dirname,
  '../../../../supabase/migrations/20260513_issue477_refund_requests_retry_fields.sql'
);

const sql = readFileSync(migrationPath, 'utf8');

test('migration contains retry_count column', () => {
  assert.ok(sql.includes('retry_count'), 'retry_count must be present in migration');
});

test('migration contains last_error column', () => {
  assert.ok(sql.includes('last_error'), 'last_error must be present in migration');
});

test('migration references payment_events RLS', () => {
  assert.ok(
    sql.includes('payment_events'),
    'payment_events RLS tightening must be present in migration'
  );
});

test('migration uses IF NOT EXISTS safety guards', () => {
  assert.ok(
    sql.includes('IF NOT EXISTS'),
    'IF NOT EXISTS safety guard must be present in migration'
  );
});
