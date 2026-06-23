import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

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

function createSupabaseStubWithPrimaryError({
  message,
  code,
}) {
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
          return {
            data: null,
            error: { message, code },
          };
        },
        async maybeSingle() {
          return { data: null, error: null };
        },
        then(resolve, reject) {
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        },
      };
    },
  };
}

function createSupabaseStubForFormalPlanFallback() {
  const validActivity = {
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
    plans: [
      { id: 'legacy-half-day', label: 'half-day-morning' },
      { id: 'legacy-full-day', label: 'full-day-complete' },
    ],
    status: 'published',
    guide_id: null,
    guide_slug: null,
  };

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
            return { data: validActivity, error: null };
          }
          return { data: null, error: null };
        },
        async maybeSingle() {
          return { data: null, error: null };
        },
        then(resolve, reject) {
          if (state.table === 'activity_schedules') {
            return Promise.resolve({ data: [], error: null }).then(resolve, reject);
          }

          if (state.table === 'activity_reviews') {
            return Promise.resolve({ data: [], error: null }).then(resolve, reject);
          }

          if (state.table === 'activity_plans') {
            // Simulate old schema: rich + retry selects fail due missing optional columns,
            // but minimal select should still work and return formal active plans.
            if (state.selected.includes('details_link_text')) {
              return Promise.resolve({
                data: null,
                error: { message: 'column activity_plans.details_link_text does not exist' },
              }).then(resolve, reject);
            }

            return Promise.resolve({
              data: [
                {
                  id: 'plan-half-day-uuid',
                  slug: 'half-day-morning',
                  name: '半日',
                  duration_minutes: 240,
                  price_type: 'per_person',
                  base_price: 1800,
                  min_participants: 1,
                  max_participants: 4,
                  status: 'active',
                },
              ],
              error: null,
            }).then(resolve, reject);
          }

          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        },
      };
    },
  };
}

