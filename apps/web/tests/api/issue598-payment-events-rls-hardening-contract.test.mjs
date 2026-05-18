import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(
  __dirname,
  '../../../../supabase/migrations/20260518_issue598_payment_events_rls_hardening.sql'
);

const sql = readFileSync(migrationPath, 'utf8');

test('drops legacy public all-true payment_events policy', () => {
  assert.match(
    sql,
    /DROP POLICY IF EXISTS\s+"payment_events:\s*service role full access"\s+ON\s+payment_events;/i
  );
});

test('enforces service_role-only policy for payment_events', () => {
  assert.match(
    sql,
    /CREATE POLICY\s+"payment_events:\s*service_role only"\s+ON\s+payment_events\s+FOR ALL\s+TO\s+service_role\s+USING\s*\(true\)\s+WITH CHECK\s*\(true\);/i
  );
});

test('revokes anon/authenticated/public table privileges on payment_events', () => {
  assert.match(
    sql,
    /REVOKE ALL ON TABLE\s+payment_events\s+FROM\s+anon,\s*authenticated,\s*public;/i
  );
});

test('keeps service_role table privileges for payment_events', () => {
  assert.match(
    sql,
    /GRANT ALL ON TABLE\s+payment_events\s+TO\s+service_role;/i
  );
});
