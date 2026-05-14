import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  shouldRetryActivityDetailQuery,
  buildCanonicalActivityDetailPath,
  getActivityBySlugDb,
  __setSupabaseClientForTest,
} from '../../src/lib/db.mjs';

function createSupabaseStubForRetry({ firstErrorMessage }) {
  let activityCall = 0;

  return {
    from(table) {
      const state = {
        table,
        selected: '',
      };

      return {
        select(fields) {
          state.selected = String(fields || '');
          return this;
        },
        eq() {
          return this;
        },
        in() {
          return this;
        },
        order() {
          return this;
        },
        limit() {
          return this;
        },
        async single() {
          if (state.table === 'activities') {
            activityCall += 1;
            if (activityCall === 1) {
              return { data: null, error: { message: firstErrorMessage } };
            }

            const retrySelect = state.selected.toLowerCase();
            if (retrySelect.includes('rating_avg') || retrySelect.includes('review_count')) {
              return { data: null, error: { message: 'column activities.rating_avg does not exist' } };
            }
            if (retrySelect.includes('guide_profiles!activities_guide_id_fkey')) {
              return { data: null, error: { message: "Could not find a relationship between 'activities' and 'guide_profiles'" } };
            }

            return {
              data: {
                id: 'act-1',
                slug: 'safe-slug',
                title: 'Safe Activity',
                tagline: 'tag',
                short_description: 'short',
                description: 'desc',
                region: '台北市',
                region_slug: 'taipei',
                category: 'walk',
                price_twd: 1000,
                duration_minutes: 120,
                min_participants: 1,
                max_participants: 10,
                meeting_point: 'm',
                meeting_point_map_url: null,
                cover_image_url: null,
                image_urls: [],
                inclusions: [],
                exclusions: [],
                notices: [],
                refund_rules: [],
                safety_notice: null,
                faq: [],
                status: 'published',
                guide_id: null,
                guide_slug: null,
              },
              error: null,
            };
          }

          return { data: null, error: null };
        },
        async maybeSingle() {
          if (state.table === 'guide_profiles') {
            return { data: null, error: null };
          }
          return { data: null, error: null };
        },
        then(resolve, reject) {
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        },
      };
    },
  };
}

function createSupabaseStubWithHangingActivityQuery() {
  return {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        in() {
          return this;
        },
        order() {
          return this;
        },
        limit() {
          return this;
        },
        async single() {
          return new Promise(() => {});
        },
        async maybeSingle() {
          return { data: null, error: null };
        },
      };
    },
  };
}

test('shouldRetryActivityDetailQuery returns true for missing optional column errors', () => {
  assert.equal(
    shouldRetryActivityDetailQuery({ message: 'column activities.social_proof_quotes does not exist' }),
    true,
  );
  assert.equal(
    shouldRetryActivityDetailQuery({ message: "Could not find a relationship between 'activities' and 'guide_profiles'" }),
    true,
  );
});

test('shouldRetryActivityDetailQuery returns false for not found / permission errors', () => {
  assert.equal(shouldRetryActivityDetailQuery({ message: 'JSON object requested, multiple (or no) rows returned' }), false);
  assert.equal(shouldRetryActivityDetailQuery({ message: 'permission denied for table activities' }), false);
});

test('buildCanonicalActivityDetailPath builds two-segment route from region slug + activity slug', () => {
  assert.equal(
    buildCanonicalActivityDetailPath({ slug: 'e2e-accept-test-001', regionSlug: 'taipei', region: '台北市' }),
    '/activities/taipei/e2e-accept-test-001',
  );
});

test('buildCanonicalActivityDetailPath falls back to normalized region when regionSlug is absent', () => {
  assert.equal(
    buildCanonicalActivityDetailPath({ slug: 'dadadaocheng-walk', region: '台北市' }),
    '/activities/taipei/dadadaocheng-walk',
  );
});

test('activity detail pages should stay runtime-rendered without fixture-first/static-cache lock-ins', async () => {
  const root = path.resolve(process.cwd());
  const regionPage = path.join(root, 'app/activities/[region]/[slug]/page.tsx');
  const compatPage = path.join(root, 'app/activities/[slug]/page.tsx');
  const [regionSrc, compatSrc] = await Promise.all([
    fs.readFile(regionPage, 'utf8'),
    fs.readFile(compatPage, 'utf8'),
  ]);

  assert.equal(regionSrc.includes('preferFixtureFirst: true'), false);
  assert.equal(compatSrc.includes('preferFixtureFirst: true'), false);
  assert.equal(regionSrc.includes("dynamic = 'force-dynamic'"), true);
  assert.equal(compatSrc.includes("dynamic = 'force-dynamic'"), true);
  assert.equal(regionSrc.includes("dynamic = 'force-static'"), false);
  assert.equal(compatSrc.includes("dynamic = 'force-static'"), false);
  assert.equal(regionSrc.includes('unstable_cache('), false);
});

test('getActivityBySlugDb retry succeeds when production lacks activity rating columns', async () => {
  const original = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.SUPABASE_URL = 'http://local.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

  __setSupabaseClientForTest(createSupabaseStubForRetry({
    firstErrorMessage: 'column activities.rating_avg does not exist',
  }));

  const activity = await getActivityBySlugDb('safe-slug');

  assert.equal(activity?.slug, 'safe-slug');
  assert.equal(activity?.ratingAvg, null);
  assert.equal(activity?.reviewCount, 0);

  __setSupabaseClientForTest(null);
  process.env.SUPABASE_URL = original.SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = original.SUPABASE_SERVICE_ROLE_KEY;
});

test('getActivityBySlugDb retry succeeds when activities-guide_profiles relationship metadata is missing', async () => {
  const original = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.SUPABASE_URL = 'http://local.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

  __setSupabaseClientForTest(createSupabaseStubForRetry({
    firstErrorMessage: "Could not find a relationship between 'activities' and 'guide_profiles'",
  }));

  const activity = await getActivityBySlugDb('safe-slug');

  assert.equal(activity?.slug, 'safe-slug');
  assert.equal(activity?.guide?.slug ?? null, null);

  __setSupabaseClientForTest(null);
  process.env.SUPABASE_URL = original.SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = original.SUPABASE_SERVICE_ROLE_KEY;
});

test('getActivityBySlugDb should fallback quickly when primary activities query hangs', async () => {
  const original = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.SUPABASE_URL = 'http://local.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

  __setSupabaseClientForTest(createSupabaseStubWithHangingActivityQuery());

  const startedAt = Date.now();
  const activity = await getActivityBySlugDb('dadadaocheng-walk', { queryTimeoutMs: 10 });
  const elapsedMs = Date.now() - startedAt;

  assert.equal(elapsedMs < 200, true);
  assert.equal(activity == null || activity.slug === 'dadadaocheng-walk', true);

  __setSupabaseClientForTest(null);
  process.env.SUPABASE_URL = original.SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = original.SUPABASE_SERVICE_ROLE_KEY;
});
