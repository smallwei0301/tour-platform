import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test, { after, before } from 'node:test';
import pg from 'pg';
import { fileURLToPath } from 'node:url';

const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
assert.ok(databaseUrl, 'local Supabase runner must provide SUPABASE_DB_URL or DATABASE_URL');
const parsedDatabaseUrl = new URL(databaseUrl);
assert.deepEqual(
  [parsedDatabaseUrl.hostname, parsedDatabaseUrl.port, parsedDatabaseUrl.pathname, parsedDatabaseUrl.search, parsedDatabaseUrl.hash],
  ['127.0.0.1', '54322', '/postgres', '', ''],
  'rollback fixture must remain exact local loopback PostgreSQL',
);
parsedDatabaseUrl.username = 'supabase_admin';
const ownerDatabaseUrl = parsedDatabaseUrl.toString();
const here = dirname(fileURLToPath(import.meta.url));
const forwardPath = resolve(
  here,
  '../../../../supabase/migrations/20260813085910_issue1825_legacy_midao_draft_materialization.sql',
);
const rollbackPath = resolve(
  here,
  '../../../../supabase/migrations/20260813085910_issue1825_legacy_midao_draft_materialization.rollback.sql',
);
const materializerIdentity = 'public.midao_materialize_legacy_service_draft(uuid, uuid)';
const publishIdentity = 'public.midao_publish_service_draft(uuid, integer, uuid)';
let admin;
let owner;
let guideId;
let fixtureActivityIds = [];

async function applyForward() {
  await owner.query(readFileSync(forwardPath, 'utf8'));
}

async function hasForwardArtifacts() {
  const result = await owner.query(`
    SELECT
      to_regprocedure($1) IS NOT NULL AS materializer_exists,
      (SELECT count(*)::integer FROM pg_catalog.pg_attribute
       WHERE attrelid = 'public.guide_service_drafts'::regclass
         AND attname = ANY (ARRAY['materialization_origin', 'materialization_review_state', 'materialized_at', 'materialized_revision'])
         AND attnum > 0 AND NOT attisdropped) AS materialization_column_count,
      (SELECT count(*)::integer FROM pg_catalog.pg_constraint
       WHERE conrelid = 'public.guide_service_drafts'::regclass
         AND conname = ANY (ARRAY[
           'midao_guide_service_drafts_materialization_origin_check',
           'midao_guide_service_drafts_materialization_review_state_check',
           'midao_guide_service_drafts_materialized_revision_check'
         ])) AS materialization_constraint_count
  `, [materializerIdentity]);
  return result.rows[0];
}

async function createActivity() {
  const id = randomUUID();
  fixtureActivityIds.push(id);
  await admin.query(`
    INSERT INTO public.activities(id, guide_id, title, slug, description, status)
    VALUES ($1, $2, 'Rollback fixture', $3, 'Rollback fixture description', 'published')
  `, [id, guideId, `rollback-fixture-${id}`]);
  return id;
}

async function insertDraft(activityId, options = {}) {
  const { origin = 'native', reviewState = null, materializedAt = null, materializedRevision = null } = options;
  const result = await admin.query(`
    INSERT INTO public.guide_service_drafts(
      activity_id, guide_id, revision, status, payload,
      materialization_origin, materialization_review_state, materialized_at, materialized_revision
    ) VALUES ($1, $2, 1, 'active', $3::jsonb, $4, $5, $6, $7)
    RETURNING id, activity_id, guide_id, revision, status, payload,
              materialization_origin, materialization_review_state, materialized_at, materialized_revision
  `, [
    activityId,
    guideId,
    JSON.stringify({ name: 'Native rollback draft', description: 'retained', descriptions: [], plans: [], questions: [] }),
    origin,
    reviewState,
    materializedAt,
    materializedRevision,
  ]);
  return result.rows[0];
}

async function rollbackAsAuthorizedOwner() {
  await owner.query("SET midao.rollback_owner_authorized = 'issue-1825'");
  try {
    await owner.query(readFileSync(rollbackPath, 'utf8'));
  } catch (error) {
    await owner.query('ROLLBACK');
    throw error;
  }
}

before(async () => {
  admin = new pg.Client({ connectionString: databaseUrl });
  owner = new pg.Client({ connectionString: ownerDatabaseUrl });
  await admin.connect();
  await owner.connect();
  await applyForward();
  guideId = randomUUID();
  await admin.query(`
    INSERT INTO public.guide_profiles(id, slug, display_name, verification_status, guide_session_version, backend_mode)
    VALUES ($1, $2, 'Rollback owner fixture', 'approved', 1, 'legacy')
  `, [guideId, `rollback-owner-${guideId}`]);
});

