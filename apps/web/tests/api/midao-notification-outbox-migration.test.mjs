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

function assertColumns(sql) {
  assert.match(sql, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.midao_notification_outbox/iu);
  const exactLines = [
    /^\s*id\s+UUID\s+PRIMARY\s+KEY\s+DEFAULT\s+gen_random_uuid\(\)\s*,\s*$/imu,
    /^\s*event_name\s+TEXT\s+NOT\s+NULL\s*,\s*$/imu,
    /^\s*aggregate_type\s+TEXT\s+NOT\s+NULL\s*,\s*$/imu,
    /^\s*aggregate_id\s+TEXT\s+NOT\s+NULL\s*,\s*$/imu,
    /^\s*payload\s+JSONB\s+NOT\s+NULL\s*,\s*$/imu,
    /^\s*status\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'pending'\s*,\s*$/imu,
    /^\s*attempt_count\s+INTEGER\s+NOT\s+NULL\s+DEFAULT\s+0\s*,\s*$/imu,
    /^\s*next_attempt_at\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s+now\(\)\s*,\s*$/imu,
    /^\s*last_error_code\s+TEXT\s*,\s*$/imu,
    /^\s*created_at\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s+now\(\)\s*,\s*$/imu,
    /^\s*delivered_at\s+TIMESTAMPTZ\s*,?\s*$/imu,
  ];
  for (const pattern of exactLines) assert.match(sql, pattern);
}

function assertConstraints(sql) {
  assert.match(sql, /CONSTRAINT\s+midao_notification_outbox_status_check\s+CHECK\s*\(\s*status\s+IN\s*\(\s*'pending'\s*,\s*'processing'\s*,\s*'delivered'\s*,\s*'failed'\s*\)\s*\)/iu);
  assert.match(sql, /CONSTRAINT\s+midao_notification_outbox_attempt_count_check\s+CHECK\s*\(\s*attempt_count\s*>=\s*0\s*\)/iu);
}

function assertClaimIndex(sql) {
  assert.match(sql, /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+midao_notification_outbox_claim_idx\s+ON\s+public\.midao_notification_outbox\s*\(\s*status\s*,\s*next_attempt_at\s*,\s*created_at\s*,\s*id\s*\)\s+WHERE\s+status\s+IN\s*\(\s*'pending'\s*,\s*'failed'\s*\)/iu);
}

function assertSecurity(sql) {
  assert.match(sql, /ALTER\s+TABLE\s+public\.midao_notification_outbox\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/iu);
  assert.match(sql, /ALTER\s+TABLE\s+public\.midao_notification_outbox\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/iu);
  assert.match(sql, /REVOKE\s+ALL\s+ON\s+TABLE\s+public\.midao_notification_outbox\s+FROM\s+PUBLIC\s*,\s*anon\s*,\s*authenticated/iu);
  assert.match(sql, /GRANT\s+SELECT\s*,\s*INSERT\s*,\s*UPDATE\s*,\s*DELETE\s+ON\s+TABLE\s+public\.midao_notification_outbox\s+TO\s+service_role/iu);
  assert.doesNotMatch(sql, /CREATE\s+POLICY/iu);
  assert.doesNotMatch(sql, /GRANT[\s\S]*?TO\s+(?:PUBLIC|anon|authenticated)/iu);
}

function assertPayloadComment(sql) {
  const match = sql.match(/COMMENT\s+ON\s+COLUMN\s+public\.midao_notification_outbox\.payload\s+IS\s+'([^']*)'/iu);
  assert.ok(match, 'payload comment must exist');
  assert.match(match[1], /must\s+not\s+contain\s+complete\s+PII\s+or\s+payment\s+secrets/iu);
}

function assertFullContract(sql) {
  assertColumns(sql);
  assertConstraints(sql);
  assertClaimIndex(sql);
  assertSecurity(sql);
  assertPayloadComment(sql);
}

test('notification outbox migration satisfies the exact durable and security contract', () => {
  assertFullContract(migrationSql());
});

test('notification outbox source contract rejects meaningful mutations', () => {
  const sql = migrationSql();
  const mutations = [
    sql.replace('event_name TEXT NOT NULL', 'event_name TEXT'),
    sql.replace('payload JSONB NOT NULL', 'payload TEXT NOT NULL'),
    sql.replace("DEFAULT 'pending'", "DEFAULT 'failed'"),
    sql.replace('CHECK (attempt_count >= 0)', 'CHECK (attempt_count >= -1)'),
    sql.replace(', created_at, id)', ', created_at)'),
    sql.replace("WHERE status IN ('pending', 'failed')", ''),
    `${sql}\nCREATE POLICY accidental_public_policy ON public.midao_notification_outbox USING (true);`,
    sql.replace('must not contain complete PII or payment secrets', 'may contain complete PII or payment secrets'),
  ];
  for (const [index, mutant] of mutations.entries()) {
    assert.throws(() => assertFullContract(mutant), `mutation ${index + 1} must fail the source contract`);
  }
});
