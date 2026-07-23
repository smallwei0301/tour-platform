import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { lexPostgresSql } from '../helpers/sql-source-lexer.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(here, '../../../../supabase/migrations/20260723002500_midao_audit_events.sql');

function migrationSql() {
  assert.equal(fs.existsSync(migrationPath), true, 'transactional audit migration file must exist');
  return fs.readFileSync(migrationPath, 'utf8');
}

function assertFullContract(rawSql) {
  const { executable: sql, statements } = lexPostgresSql(rawSql);
  assert.match(sql, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.midao_audit_events/iu);
  for (const pattern of [
    /^\s*id\s+UUID\s+PRIMARY\s+KEY\s+DEFAULT\s+gen_random_uuid\(\)\s*,\s*$/imu,
    /^\s*actor_type\s+TEXT\s+NOT\s+NULL\s*,\s*$/imu,
    /^\s*actor_id\s+TEXT\s+NOT\s+NULL\s*,\s*$/imu,
    /^\s*guide_id\s+UUID\s+NOT\s+NULL\s*,\s*$/imu,
    /^\s*action\s+TEXT\s+NOT\s+NULL\s*,\s*$/imu,
    /^\s*resource_type\s+TEXT\s+NOT\s+NULL\s*,\s*$/imu,
    /^\s*resource_id\s+TEXT\s+NOT\s+NULL\s*,\s*$/imu,
    /^\s*request_id\s+UUID\s+NOT\s+NULL\s*,\s*$/imu,
    /^\s*reason\s+TEXT\s*,\s*$/imu,
    /^\s*metadata\s+JSONB\s+NOT\s+NULL\s+DEFAULT\s+'\{\}'::jsonb\s*,\s*$/imu,
    /^\s*created_at\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s+now\(\)\s*,?\s*$/imu,
  ]) assert.match(sql, pattern);

  assert.match(sql, /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+midao_audit_events_action_request_idx\s+ON\s+public\.midao_audit_events\s*\(\s*action\s*,\s*request_id\s*,\s*id\s*\)/iu);
  assert.match(sql, /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+midao_audit_events_guide_created_idx\s+ON\s+public\.midao_audit_events\s*\(\s*guide_id\s*,\s*created_at\s*,\s*id\s*\)/iu);

  const rls = statements.filter((statement) => /^ALTER TABLE PUBLIC\.MIDAO_AUDIT_EVENTS (?:ENABLE|DISABLE|FORCE|NO FORCE) ROW LEVEL SECURITY$/u.test(statement));
  assert.deepEqual(rls, [
    'ALTER TABLE PUBLIC.MIDAO_AUDIT_EVENTS ENABLE ROW LEVEL SECURITY',
    'ALTER TABLE PUBLIC.MIDAO_AUDIT_EVENTS FORCE ROW LEVEL SECURITY',
  ]);
  const acl = statements.filter((statement) => /^(?:GRANT|REVOKE)\s/u.test(statement));
  assert.deepEqual(acl, [
    'REVOKE ALL ON TABLE PUBLIC.MIDAO_AUDIT_EVENTS FROM PUBLIC, ANON, AUTHENTICATED',
    'GRANT SELECT, INSERT ON TABLE PUBLIC.MIDAO_AUDIT_EVENTS TO SERVICE_ROLE',
  ]);
  assert.doesNotMatch(statements.join('; '), /CREATE\s+POLICY/iu);
  assert.doesNotMatch(sql, /\baudit_logs\b/iu);

  const comment = sql.match(/COMMENT\s+ON\s+COLUMN\s+public\.midao_audit_events\.metadata\s+IS\s+'([^']*)'/iu);
  assert.ok(comment, 'metadata comment must exist');
  assert.match(comment[1], /must\s+not\s+contain\s+tokens?\s*,\s*cookies?\s*,\s*payment\s+secrets?\s*,\s*or\s+complete\s+traveler\s+PII/iu);
}

test('transactional audit migration satisfies the exact schema and security contract', () => {
  assertFullContract(migrationSql());
});

test('transactional audit source contract rejects critical mutations', () => {
  const sql = migrationSql();
  const mutations = [
    ['actor type nullable', sql.replace('actor_type TEXT NOT NULL', 'actor_type TEXT')],
    ['guide type', sql.replace('guide_id UUID NOT NULL', 'guide_id TEXT NOT NULL')],
    ['request nullable', sql.replace('request_id UUID NOT NULL', 'request_id UUID')],
    ['metadata nullable', sql.replace("metadata JSONB NOT NULL DEFAULT '{}'::jsonb", 'metadata JSONB')],
    ['action request tie removed', sql.replace('(action, request_id, id)', '(action, request_id)')],
    ['guide time tie removed', sql.replace('(guide_id, created_at, id)', '(guide_id, created_at)')],
    ['disable RLS appended', `${sql}\nALTER TABLE public.midao_audit_events DISABLE ROW LEVEL SECURITY;`],
    ['extra update grant', `${sql}\nGRANT UPDATE ON TABLE public.midao_audit_events TO service_role;`],
    ['hidden public grant', `${sql}\nCOMMENT ON TABLE public.midao_audit_events IS 'safe -- text'; GRANT SELECT ON TABLE public.midao_audit_events TO PUBLIC;`],
    ['legacy audit delegation', `${sql}\nINSERT INTO public.audit_logs DEFAULT VALUES;`],
    ['sensitive metadata', sql.replace('must not contain tokens, cookies, payment secrets, or complete traveler PII', 'may contain tokens, cookies, payment secrets, or complete traveler PII')],
  ];
  for (const [name, mutant] of mutations) {
    assert.notEqual(mutant, sql, `${name} must alter SQL`);
    assert.throws(() => assertFullContract(mutant), `${name} must fail`);
  }
});
