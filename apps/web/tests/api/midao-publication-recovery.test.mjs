import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { lexPostgresSql } from '../helpers/sql-source-lexer.mjs';

const migrationUrl = new URL(
  '../../../../supabase/migrations/20260723023000_midao_atomic_publication_restore.sql',
  import.meta.url,
);
const rollbackUrl = new URL(
  '../../../../supabase/migrations/20260723023000_midao_atomic_publication_restore.rollback.sql',
  import.meta.url,
);
const identity = 'public.midao_restore_service_publication(uuid, integer, text, text, text, text)';

function source() {
  assert.equal(existsSync(migrationUrl), true, 'atomic publication-restore migration must exist');
  return readFileSync(migrationUrl, 'utf8');
}

function normalize(statement) {
  return statement.replace(/\s+/gu, ' ').trim().replace(/;$/u, '').toLowerCase();
}

function contract() {
  const statements = lexPostgresSql(source()).statements;
  assert.equal(statements.length, 3, 'only CREATE FUNCTION, exact REVOKE, and exact GRANT are allowed');
  return { statements, body: statements[0].toLowerCase() };
}

function count(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

test('restore migration exposes one fixed SECURITY DEFINER RPC with service-role-only execute ACL', () => {
  const { statements } = contract();
  const [create, revoke, grant] = statements;
  assert.match(
    create,
    /create\s+or\s+replace\s+function\s+public\.midao_restore_service_publication\s*\(\s*p_activity_id\s+uuid\s*,\s*p_source_version\s+integer\s*,\s*p_actor_type\s+text\s*,\s*p_actor_id\s+text\s*,\s*p_idempotency_key\s+text\s*,\s*p_request_hash\s+text\s*\)\s*returns\s+jsonb/iu,
  );
  assert.match(create, /security\s+definer/iu);
  assert.match(create, /set\s+search_path\s*=\s*pg_catalog/iu);
  assert.doesNotMatch(create, /\bexecute\b|\bcall\b|\bdo\s+\$/iu, 'dynamic SQL is forbidden');
  assert.equal(normalize(revoke), `revoke all on function ${identity} from public, anon, authenticated`);
  assert.equal(normalize(grant), `grant execute on function ${identity} to service_role`);
});

test('RPC validates admin identity and replay inputs at the database boundary', () => {
  const { body } = contract();
  for (const fragment of [
    'p_activity_id is null',
    'p_source_version is null or p_source_version < 1',
    "v_actor_type is null or v_actor_type <> 'admin'",
    "v_actor_id is null or v_actor_id = ''",
    'pg_catalog.octet_length(v_actor_id) > 128',
    'pg_catalog.octet_length(v_idempotency_key) > 128',
    "v_request_hash !~ '^[0-9a-f]{64}$'",
  ]) assert.ok(body.includes(fragment), `missing validation fragment: ${fragment}`);
  assert.match(body, /v_actor_type\s*:=\s*pg_catalog\.lower\(pg_catalog\.btrim\(p_actor_type\)\)/u);
  assert.match(body, /v_actor_id\s*:=\s*pg_catalog\.lower\(pg_catalog\.btrim\(p_actor_id\)\)/u);
  assert.match(body, /message\s*=\s*'admin_authorization_required'/u);
});

test('idempotency is claimed before business locks and exact replays return the stored response', () => {
  const { body } = contract();
  const claim = body.indexOf('insert into public.midao_idempotency_records');
  const claimLock = body.indexOf('from public.midao_idempotency_records', claim);
  const hashCheck = body.indexOf('v_idempotency.request_hash <> v_request_hash', claimLock);
  const replay = body.indexOf("v_idempotency.state = 'completed'", hashCheck);
  const activityLock = body.indexOf('from public.activities', replay);
  assert.ok(claim >= 0 && claimLock > claim && hashCheck > claimLock && replay > hashCheck && activityLock > replay);
  assert.match(body.slice(claim, claimLock), /on\s+conflict\s*\(scope_type,\s*scope_id,\s*command_name,\s*idempotency_key\)\s*do\s+nothing/u);
  assert.match(body.slice(claimLock, hashCheck), /for\s+update/u);
  assert.match(body.slice(hashCheck, replay), /idempotency_conflict/u);
  assert.match(body.slice(replay, activityLock), /return\s+v_idempotency\.response_body/u);
  assert.match(body, /'restore_service_publication'/u);
  assert.match(body, /'activity'/u);
});

test('activity and immutable source version are locked and validated before canonical writes', () => {
  const { body } = contract();
  const activityLock = body.indexOf('from public.activities');
  const sourceLock = body.indexOf('from public.service_publication_versions');
  const activityWrite = body.indexOf('update public.activities');
  assert.ok(activityLock >= 0 && sourceLock > activityLock && activityWrite > sourceLock);
  assert.match(body.slice(activityLock, sourceLock), /for\s+update/u);
  assert.match(
    body.slice(sourceLock, activityWrite),
    /where\s+activity_id\s*=\s*p_activity_id\s+and\s+version\s*=\s*p_source_version\s+for\s+share/u,
  );
  assert.match(body.slice(activityLock, sourceLock), /activity_not_found/u);
  assert.match(body.slice(sourceLock, activityWrite), /source_version_not_found/u);
  assert.match(body.slice(sourceLock, activityWrite), /source_snapshot_invalid/u);
  assert.doesNotMatch(body, /for\s+(?:update|share)\s+(?:nowait|skip\s+locked)/u);
});

test('source payload atomically re-materializes activity, plans, and questions in order', () => {
  const { body } = contract();
  const activityWrite = body.indexOf('update public.activities');
  const plansDeactivate = body.indexOf('update public.activity_plans');
  const plansInsert = body.indexOf('insert into public.activity_plans');
  const questionsDelete = body.indexOf('delete from public.activity_intake_questions');
  const questionsInsert = body.indexOf('insert into public.activity_intake_questions');
  const versionInsert = body.indexOf('insert into public.service_publication_versions');
  assert.ok(
    activityWrite >= 0
      && plansDeactivate > activityWrite
      && plansInsert > plansDeactivate
      && questionsDelete > plansInsert
      && questionsInsert > questionsDelete
      && versionInsert > questionsInsert,
  );
  assert.match(body, /v_payload\s*:=\s*v_source\.snapshot\s*->\s*'payload'/u);
  assert.doesNotMatch(body, /delete\s+from\s+public\.activity_plans/u, 'plan history must remain FK-safe');
  assert.match(body, /on\s+conflict\s*\(\s*activity_id\s*,\s*slug\s*\)\s*do\s+update/u);
});

test('restore appends exactly one next immutable version and preserves every historical row', () => {
  const { body } = contract();
  assert.equal(count(body, /insert\s+into\s+public\.service_publication_versions\b/gu), 1);
  assert.equal(count(body, /update\s+public\.service_publication_versions\b/gu), 0);
  assert.equal(count(body, /delete\s+from\s+public\.service_publication_versions\b/gu), 0);
  assert.match(body, /coalesce\(\s*max\(version\)\s*,\s*0\s*\)/u);
  assert.match(body, /v_next_version\s*:=\s*v_previous_version\s*\+\s*1/u);
  assert.match(body, /'sourceversion'\s*,\s*p_source_version/u);
  assert.match(body, /'restoredby'\s*,\s*v_actor_id/u);
  assert.match(body, /'payload'\s*,\s*v_payload/u);
});

test('success payload is stable and idempotency completes only after the immutable version append', () => {
  const { body } = contract();
  const versionInsert = body.indexOf('insert into public.service_publication_versions');
  const response = body.indexOf('v_response := pg_catalog.jsonb_build_object', versionInsert);
  const complete = body.indexOf('update public.midao_idempotency_records', response);
  assert.ok(versionInsert >= 0 && response > versionInsert && complete > response);
  for (const fragment of [
    "'restored', true",
    "'code', 'restored'",
    "'activityid', p_activity_id",
    "'sourceversion', p_source_version",
    "'version', v_next_version",
    "'status', 'published'",
  ]) assert.ok(body.includes(fragment), `missing response fragment: ${fragment}`);
  assert.match(body.slice(complete), /state\s*=\s*'completed'/u);
  assert.match(body.slice(complete), /response_status\s*=\s*200/u);
  assert.match(body.slice(complete), /response_body\s*=\s*v_response/u);
  assert.match(body.slice(complete), /resource_type\s*=\s*'service_publication'/u);
});

test('database failures remain all-or-nothing and cannot be converted to a false recovery result', () => {
  const { body } = contract();
  assert.doesNotMatch(body, /\bexception\s+when\b/u);
  assert.doesNotMatch(body, /\b(?:commit|rollback|savepoint)\b/u);
  assert.doesNotMatch(body, /\b(?:sqlerrm|message_text|get stacked diagnostics)\b/u);
});

test('rollback companion is operator-only and removes only the new RPC', () => {
  assert.equal(existsSync(rollbackUrl), true, 'publication-restore rollback companion must exist');
  const raw = readFileSync(rollbackUrl, 'utf8');
  assert.match(raw, /OPERATOR-ONLY ROLLBACK COMPANION/u);
  assert.match(raw, /NEVER auto-run/u);
  assert.match(raw, /midao\.rollback_owner_authorized/u);
  assert.match(raw, /RAISE EXCEPTION/u);
  assert.match(raw, /DROP FUNCTION IF EXISTS public\.midao_restore_service_publication\(uuid,\s*integer,\s*text,\s*text,\s*text,\s*text\)/u);
  assert.doesNotMatch(raw, /(?:DELETE|TRUNCATE|DROP TABLE)\s+public\.service_publication_versions/iu);
});
