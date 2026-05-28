import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

function buildUpdateActivitySupabaseMock({ upsertCalls }) {
  const activityRow = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    slug: 'demo-activity',
    title: 'Demo',
    tagline: null,
    short_description: null,
    description: null,
    region: null,
    region_slug: null,
    category: null,
    price_twd: 0,
    duration_minutes: null,
    min_participants: 1,
    max_participants: 10,
    meeting_point: null,
    meeting_point_map_url: null,
    cover_image_url: null,
    image_urls: [],
    inclusions: [],
    exclusions: [],
    notices: [],
    refund_rules: [],
    safety_notice: null,
    faq: [],
    good_for: [],
    not_good_for: [],
    transport_mode: null,
    seo_title: null,
    seo_description: null,
    itinerary: [],
    social_proof_quotes: [],
    rating_avg: null,
    review_count: 0,
    plans: [],
    status: 'draft',
    published_at: null,
    created_at: '2026-05-28T00:00:00.000Z',
    updated_at: '2026-05-28T00:00:00.000Z',
    guide_id: null,
    guide_slug: null,
    guide_profiles: null,
  };

  function chain(table, ctx = {}) {
    return {
      select() {
        return chain(table, ctx);
      },
      eq(column, value) {
        if (table === 'activity_plans' && ctx.mode === 'selectExisting' && column === 'activity_id') {
          return Promise.resolve({
            data: [{ id: 'formal-half-day', slug: 'half-day' }],
            error: null,
          });
        }
        return chain(table, { ...ctx, [column]: value });
      },
      update(patch) {
        if (table === 'activities') {
          assert.deepEqual(patch.plans?.map((plan) => plan.id), ['half-day']);
          return { eq: () => Promise.resolve({ error: null }) };
        }
        return { eq: () => Promise.resolve({ error: null }) };
      },
      order() {
        return Promise.resolve({ data: [], error: null });
      },
      single() {
        if (table === 'activities') return Promise.resolve({ data: activityRow, error: null });
        return Promise.resolve({ data: null, error: { message: 'not found' } });
      },
      upsert(rows, options) {
        upsertCalls.push({ table, rows, options });
        return Promise.resolve({ error: null });
      },
    };
  }

  return {
    from(table) {
      if (table === 'activity_plans') {
        return {
          select() {
            return chain(table, { mode: 'selectExisting' });
          },
          upsert(rows, options) {
            upsertCalls.push({ table, rows, options });
            return Promise.resolve({ error: null });
          },
        };
      }
      return chain(table);
    },
  };
}

describe('GH-851 admin plan create/import regression', () => {
  it('generates a non-empty safe fallback slug for Chinese-only plan names', async () => {
    const { generatePlanSlug } = await import(pathToFileURL(path.resolve(ROOT, 'src/lib/activity-plan-slugs.mjs')).href);

    const slug = generatePlanSlug({ name: '祕境半日遊', suffix: 'issue-851' });

    assert.equal(slug, 'plan-issue-851');
    assert.match(slug, /^[a-z0-9-]+$/);
  });

  it('returns an actionable duplicate slug message instead of a generic create failure', async () => {
    const { duplicatePlanSlugMessage, isDuplicatePlanSlugError } = await import(
      pathToFileURL(path.resolve(ROOT, 'src/lib/activity-plan-slugs.mjs')).href
    );

    assert.equal(isDuplicatePlanSlugError({ code: '23505', message: 'duplicate key value violates unique constraint' }), true);
    assert.match(duplicatePlanSlugMessage('plan-issue-851'), /plan-issue-851/);
    assert.match(duplicatePlanSlugMessage('plan-issue-851'), /choose a different slug|rename/i);
  });

  it('maps imported sample JSON plans into canonical activity_plans and preserves rich fields', async () => {
    const dbMod = await import(pathToFileURL(path.resolve(ROOT, 'src/lib/db.mjs')).href);
    const originalUrl = process.env.SUPABASE_URL;
    const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const upsertCalls = [];

    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    dbMod.__setSupabaseClientForTest(buildUpdateActivitySupabaseMock({ upsertCalls }));

    try {
      await dbMod.updateActivityDb('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', {
        plans: [
          {
            id: 'half-day',
            label: '祕境半日遊',
            price: 3600,
            priceMultiplier: 1,
            minParticipants: 2,
            maxParticipants: 6,
            detailsLinkText: '查看方案詳情 ›',
            bookingBtnText: '立即預約',
            highlights: ['中文方案亮點'],
            language: '中文',
            earliestDeparture: '1 天前',
            confirmByDays: 1,
            freeCancelDays: 7,
            planInclusions: ['導覽'],
            planExclusions: ['餐食'],
            planItinerary: [{ text: '第一站', imageUrl: 'https://example.com/1.jpg' }],
            meetingPointName: '集合點',
            meetingAddress: '台北市',
            experiencePointName: '體驗點',
            experienceAddress: '新北市',
            planNotices: ['請提前 10 分鐘到場'],
            planRefundRules: ['7 天前免費取消'],
          },
        ],
      });

      assert.equal(upsertCalls.length, 1);
      assert.equal(upsertCalls[0].table, 'activity_plans');
      assert.deepEqual(upsertCalls[0].options, { onConflict: 'activity_id,slug' });
      assert.equal(upsertCalls[0].rows.length, 1);
      assert.equal(upsertCalls[0].rows[0].id, 'formal-half-day', 'existing formal plan ID should be preserved');
      assert.equal(upsertCalls[0].rows[0].activity_id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
      assert.equal(upsertCalls[0].rows[0].slug, 'half-day');
      assert.equal(upsertCalls[0].rows[0].name, '祕境半日遊');
      assert.equal(upsertCalls[0].rows[0].base_price, 3600);
      assert.deepEqual(upsertCalls[0].rows[0].highlights, ['中文方案亮點']);
      assert.deepEqual(upsertCalls[0].rows[0].plan_inclusions, ['導覽']);
      assert.deepEqual(upsertCalls[0].rows[0].plan_exclusions, ['餐食']);
      assert.deepEqual(upsertCalls[0].rows[0].plan_itinerary, [{ text: '第一站', imageUrl: 'https://example.com/1.jpg' }]);
      assert.equal(upsertCalls[0].rows[0].meeting_point_name, '集合點');
      assert.equal(upsertCalls[0].rows[0].experience_point_name, '體驗點');
      assert.deepEqual(upsertCalls[0].rows[0].plan_notices, ['請提前 10 分鐘到場']);
      assert.deepEqual(upsertCalls[0].rows[0].plan_refund_rules, ['7 天前免費取消']);
    } finally {
      dbMod.__setSupabaseClientForTest(null);
      if (originalUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = originalUrl;
      if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    }
  });
});
