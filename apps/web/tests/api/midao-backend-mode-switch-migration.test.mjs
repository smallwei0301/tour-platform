import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { lexPostgresSql } from '../helpers/sql-source-lexer.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const migrationPath = resolve(here, '../../../../supabase/migrations/20260723003000_midao_atomic_backend_mode_switch.sql');
const identity = 'public.midao_switch_guide_backend_mode(uuid,text,text,text,text,uuid,text,text)';

function source() {
  assert.equal(existsSync(migrationPath), true, 'atomic backend-mode migration must exist');
  return readFileSync(migrationPath, 'utf8');
}

function normalize(statement) {
  return statement.replace(/\s+/gu, ' ').trim().replace(/;$/u, '').toLowerCase();
}

test('migration exposes one fixed security-definer function and exact execute ACL', () => {
  const statements = lexPostgresSql(source()).statements;
  assert.equal(statements.length, 3, 'only CREATE FUNCTION, exact REVOKE, exact GRANT are allowed');
  const [create, revoke, grant] = statements;
  assert.match(create, /create\s+or\s+replace\s+function\s+public\.midao_switch_guide_backend_mode\s*\(\s*p_guide_id\s+uuid\s*,\s*p_target_mode\s+text\s*,\s*p_reason\s+text\s*,\s*p_actor_type\s+text\s*,\s*p_actor_id\s+text\s*,\s*p_request_id\s+uuid\s*,\s*p_idempotency_key\s+text\s*,\s*p_request_hash\s+text\s*\)\s*returns\s+jsonb/iu);
  assert.match(create, /security\s+definer/iu);
  assert.match(create, /set\s+search_path\s*=\s*pg_catalog/iu);
  assert.doesNotMatch(create, /\bexecute\b|\bcall\b|\bdo\s+\$/iu, 'dynamic SQL is forbidden');
  assert.equal(normalize(revoke), `revoke all on function ${identity} from public, anon, authenticated`);
  assert.equal(normalize(grant), `grant execute on function ${identity} to service_role`);
});

test('function validates inputs then claims scoped idempotency before locking canonical guide', () => {
  const body = lexPostgresSql(source()).statements[0].toLowerCase();
  for (const fragment of [
    "p_target_mode not in ('legacy', 'midao')",
    'btrim(p_reason)',
    'p_actor_type',
    'p_actor_id',
    'p_request_id',
    'octet_length(p_idempotency_key)',
    "p_request_hash !~ '^[0-9a-f]{64}$'",
    "v_scope_type constant text := 'guide'",
    'v_scope_id uuid := p_guide_id',
  ]) assert.ok(body.includes(fragment), `missing validation/scope fragment: ${fragment}`);

  const claim = body.indexOf('insert into public.midao_idempotency_records');
  const idempotencyLock = body.indexOf('from public.midao_idempotency_records', claim);
  const guideLock = body.indexOf('from public.guide_profiles');
  assert.ok(claim >= 0 && idempotencyLock > claim && guideLock > idempotencyLock, 'claim/lock idempotency must precede guide FOR UPDATE');
  assert.match(body.slice(idempotencyLock, guideLock), /for\s+update/u);
  assert.match(body.slice(guideLock), /for\s+update/u);
  assert.match(body, /scope_type,\s*scope_id,\s*command_name,\s*idempotency_key/iu);
  assert.match(body, /on\s+conflict\s*\(scope_type,\s*scope_id,\s*command_name,\s*idempotency_key\)\s*do\s+nothing/iu);
});

test('same-hash replay returns snapshot; different hash conflicts before side effects', () => {
  const body = lexPostgresSql(source()).statements[0].toLowerCase();
  const hashCheck = body.indexOf('v_idempotency.request_hash <> p_request_hash');
  const replay = body.indexOf("v_idempotency.state = 'completed'");
  const guideLock = body.indexOf('from public.guide_profiles');
  assert.ok(hashCheck >= 0 && replay > hashCheck && guideLock > replay);
  assert.match(body.slice(replay, guideLock), /return\s+v_idempotency\.response_body/iu);
  assert.match(body.slice(hashCheck, replay), /raise\s+exception/iu);
});

test('changed mode bumps version once then writes audit/outbox before completing idempotency', () => {
  const body = lexPostgresSql(source()).statements[0].toLowerCase();
  const sameMode = body.indexOf('v_guide.backend_mode = p_target_mode');
  const profileUpdate = body.indexOf('update public.guide_profiles');
  const auditInsert = body.indexOf('insert into public.midao_audit_events');
  const outboxInsert = body.indexOf('insert into public.midao_notification_outbox');
  const complete = body.indexOf('update public.midao_idempotency_records', profileUpdate);
  assert.ok(sameMode >= 0 && profileUpdate > sameMode && auditInsert > profileUpdate && outboxInsert > auditInsert && complete > outboxInsert);
  assert.match(body.slice(profileUpdate, auditInsert), /guide_session_version\s*=\s*coalesce\(guide_session_version,\s*1\)\s*\+\s*1/iu);
  assert.equal((body.match(/insert into public\.midao_audit_events/gu) || []).length, 1);
  assert.equal((body.match(/insert into public\.midao_notification_outbox/gu) || []).length, 1);
  assert.match(body.slice(complete), /state\s*=\s*'completed'/iu);
  assert.match(body.slice(complete), /response_body\s*=\s*v_response/iu);
});

test('same-mode and unknown/inactive guide paths preserve atomic no-side-effect semantics', () => {
  const body = lexPostgresSql(source()).statements[0].toLowerCase();
  const sameMode = body.indexOf('v_guide.backend_mode = p_target_mode');
  const profileUpdate = body.indexOf('update public.guide_profiles');
  const sameBlock = body.slice(sameMode, profileUpdate);
  assert.match(sameBlock, /['"]changed['"]\s*,\s*false/iu);
  assert.match(sameBlock, /state\s*=\s*'completed'/iu);
  assert.match(sameBlock, /return\s+v_response/iu);
  assert.match(body, /guide_not_found/iu);
  assert.match(body, /guide_not_active/iu);
  assert.match(body, /verification_status\s*<>\s*'approved'/iu);
});

test('response/audit/outbox snapshots are canonical and exclude credentials', () => {
  const body = lexPostgresSql(source()).statements[0].toLowerCase();
  for (const field of ['backendmode', 'sessionversion', 'changed', 'redirectto']) {
    assert.ok(body.includes(`'${field}'`) || body.includes(`"${field}"`));
  }
  assert.match(body, /event_name[\s\s]*|event_name/iu);
  assert.doesNotMatch(body, /admin_token|guide_token|cookie|password|service_role_key/iu);
});
