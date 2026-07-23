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
  const statements = sql
    .split(';')
    .map((statement) => statement.replace(/\s+/gu, ' ').trim().toUpperCase())
    .filter(Boolean);
  assert.ok(statements.includes('ALTER TABLE PUBLIC.MIDAO_NOTIFICATION_OUTBOX ENABLE ROW LEVEL SECURITY'));
  assert.ok(statements.includes('ALTER TABLE PUBLIC.MIDAO_NOTIFICATION_OUTBOX FORCE ROW LEVEL SECURITY'));
  const aclStatements = statements.filter((statement) => /^(?:GRANT|REVOKE)\s/u.test(statement));
  assert.deepEqual(aclStatements, [
    'REVOKE ALL ON TABLE PUBLIC.MIDAO_NOTIFICATION_OUTBOX FROM PUBLIC, ANON, AUTHENTICATED',
    'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE PUBLIC.MIDAO_NOTIFICATION_OUTBOX TO SERVICE_ROLE',
  ]);
  assert.doesNotMatch(sql, /CREATE\s+POLICY/iu);
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

test('notification outbox source contract rejects every named contract mutation', () => {
  const sql = migrationSql();
  const mutations = [
    ['id type', sql.replace('id UUID PRIMARY KEY', 'id TEXT PRIMARY KEY')],
    ['id default', sql.replace('DEFAULT gen_random_uuid()', 'DEFAULT NULL')],
    ['event_name nullability', sql.replace('event_name TEXT NOT NULL', 'event_name TEXT')],
    ['aggregate_type type', sql.replace('aggregate_type TEXT NOT NULL', 'aggregate_type UUID NOT NULL')],
    ['aggregate_id nullability', sql.replace('aggregate_id TEXT NOT NULL', 'aggregate_id TEXT')],
    ['payload type', sql.replace('payload JSONB NOT NULL', 'payload TEXT NOT NULL')],
    ['status default', sql.replace("DEFAULT 'pending'", "DEFAULT 'failed'")],
    ['attempt_count default', sql.replace('attempt_count INTEGER NOT NULL DEFAULT 0', 'attempt_count INTEGER NOT NULL DEFAULT 1')],
    ['next_attempt_at default', sql.replace('next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now()', 'next_attempt_at TIMESTAMPTZ NOT NULL')],
    ['last_error_code type', sql.replace('last_error_code TEXT,', 'last_error_code JSONB,')],
    ['created_at nullability', sql.replace('created_at TIMESTAMPTZ NOT NULL DEFAULT now()', 'created_at TIMESTAMPTZ DEFAULT now()')],
    ['delivered_at type', sql.replace('delivered_at TIMESTAMPTZ,', 'delivered_at TEXT,')],
    ['status constraint', sql.replace("'processing', ", '')],
    ['attempt constraint', sql.replace('CHECK (attempt_count >= 0)', 'CHECK (attempt_count >= -1)')],
    ['claim index tie breaker', sql.replace(', created_at, id)', ', created_at)')],
    ['claim index predicate', sql.replace("WHERE status IN ('pending', 'failed')", '')],
    ['enable RLS', sql.replace('ENABLE ROW LEVEL SECURITY', 'DISABLE ROW LEVEL SECURITY')],
    ['force RLS', sql.replace('FORCE ROW LEVEL SECURITY', 'NO FORCE ROW LEVEL SECURITY')],
    ['revoke roles', sql.replace('FROM PUBLIC, anon, authenticated', 'FROM PUBLIC, anon')],
    ['grant privileges', sql.replace('GRANT SELECT, INSERT, UPDATE, DELETE', 'GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE')],
    ['grant role', sql.replace('TO service_role;', 'TO authenticated;')],
    ['extra service role grant', `${sql}\nGRANT TRUNCATE ON TABLE public.midao_notification_outbox TO service_role;`],
    ['permissive policy', `${sql}\nCREATE POLICY accidental_public_policy ON public.midao_notification_outbox USING (true);`],
    ['payload sensitivity', sql.replace('must not contain complete PII or payment secrets', 'may contain complete PII or payment secrets')],
  ];
  for (const [name, mutant] of mutations) {
    assert.notEqual(mutant, sql, `${name} mutation must alter SQL`);
    assert.throws(() => assertFullContract(mutant), `${name} mutation must fail the source contract`);
  }
});
