import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const NATIVE_IDS = [
  'c0000003-0000-0000-0000-000000000001',
  'c0000003-0000-0000-0000-000000000002',
  'c0000003-0000-0000-0000-000000000003',
];

test('issue1825 structural UUID helper accepts native c-IDs and v4 IDs only as structural values', async () => {
  const { normalizeStructuralUuid } = await import('../../src/lib/midao/structural-uuid.mjs');
  for (const id of NATIVE_IDS) assert.equal(normalizeStructuralUuid(` ${id.toUpperCase()} `), id);
  assert.equal(normalizeStructuralUuid('33333333-3333-4333-8333-333333333333'), '33333333-3333-4333-8333-333333333333');
  for (const invalid of ['not-a-uuid', `${NATIVE_IDS[0]}-suffix`, 'c0000003-0000-0000-0000-00000000000g']) {
    assert.equal(normalizeStructuralUuid(invalid), null);
  }
});

test('issue1825 resolver lifecycle bridge stays published_unversioned despite a native draft', async () => {
  const { __internal } = await import('../../src/lib/midao/service-list-resolver.ts');
  const result = __internal.resolveLifecycleState({
    activityId: NATIVE_IDS[0],
    legacyStatus: 'published',
    draftRevision: 1,
    publishedVersion: null,
  });
  assert.equal(result, 'published_unversioned');
});

test('issue1825 service-draft identity consumers use the structural UUID boundary', async () => {
  const sources = await Promise.all([
    '../../app/api/v2/guide/service-drafts/[draftId]/route.ts',
    '../../app/api/v2/guide/service-drafts/[draftId]/commands/publish/route.ts',
    '../../src/lib/midao/db-midao-service-drafts.mjs',
    '../../src/lib/midao/db-midao-service-publication.mjs',
  ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')));

  for (const source of sources) {
    assert.match(source, /normalizeStructuralUuid/u);
    assert.doesNotMatch(source, /\[1-5\]\[0-9a-f\]\{3\}/iu);
  }
});

test('issue1825 native ensure migration is service-role-only and writes only drafts', async () => {
  const source = await readFile(
    new URL('../../../../supabase/migrations/20260819002727_issue1825_native_service_draft_ensure.sql', import.meta.url),
    'utf8',
  );
  assert.match(source, /REVOKE ALL ON FUNCTION public\.midao_ensure_native_service_draft\(uuid, uuid\)\s+FROM PUBLIC, anon, authenticated;/u);
  assert.match(source, /GRANT EXECUTE ON FUNCTION public\.midao_ensure_native_service_draft\(uuid, uuid\)\s+TO service_role;/u);
  for (const forbidden of ['UPDATE public.activities', 'INSERT INTO public.activity_plans', 'service_publication_versions', 'midao_notification_outbox']) {
    assert.doesNotMatch(source, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  }
});
