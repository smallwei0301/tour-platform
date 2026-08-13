import assert from 'node:assert/strict';
import test from 'node:test';

const ACTIVITY_ID = '77777777-7777-4777-8777-777777777777';
const GUIDE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_GUIDE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const { isMidaoLegacyDraftMaterializationEnabled } = await import('../../src/config/feature-flags.mjs');
const { ensureLegacyServiceDraftMaterialized } = await import('../../src/lib/midao/db-legacy-service-draft-materialization.mjs');
const { resolveGuideServiceList } = await import('../../src/lib/midao/service-list-resolver.ts');
const { publishServiceDraft } = await import('../../src/lib/midao/db-midao-service-publication.mjs');
const { __setSupabaseClientForTest } = await import('../../src/lib/supabase-env.mjs');

const originalEnv = Object.fromEntries([
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
  'MIDAO_LEGACY_DRAFT_MATERIALIZATION_ENABLED', 'NODE_ENV',
].map((key) => [key, process.env[key]]));

test.afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  __setSupabaseClientForTest(null);
});

function useSupabase(client) {
  process.env.SUPABASE_URL = 'http://example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  __setSupabaseClientForTest(client);
}

function listFake({ activities = [], drafts = [], versions = [], materialize } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const rows = table === 'activities' ? activities
        : table === 'guide_service_drafts' ? drafts
          : table === 'service_publication_versions' ? versions
            : table === 'activity_plans' ? []
              : (() => { throw new Error(`unexpected table ${table}`); })();
      const query = {
        rows,
        select() { return query; },
        eq(field, value) { query.rows = query.rows.filter((row) => row[field] === value); return query; },
        in(field, values) { const allowed = new Set(values); query.rows = query.rows.filter((row) => allowed.has(row[field])); return query; },
        then(resolve) { return Promise.resolve({ data: query.rows, error: null }).then(resolve); },
      };
      return query;
    },
    rpc(name, args) {
      calls.push({ name, args });
      return Promise.resolve(materialize?.(args) ?? { data: null, error: null });
    },
  };
}

test('materialization flag is default-off and production remains disabled even when enabled', () => {
  assert.equal(isMidaoLegacyDraftMaterializationEnabled({}), false);
  assert.equal(isMidaoLegacyDraftMaterializationEnabled({ MIDAO_LEGACY_DRAFT_MATERIALIZATION_ENABLED: '1', NODE_ENV: 'test' }), true);
  assert.equal(isMidaoLegacyDraftMaterializationEnabled({ MIDAO_LEGACY_DRAFT_MATERIALIZATION_ENABLED: '1', NODE_ENV: 'production' }), false);
});

test('gateway is the only RPC entry and retry reuses the same materialized draft', async () => {
  let callCount = 0;
  const fake = listFake({
    materialize: () => ({
      data: { code: ++callCount === 1 ? 'CREATED' : 'REUSED', activityId: ACTIVITY_ID, draftId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', revision: 1 },
      error: null,
    }),
  });
  useSupabase(fake);
  const created = await ensureLegacyServiceDraftMaterialized(ACTIVITY_ID, GUIDE_ID);
  const reused = await ensureLegacyServiceDraftMaterialized(ACTIVITY_ID, GUIDE_ID);
  assert.equal(created.ok, true);
  assert.equal(created.code, 'CREATED');
  assert.equal(reused.ok, true);
  assert.equal(reused.code, 'REUSED');
  assert.equal(reused.draftId, created.draftId);
  assert.deepEqual(fake.calls.map(({ name, args }) => ({ name, args })), [
    { name: 'midao_materialize_legacy_service_draft', args: { p_activity_id: ACTIVITY_ID, p_guide_id: GUIDE_ID } },
    { name: 'midao_materialize_legacy_service_draft', args: { p_activity_id: ACTIVITY_ID, p_guide_id: GUIDE_ID } },
  ]);
});

test('resolver flag-off makes zero RPC writes and preserves the existing no-service-item result', async () => {
  const fake = listFake({ activities: [{ id: ACTIVITY_ID, guide_id: GUIDE_ID, title: 'legacy', slug: 'legacy', status: 'published', updated_at: null }] });
  useSupabase(fake);
  const result = await resolveGuideServiceList(GUIDE_ID, {});
  assert.equal(result.total, 0);
  assert.deepEqual(fake.calls, []);
});

test('resolver flag-on materializes only the calling guide published activity without draft or version', async () => {
  process.env.MIDAO_LEGACY_DRAFT_MATERIALIZATION_ENABLED = '1';
  process.env.NODE_ENV = 'test';
  const fake = listFake({
    activities: [
      { id: ACTIVITY_ID, guide_id: GUIDE_ID, title: 'legacy', slug: 'legacy', status: 'published', updated_at: null },
      { id: OTHER_GUIDE_ID, guide_id: GUIDE_ID, title: 'native', slug: 'native', status: 'published', updated_at: null },
    ],
    drafts: [{ activity_id: OTHER_GUIDE_ID, revision: 3, status: 'active' }],
    materialize: (args) => ({ data: { code: 'CREATED', activityId: args.p_activity_id, draftId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', revision: 1 }, error: null }),
  });
  useSupabase(fake);
  const result = await resolveGuideServiceList(GUIDE_ID, {});
  assert.deepEqual(fake.calls, [{ name: 'midao_materialize_legacy_service_draft', args: { p_activity_id: ACTIVITY_ID, p_guide_id: GUIDE_ID } }]);
  assert.deepEqual(result.items.map((item) => item.activityId).sort(), [ACTIVITY_ID, OTHER_GUIDE_ID].sort());
});

test('gateway preserves the RPC ownership denial as a non-success result', async () => {
  const fake = listFake({ materialize: () => ({ data: { code: 'ACTIVITY_NOT_FOUND_OR_OWNERSHIP_MISMATCH', status: 404, activityId: ACTIVITY_ID }, error: null }) });
  useSupabase(fake);
  const result = await ensureLegacyServiceDraftMaterialized(ACTIVITY_ID, GUIDE_ID);
  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
  assert.equal(result.code, 'ACTIVITY_NOT_FOUND_OR_OWNERSHIP_MISMATCH');
});

test('gateway backend failure rejects instead of returning a blank draft result', async () => {
  useSupabase(listFake({ materialize: () => ({ data: null, error: { code: '42501', message: 'permission denied' } }) }));
  await assert.rejects(() => ensureLegacyServiceDraftMaterialized(ACTIVITY_ID, GUIDE_ID), (error) => error?.name === 'MidaoLegacyDraftMaterializationBackendError');
});

test('publication gateway maps legacy plan lifecycle unresolved to non-success 409', async () => {
  useSupabase({
    from(table) {
      assert.equal(table, 'guide_service_drafts');
      const query = { select() { return query; }, eq() { return query; }, maybeSingle() { return Promise.resolve({ data: null, error: null }); } };
      return query;
    },
    rpc() {
      return Promise.resolve({ data: { code: 'LEGACY_PLAN_LIFECYCLE_UNRESOLVED', activityId: ACTIVITY_ID, status: 409 }, error: null });
    },
  });
  const result = await publishServiceDraft(ACTIVITY_ID, 1, GUIDE_ID);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'LEGACY_PLAN_LIFECYCLE_UNRESOLVED');
  assert.equal(result.status, 409);
});
