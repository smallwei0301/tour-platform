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
  'migration fixture must remain exact local loopback PostgreSQL',
);
parsedDatabaseUrl.username = 'supabase_admin';
const ownerDatabaseUrl = parsedDatabaseUrl.toString();
const here = dirname(fileURLToPath(import.meta.url));
const migrationPath = resolve(
  here,
  '../../../../supabase/migrations/20260813085910_issue1825_legacy_midao_draft_materialization.sql',
);
const materializeSql = 'SELECT public.midao_materialize_legacy_service_draft($1,$2) AS result';
const publishSql = 'SELECT public.midao_publish_service_draft($1,$2,$3) AS result';
let admin;
let owner;
let guideA;
let guideB;
let fixtureActivityIds = [];

before(async () => {
  admin = new pg.Client({ connectionString: databaseUrl });
  owner = new pg.Client({ connectionString: ownerDatabaseUrl });
  await admin.connect();
  await owner.connect();
  // The immutable baseline runner replays only its captured post-cutoff manifest.
  // This test applies its staged S1 migration to the runner-provisioned local DB;
  // no production or shared database is reachable through this loopback-only seam.
  await owner.query(readFileSync(migrationPath, 'utf8'));
  guideA = randomUUID();
  guideB = randomUUID();
  await admin.query(`
    INSERT INTO public.guide_profiles(id, slug, display_name, verification_status, guide_session_version, backend_mode)
    VALUES ($1, $3, 'Legacy materializer A', 'approved', 1, 'legacy'),
           ($2, $4, 'Legacy materializer B', 'approved', 1, 'legacy')
  `, [guideA, guideB, `legacy-materializer-${guideA}`, `legacy-materializer-${guideB}`]);
});

after(async () => {
  if (fixtureActivityIds.length > 0) {
    await admin.query('DELETE FROM public.activities WHERE id = ANY($1::uuid[])', [fixtureActivityIds]);
  }
  await admin.query('DELETE FROM public.guide_profiles WHERE id = ANY($1::uuid[])', [[guideA, guideB]]);
  await Promise.allSettled([admin?.end(), owner?.end()].filter(Boolean));
});

async function createActivity({ pendingChanges = null } = {}) {
  const id = randomUUID();
  fixtureActivityIds.push(id);
  await admin.query(`
    INSERT INTO public.activities(id, guide_id, title, slug, description, status, pending_changes)
    VALUES ($1, $2, 'Legacy base title', $3, 'Legacy base description', 'published', $4::jsonb)
  `, [id, guideA, `legacy-materializer-${id}`, pendingChanges === null ? null : JSON.stringify(pendingChanges)]);
  return id;
}

async function activeDraft(activityId) {
  const result = await admin.query(`
    SELECT id, activity_id, guide_id, revision, status, payload, materialization_origin,
           materialization_review_state, materialized_at, materialized_revision
      FROM public.guide_service_drafts
     WHERE activity_id = $1 AND status = 'active'
  `, [activityId]);
  assert.equal(result.rowCount, 1, 'activity must have exactly one active draft');
  return result.rows[0];
}

async function snapshot(activityId) {
  const result = await admin.query(`
    SELECT
      (SELECT row_to_json(a) FROM public.activities a WHERE a.id = $1) AS activity,
      (SELECT coalesce(jsonb_agg(i ORDER BY i.id), '[]'::jsonb) FROM public.activity_images i WHERE i.activity_id = $1) AS images,
      (SELECT coalesce(jsonb_agg(p ORDER BY p.id), '[]'::jsonb) FROM public.activity_plans p WHERE p.activity_id = $1) AS plans,
      (SELECT coalesce(jsonb_agg(q ORDER BY q.id), '[]'::jsonb) FROM public.activity_intake_questions q WHERE q.activity_id = $1) AS questions,
      (SELECT coalesce(jsonb_agg(v ORDER BY v.id), '[]'::jsonb) FROM public.service_publication_versions v WHERE v.activity_id = $1) AS versions,
      (SELECT coalesce(jsonb_agg(o ORDER BY o.id), '[]'::jsonb) FROM public.midao_notification_outbox o WHERE o.aggregate_type = 'activity' AND o.aggregate_id = $1::text) AS outbox
  `, [activityId]);
  return result.rows[0];
}

