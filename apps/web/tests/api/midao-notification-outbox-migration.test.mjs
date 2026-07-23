import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(here, '../../../../supabase/migrations/20260723001000_midao_notification_outbox.sql');

function migrationSql() {
  assert.equal(fs.existsSync(migrationPath), true, 'notification outbox migration file must exist');
  return fs.readFileSync(migrationPath, 'utf8');
}

test('notification outbox migration creates the complete durable schema', () => {
  const sql = migrationSql();
  assert.match(sql, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.midao_notification_outbox/iu);
  for (const column of [
    'event_name', 'aggregate_type', 'aggregate_id', 'payload', 'status',
    'attempt_count', 'next_attempt_at', 'last_error_code', 'created_at', 'delivered_at',
  ]) {
    assert.match(sql, new RegExp(`\\b${column}\\b`, 'iu'), `missing outbox column ${column}`);
  }
  assert.match(sql, /status\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'pending'/iu);
  assert.match(sql, /status\s+IN\s*\(\s*'pending'\s*,\s*'processing'\s*,\s*'delivered'\s*,\s*'failed'\s*\)/iu);
  assert.match(sql, /attempt_count\s+INTEGER\s+NOT\s+NULL\s+DEFAULT\s+0/iu);
});

test('notification outbox migration creates a deterministic claim index', () => {
  const sql = migrationSql();
  assert.match(sql, /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+midao_notification_outbox_claim_idx/iu);
  assert.match(sql, /ON\s+public\.midao_notification_outbox\s*\(\s*status\s*,\s*next_attempt_at\s*,\s*created_at\s*\)/iu);
});

test('notification outbox is service-role-only and forces RLS', () => {
  const sql = migrationSql();
  assert.match(sql, /ALTER\s+TABLE\s+public\.midao_notification_outbox\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/iu);
  assert.match(sql, /ALTER\s+TABLE\s+public\.midao_notification_outbox\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/iu);
  assert.match(sql, /REVOKE\s+ALL\s+ON\s+TABLE\s+public\.midao_notification_outbox\s+FROM\s+PUBLIC\s*,\s*anon\s*,\s*authenticated/iu);
  assert.match(sql, /GRANT\s+SELECT\s*,\s*INSERT\s*,\s*UPDATE\s*,\s*DELETE\s+ON\s+TABLE\s+public\.midao_notification_outbox\s+TO\s+service_role/iu);
  assert.doesNotMatch(sql, /GRANT[\s\S]*?TO\s+(?:PUBLIC|anon|authenticated)/iu);
});

test('notification payload comment forbids sensitive data', () => {
  const sql = migrationSql();
  assert.match(sql, /COMMENT\s+ON\s+COLUMN\s+public\.midao_notification_outbox\.payload\s+IS\s+'/iu);
  assert.match(sql, /PII/iu);
  assert.match(sql, /payment\s+secrets?/iu);
});