after(async () => {
  if (fixtureActivityIds.length > 0) {
    await admin.query('DELETE FROM public.activities WHERE id = ANY($1::uuid[])', [fixtureActivityIds]);
  }
  await admin.query('DELETE FROM public.guide_profiles WHERE id = $1', [guideId]);
  await Promise.allSettled([admin?.end(), owner?.end()].filter(Boolean));
});

test('legacy-origin provenance fails closed and retains the row and every forward artifact', async () => {
  const activityId = await createActivity();
  const legacyDraft = await insertDraft(activityId, {
    origin: 'legacy_activity', materializedAt: '2026-08-14T00:00:00.000Z', materializedRevision: 1,
  });
  await assert.rejects(rollbackAsAuthorizedOwner(), /MIDAO_ROLLBACK_DATA_DEPENDENCY_PRESENT/u);
  const retained = await admin.query(`
    SELECT id, activity_id, guide_id, revision, status, payload,
           materialization_origin, materialization_review_state, materialized_at, materialized_revision
      FROM public.guide_service_drafts WHERE id = $1
  `, [legacyDraft.id]);
  assert.deepEqual(retained.rows[0], legacyDraft);
  assert.deepEqual(await hasForwardArtifacts(), {
    materializer_exists: true, materialization_column_count: 4, materialization_constraint_count: 3,
  });
  await admin.query('DELETE FROM public.guide_service_drafts WHERE id = $1', [legacyDraft.id]);
});

test('modified forward publish function fails closed and leaves forward artifacts installed', async () => {
  await owner.query(`
    CREATE OR REPLACE FUNCTION public.midao_publish_service_draft(
      p_activity_id uuid, p_expected_revision integer, p_guide_id uuid
    ) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
    AS $modified$ BEGIN RETURN '{}'::jsonb; END; $modified$;
  `);
  await assert.rejects(rollbackAsAuthorizedOwner(), /MIDAO_ROLLBACK_PRECONDITION_FAILED/u);
  assert.deepEqual(await hasForwardArtifacts(), {
    materializer_exists: true, materialization_column_count: 4, materialization_constraint_count: 3,
  });
  await applyForward();
});

test('native draft is retained while catalog and service-only publish ACL restore exactly', async () => {
  const activityId = await createActivity();
  const nativeDraft = await insertDraft(activityId);
  await rollbackAsAuthorizedOwner();

  const retained = await admin.query(`
    SELECT id, activity_id, guide_id, revision, status, payload
      FROM public.guide_service_drafts WHERE id = $1
  `, [nativeDraft.id]);
  assert.deepEqual(retained.rows[0], {
    id: nativeDraft.id,
    activity_id: nativeDraft.activity_id,
    guide_id: nativeDraft.guide_id,
    revision: nativeDraft.revision,
    status: nativeDraft.status,
    payload: nativeDraft.payload,
  });
  const catalog = await owner.query(`
    SELECT
      to_regprocedure($1) IS NULL AS materializer_absent,
      (SELECT count(*)::integer FROM pg_catalog.pg_attribute
       WHERE attrelid = 'public.guide_service_drafts'::regclass
         AND attname = ANY (ARRAY['materialization_origin', 'materialization_review_state', 'materialized_at', 'materialized_revision'])
         AND attnum > 0 AND NOT attisdropped) AS materialization_column_count,
      (SELECT count(*)::integer FROM pg_catalog.pg_constraint
       WHERE conrelid = 'public.guide_service_drafts'::regclass
         AND conname = ANY (ARRAY[
           'midao_guide_service_drafts_materialization_origin_check',
           'midao_guide_service_drafts_materialization_review_state_check',
           'midao_guide_service_drafts_materialized_revision_check'
         ])) AS materialization_constraint_count,
      pg_catalog.md5(prosrc) AS publish_fingerprint,
      prosecdef AS security_definer,
      proconfig @> ARRAY['search_path=pg_catalog']::text[] AS fixed_search_path,
      pg_catalog.has_function_privilege('service_role', oid, 'EXECUTE') AS service_role_execute,
      pg_catalog.has_function_privilege('public', oid, 'EXECUTE') AS public_execute,
      pg_catalog.has_function_privilege('anon', oid, 'EXECUTE') AS anon_execute,
      pg_catalog.has_function_privilege('authenticated', oid, 'EXECUTE') AS authenticated_execute
    FROM pg_catalog.pg_proc
    WHERE oid = $2::regprocedure
  `, [materializerIdentity, publishIdentity]);
  assert.deepEqual(catalog.rows[0], {
    materializer_absent: true,
    materialization_column_count: 0,
    materialization_constraint_count: 0,
    publish_fingerprint: '4ab71e58e1438395d6e79c0c669cc90d',
    security_definer: true,
    fixed_search_path: true,
    service_role_execute: true,
    public_execute: false,
    anon_execute: false,
    authenticated_execute: false,
  });
});