async function callMaterializer(activityId, guideId = guideA, client = admin) {
  const result = await client.query(materializeSql, [activityId, guideId]);
  return result.rows[0].result;
}

test('concurrent legacy materialization creates one active draft and only one reusable identity', async () => {
  const activityId = await createActivity({ pendingChanges: { title: 'Overlay title', description: null } });
  const clients = [new pg.Client({ connectionString: databaseUrl }), new pg.Client({ connectionString: databaseUrl })];
  await Promise.all(clients.map(async (client) => { await client.connect(); await client.query("SET statement_timeout = '8s'"); }));
  try {
    const beforeState = await snapshot(activityId);
    const results = await Promise.all(clients.map((client) => callMaterializer(activityId, guideA, client)));
    const draft = await activeDraft(activityId);
    assert.equal(new Set(results.map((result) => result.draftId)).size, 1);
    assert.equal(results.every((result) => ['CREATED', 'REUSED'].includes(result.code)), true);
    assert.equal(draft.materialization_origin, 'legacy_activity');
    assert.equal(draft.materialization_review_state, null);
    assert.equal(draft.materialized_revision, draft.revision);
    assert.deepEqual(draft.payload, {
      name: 'Overlay title', description: '', descriptions: [], plans: [], questions: [],
    });
    const afterState = await snapshot(activityId);
    assert.deepEqual(afterState, beforeState, 'materialization may not mutate canonical/activity side-effect tables');
  } finally {
    await Promise.allSettled(clients.map((client) => client.end()));
  }
});

test('wrong-guide lookup is non-enumerating and existing active draft remains byte-equivalent', async () => {
  const activityId = await createActivity();
  const nativePayload = { name: 'Native draft', description: 'unchanged', descriptions: [], plans: [], questions: [] };
  await admin.query(`
    INSERT INTO public.guide_service_drafts(activity_id, guide_id, payload)
    VALUES ($1, $2, $3::jsonb)
  `, [activityId, guideA, JSON.stringify(nativePayload)]);
  const beforeDraft = await activeDraft(activityId);
  const mismatch = await callMaterializer(activityId, guideB);
  assert.deepEqual(mismatch, {
    code: 'ACTIVITY_NOT_FOUND_OR_OWNERSHIP_MISMATCH', status: 404, activityId,
  });
  const reused = await callMaterializer(activityId, guideA);
  assert.equal(reused.code, 'REUSED');
  assert.deepEqual(await activeDraft(activityId), beforeDraft, 'existing active draft must not be overwritten or reclassified');
});

test('malformed overlay is ignored as a whole and marked for review without legacy writes', async () => {
  const activityId = await createActivity({ pendingChanges: { title: 'would be valid', unexpected: true } });
  const beforeState = await snapshot(activityId);
  const response = await callMaterializer(activityId);
  assert.equal(response.code, 'CREATED');
  const draft = await activeDraft(activityId);
  assert.equal(draft.materialization_review_state, 'needs_review');
  assert.deepEqual(draft.payload, {
    name: 'Legacy base title', description: 'Legacy base description', descriptions: [], plans: [], questions: [],
  });
  assert.deepEqual(await snapshot(activityId), beforeState, 'invalid overlay materialization may not mutate canonical/activity side-effect tables');
});

test('legacy materialized draft cannot publish or deactivate plans, and leaves every snapshot unchanged', async () => {
  const activityId = await createActivity();
  const materialized = await callMaterializer(activityId);
  const draft = await activeDraft(activityId);
  const beforeState = await snapshot(activityId);
  const publication = await admin.query(publishSql, [activityId, draft.revision, guideA]);
  assert.deepEqual(publication.rows[0].result, {
    published: false,
    idempotent: false,
    code: 'LEGACY_PLAN_LIFECYCLE_UNRESOLVED',
    activityId,
    status: 409,
  });
  assert.deepEqual(await snapshot(activityId), beforeState, 'legacy publication guard must precede every canonical side effect');
  assert.deepEqual(await activeDraft(activityId), draft, 'legacy publish block must retain editable materialized draft');
  assert.equal(materialized.draftId, draft.id);
});
