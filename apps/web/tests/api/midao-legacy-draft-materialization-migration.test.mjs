import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { lexPostgresSql } from '../helpers/sql-source-lexer.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const migrationPath = resolve(
  here,
  '../../../../supabase/migrations/20260813085910_issue1825_legacy_midao_draft_materialization.sql',
);
const materializerIdentity = 'public.midao_materialize_legacy_service_draft(uuid, uuid)';
const publishIdentity = 'public.midao_publish_service_draft(uuid, integer, uuid)';

function source() {
  assert.equal(existsSync(migrationPath), true, 'S1 materialization migration must exist');
  return readFileSync(migrationPath, 'utf8');
}

function normalize(statement) {
  return statement.replace(/\s+/gu, ' ').trim().replace(/;$/u, '').toLowerCase();
}

function functionStatement(name) {
  const statement = lexPostgresSql(source()).statements.find((entry) => entry.toLowerCase().includes(`function ${name}`));
  assert.ok(statement, `missing function ${name}`);
  return statement.toLowerCase();
}

test('migration adds append-only provenance columns with safe native defaults and constrained review state', () => {
  const sql = source().toLowerCase();
  assert.match(sql, /alter\s+table\s+public\.guide_service_drafts[\s\S]*add\s+column\s+if\s+not\s+exists\s+materialization_origin\s+text\s+not\s+null\s+default\s+'native'/u);
  assert.match(sql, /add\s+column\s+if\s+not\s+exists\s+materialization_review_state\s+text/u);
  assert.match(sql, /add\s+column\s+if\s+not\s+exists\s+materialized_at\s+timestamptz/u);
  assert.match(sql, /add\s+column\s+if\s+not\s+exists\s+materialized_revision\s+integer/u);
  assert.match(sql, /materialization_origin[\s\S]*check[\s\S]*'native'[\s\S]*'legacy_activity'/u);
  assert.match(sql, /materialization_review_state[\s\S]*check[\s\S]*is\s+null[\s\S]*'needs_review'/u);
  assert.match(sql, /materialized_revision[\s\S]*check[\s\S]*is\s+null[\s\S]*>\s*0/u);
  assert.doesNotMatch(sql, /update\s+public\.guide_service_drafts/u, 'existing draft provenance must not be rewritten');
});

test('materializer has fixed security-definer identity, exact ACL, activity-first lock and non-enumerating ownership failure', () => {
  const body = functionStatement('public.midao_materialize_legacy_service_draft');
  assert.match(body, /create\s+or\s+replace\s+function\s+public\.midao_materialize_legacy_service_draft\s*\(\s*p_activity_id\s+uuid\s*,\s*p_guide_id\s+uuid\s*\)\s*returns\s+jsonb/u);
  assert.match(body, /security\s+definer/u);
  assert.match(body, /set\s+search_path\s*=\s*pg_catalog/u);
  const activityLock = body.indexOf('from public.activities');
  const existingDraftRead = body.indexOf('from public.guide_service_drafts');
  assert.ok(activityLock >= 0 && existingDraftRead > activityLock, 'canonical activity must lock before active-draft lookup');
  assert.match(body.slice(activityLock, existingDraftRead), /for\s+update/u);
  assert.match(body, /v_activity\.guide_id\s+is\s+distinct\s+from\s+p_guide_id/u);
  assert.match(body, /activity_not_found_or_ownership_mismatch/u);
  assert.match(body, /'status'\s*,\s*404/u);
  assert.match(body, /'reused'/u);
  assert.doesNotMatch(body, /for\s+update\s+(?:nowait|skip\s+locked)/u);
});

test('materializer validates all-or-nothing legacy overlay and creates only whitelisted base payload', () => {
  const body = functionStatement('public.midao_materialize_legacy_service_draft');
  assert.match(body, /pending_changes/u);
  assert.match(body, /jsonb_typeof\(v_pending\)\s*<>\s*'object'/u);
  assert.match(body, /jsonb_object_keys/u);
  assert.match(body, /'title'/u);
  assert.match(body, /'description'/u);
  assert.match(body, /needs_review/u);
  assert.match(body, /jsonb_build_object\([\s\S]*'name'[\s\S]*'description'[\s\S]*'descriptions'\s*,\s*'\[\]'::jsonb[\s\S]*'plans'\s*,\s*'\[\]'::jsonb[\s\S]*'questions'\s*,\s*'\[\]'::jsonb/u);
  assert.doesNotMatch(body, /cover_image_url|image_urls|activity_images|activity_plans|activity_intake_questions/u);
});

test('materializer relies on the existing active-draft partial unique index and conflict-safe reread', () => {
  const body = functionStatement('public.midao_materialize_legacy_service_draft');
  assert.match(body, /insert\s+into\s+public\.guide_service_drafts/u);
  assert.match(body, /on\s+conflict\s*\(\s*activity_id\s*\)\s*where\s+status\s*=\s*'active'\s+do\s+nothing/u);
  const insert = body.indexOf('insert into public.guide_service_drafts');
  const reread = body.indexOf('from public.guide_service_drafts', insert);
  assert.ok(reread > insert, 'conflict path must reread the winning active draft');
  assert.match(body.slice(reread), /for\s+update/u);
});

test('replacement publish RPC preserves service-only ACL and blocks legacy origin before every canonical side effect', () => {
  const statements = lexPostgresSql(source()).statements;
  const publish = functionStatement('public.midao_publish_service_draft');
  assert.match(publish, /create\s+or\s+replace\s+function\s+public\.midao_publish_service_draft\s*\(\s*p_activity_id\s+uuid\s*,\s*p_expected_revision\s+integer\s*,\s*p_guide_id\s+uuid\s*\)\s*returns\s+jsonb/u);
  assert.match(publish, /security\s+definer/u);
  assert.match(publish, /set\s+search_path\s*=\s*pg_catalog/u);
  assert.match(publish, /v_activity\.guide_id\s+is\s+distinct\s+from\s+p_guide_id/u);
  assert.match(publish, /activity_not_found_or_ownership_mismatch/u);
  const guard = publish.indexOf("v_draft.materialization_origin = 'legacy_activity'");
  const activityWrite = publish.indexOf('update public.activities');
  const planWrite = publish.indexOf('update public.activity_plans');
  const questionWrite = publish.indexOf('delete from public.activity_intake_questions');
  const versionWrite = publish.indexOf('insert into public.service_publication_versions');
  const draftDelete = publish.indexOf('delete from public.guide_service_drafts');
  const outboxWrite = publish.indexOf('insert into public.midao_notification_outbox');
  assert.ok(guard >= 0, 'legacy publication guard is required');
  for (const [label, position] of Object.entries({ activityWrite, planWrite, questionWrite, versionWrite, draftDelete, outboxWrite })) {
    assert.ok(position > guard, `legacy guard must precede ${label}`);
  }
  assert.match(publish.slice(guard, activityWrite), /legacy_plan_lifecycle_unresolved/u);
  assert.doesNotMatch(publish, /\bexception\s+when\b|\b(?:commit|rollback|savepoint)\b/u);

  const normalized = statements.map(normalize);
  assert.ok(normalized.includes(`revoke all on function ${materializerIdentity} from public, anon, authenticated`));
  assert.ok(normalized.includes(`grant execute on function ${materializerIdentity} to service_role`));
  assert.ok(normalized.includes(`revoke all on function ${publishIdentity} from public, anon, authenticated`));
  assert.ok(normalized.includes(`grant execute on function ${publishIdentity} to service_role`));
});