function createSupabaseStubForOptionalQueryFailure() {
  const hangingQuery = () => new Promise(() => {});
  const validActivity = {
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
  };

  return {
    from(table) {
      if (table === 'activities') {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          async single() {
            return { data: validActivity, error: null };
          },
        };
      }

      if (table === 'guide_profiles') {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          async maybeSingle() {
            return hangingQuery();
          },
        };
      }

      if (table === 'activity_schedules') {
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
          then(resolve, reject) {
            return hangingQuery().then(resolve, reject);
          },
        };
      }

      if (table === 'activity_reviews') {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          order() {
            return this;
          },
          limit() {
            return this;
          },
          then(resolve, reject) {
            return Promise.reject(new Error('activity_reviews failed')).then(resolve, reject);
          },
        };
      }

      return {
        then(resolve, reject) {
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
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

test('activity routes should avoid dynamic-segment name conflict and keep runtime rendering constraints', async () => {
  const root = ROOT;
  const canonicalPage = path.join(root, 'app/[locale]/activities/[region]/[slug]/page.tsx');
  const compatPage = path.join(root, 'app/[locale]/activities/[region]/page.tsx');
  const legacyCompatPage = path.join(root, 'app/[locale]/activities/[slug]/page.tsx');
  const dbFile = path.join(root, 'src/lib/db.mjs');

  const [canonicalSrc, compatSrc, dbSrc, legacyCompatExists] = await Promise.all([
    fs.readFile(canonicalPage, 'utf8'),
    fs.readFile(compatPage, 'utf8'),
    fs.readFile(dbFile, 'utf8'),
    fs.access(legacyCompatPage).then(() => true).catch(() => false),
  ]);

  assert.equal(legacyCompatExists, false, 'legacy /activities/[slug] route should be removed');
  assert.equal(canonicalSrc.includes('preferFixtureFirst: true'), false);
  assert.equal(compatSrc.includes('preferFixtureFirst: true'), false);
  // #502 後續：canonical 詳情頁從緊急 force-dynamic 改回 on-demand ISR
  // （revalidate=60 + generateStaticParams()→[] + fetchCache，導航 TTFB 大降）。
  // #502 真正的安全護欄不變：仍「禁 force-static、禁 unstable_cache」——這兩者
  // 才是當年 cold-path render lock 的元兇；本做法 build 不預渲染任何頁、亦不
  // 包 unstable_cache，故無 build-time hang 風險。
  assert.equal(canonicalSrc.includes("dynamic = 'force-dynamic'"), false);
  assert.equal(canonicalSrc.includes('export const revalidate = 60'), true);
  assert.equal(/generateStaticParams\s*\(/.test(canonicalSrc), true);
  assert.equal(compatSrc.includes("dynamic = 'force-dynamic'"), true);
  assert.equal(canonicalSrc.includes("dynamic = 'force-static'"), false);
  assert.equal(compatSrc.includes("dynamic = 'force-static'"), false);
  assert.equal(canonicalSrc.includes('unstable_cache('), false);
  assert.equal(compatSrc.includes('unstable_cache('), false);
  assert.equal(canonicalSrc.includes('generateMetadata'), true);
  assert.equal(canonicalSrc.includes('getActivityBySlugDb('), true);
  assert.equal(canonicalSrc.includes('const { slug } = await params;'), true);
  assert.equal(canonicalSrc.includes('generateMetadata') && canonicalSrc.includes('getActivityBySlugDb('), true);
  assert.equal(compatSrc.includes('params }: { params: Promise<{ region: string }> }'), true);
  assert.equal(compatSrc.includes('const { region } = await params;'), true);
  assert.equal(compatSrc.includes('getActivityBySlugDb(region)'), true);

  // Metadata guard: metadata should not trigger DB lookup.
  const metadataBlock = canonicalSrc.split('export async function generateMetadata')[1]?.split('export default async function')[0] || '';
  assert.equal(metadataBlock.includes('getActivityBySlugDb('), false);

  // Root-cause guard for GH #502: primary detail query should avoid relational embed,
  // so schema/relationship drift won't stall server render before first byte.
  const primarySelectBlock = dbSrc.split('const minimalSelect = `')[1]?.split('`;')[0] || '';
  assert.equal(primarySelectBlock.includes('guide_profiles!activities_guide_id_fkey'), false);
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

test('getActivityBySlugDb should fail fast on primary timeout for DB-only slug and avoid fixture fallback', async () => {
  const original = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
  };
  process.env.SUPABASE_URL = 'http://local.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

  const queryTimeoutMs = 10;
  const timeoutRefs = new Set();
  const clearedTimeoutRefs = new Set();
  global.setTimeout = (cb, ms, ...rest) => {
    const timeoutId = original.setTimeout(cb, ms, ...rest);
    if (ms === queryTimeoutMs) {
      timeoutRefs.add(timeoutId);
    }
    return timeoutId;
  };
  global.clearTimeout = (id) => {
    if (timeoutRefs.has(id)) {
      clearedTimeoutRefs.add(id);
    }
    return original.clearTimeout(id);
  };

  __setSupabaseClientForTest(createSupabaseStubWithHangingActivityQuery());

  const startedAt = Date.now();
  try {
    await assert.rejects(
      () => getActivityBySlugDb('e2e-accept-test-001', { queryTimeoutMs }),
      /\[activities-single\] timeout after 10ms/,
    );

    const elapsedMs = Date.now() - startedAt;
    assert.equal(elapsedMs < 200, true);
    assert.equal(timeoutRefs.size, 1, 'one timeout should be armed for the primary query');
    assert.equal(clearedTimeoutRefs.size, timeoutRefs.size, 'armed timeout should be cleared once request settles');
  } finally {
    global.setTimeout = original.setTimeout;
    global.clearTimeout = original.clearTimeout;
    __setSupabaseClientForTest(null);
    process.env.SUPABASE_URL = original.SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = original.SUPABASE_SERVICE_ROLE_KEY;
  }
});

test('getActivityBySlugDb should fail fast on permission errors and avoid fixture fallback', async () => {
  const original = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.SUPABASE_URL = 'http://local.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

  __setSupabaseClientForTest(createSupabaseStubWithPrimaryError({
    message: 'permission denied for table activities',
  }));

  try {
    await assert.rejects(
      () => getActivityBySlugDb('safe-slug'),
      /permission denied for table activities/,
    );
  } finally {
    __setSupabaseClientForTest(null);
    process.env.SUPABASE_URL = original.SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = original.SUPABASE_SERVICE_ROLE_KEY;
  }
});

test('getActivityBySlugDb should return null for no-row / not found responses', async () => {
  const original = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.SUPABASE_URL = 'http://local.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

  __setSupabaseClientForTest(createSupabaseStubWithPrimaryError({
    message: 'JSON object requested, multiple (or no) rows returned',
  }));

  try {
    const activity = await getActivityBySlugDb('safe-slug');
    assert.equal(activity, null);
  } finally {
    __setSupabaseClientForTest(null);
    process.env.SUPABASE_URL = original.SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = original.SUPABASE_SERVICE_ROLE_KEY;
  }
});

test('getActivityBySlugDb falls back to minimal formal plan projection when optional activity_plans columns are missing', async () => {
  const original = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.SUPABASE_URL = 'http://local.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

  __setSupabaseClientForTest(createSupabaseStubForFormalPlanFallback());

  try {
    const activity = await getActivityBySlugDb('safe-slug');
    assert.equal(activity?.slug, 'safe-slug');
    assert.equal(Array.isArray(activity?.plans), true);
    assert.equal(activity?.plans?.length, 1);
    assert.equal(activity?.plans?.[0]?.id, 'plan-half-day-uuid');
    assert.equal(activity?.plans?.[0]?.label, '半日');
  } finally {
    __setSupabaseClientForTest(null);
    process.env.SUPABASE_URL = original.SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = original.SUPABASE_SERVICE_ROLE_KEY;
  }
});

test('getActivityBySlugDb keeps optional guide/schedule/review lookups soft-failing', async () => {
  const original = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.SUPABASE_URL = 'http://local.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

  __setSupabaseClientForTest(createSupabaseStubForOptionalQueryFailure());

  try {
    const activity = await getActivityBySlugDb('safe-slug', { queryTimeoutMs: 10 });
    assert.equal(activity?.slug, 'safe-slug');
    assert.equal(Array.isArray(activity?.schedules), true);
    assert.equal(activity.schedules.length, 0);
    assert.equal(Array.isArray(activity?.reviews), true);
    assert.equal(activity.reviews.length, 0);
  } finally {
    __setSupabaseClientForTest(null);
    process.env.SUPABASE_URL = original.SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = original.SUPABASE_SERVICE_ROLE_KEY;
  }
});
