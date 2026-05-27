import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

function read(relPath) {
  const full = path.join(ROOT, relPath);
  assert.ok(fs.existsSync(full), `File must exist: ${full}`);
  return fs.readFileSync(full, 'utf8');
}

function buildSupabaseMock() {
  const activityRow = {
    id: 'act-1',
    slug: 'midao-demo',
    title: 'demo',
    tagline: null,
    short_description: null,
    description: null,
    region: null,
    region_slug: null,
    category: null,
    price_twd: 4200,
    duration_minutes: 240,
    min_participants: 1,
    max_participants: 8,
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
    plans: [
      {
        id: 'legacy-fallback',
        label: 'Legacy 方案',
        price: 999,
      },
    ],
    status: 'published',
    rating_avg: null,
    review_count: 0,
    guide_id: null,
    guide_slug: null,
  };

  const formalPlanRows = [
    {
      id: 'plan-formal-1',
      slug: 'formal-plan-1',
      name: '正式方案一',
      duration_minutes: 300,
      price_type: 'per_group',
      base_price: 5200,
      min_participants: 2,
      max_participants: 6,
      details_link_text: '查看方案詳情 ›',
      booking_btn_text: '立即預約',
      highlights: ['亮點 A'],
      plan_inclusions: ['含導覽'],
      plan_exclusions: ['不含餐食'],
      plan_itinerary: [{ text: '第一站', imageUrl: 'https://example.com/1.jpg' }],
      meeting_point_name: '集合點',
      meeting_address: '台北市',
      experience_point_name: '體驗點',
      experience_address: '新北市',
      plan_notices: ['注意事項'],
      plan_refund_rules: ['退款規則'],
      language: '中文',
      earliest_departure: '1 天前',
      confirm_by_days: 1,
      free_cancel_days: 7,
      status: 'active',
    },
  ];

  function chain(table, ctx = {}) {
    return {
      select() {
        return chain(table, ctx);
      },
      eq(column, value) {
        const next = { ...ctx, [column]: value };
        return chain(table, next);
      },
      in() {
        return chain(table, ctx);
      },
      order() {
        if (table === 'activity_schedules') return Promise.resolve({ data: [], error: null });
        if (table === 'activity_reviews') return Promise.resolve({ data: [], error: null });
        if (table === 'activity_plans') return Promise.resolve({ data: formalPlanRows, error: null });
        return Promise.resolve({ data: [], error: null });
      },
      limit() {
        if (table === 'activity_reviews') return Promise.resolve({ data: [], error: null });
        return Promise.resolve({ data: [], error: null });
      },
      single() {
        if (table === 'activities' && ctx.slug === 'midao-demo') {
          return Promise.resolve({ data: activityRow, error: null });
        }
        return Promise.resolve({ data: null, error: { message: 'not found' } });
      },
      maybeSingle() {
        return Promise.resolve({ data: null, error: null });
      },
    };
  }

  return {
    from(table) {
      return chain(table);
    },
  };
}

describe('GH-841 formal plan rich contract', () => {
  it('migration adds rich columns to activity_plans', () => {
    const migrationPath = path.resolve(
      ROOT,
      '../../supabase/migrations/20260527_issue841_activity_plans_rich_fields.sql',
    );
    assert.ok(fs.existsSync(migrationPath), 'GH-841 migration must exist');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    const requiredColumns = [
      'legacy_plan_id',
      'details_link_text',
      'booking_btn_text',
      'highlights',
      'language',
      'earliest_departure',
      'confirm_by_days',
      'free_cancel_days',
      'plan_inclusions',
      'plan_exclusions',
      'plan_itinerary',
      'plan_itinerary_image_url',
      'meeting_point_name',
      'meeting_address',
      'experience_point_name',
      'experience_address',
      'plan_notices',
      'plan_refund_rules',
    ];

    for (const column of requiredColumns) {
      assert.match(sql, new RegExp(`\\b${column}\\b`, 'i'), `Missing column in migration: ${column}`);
    }
  });

  it('mapper keeps existing formal ID and audits invalid price instead of writing 0', async () => {
    const mapperMod = path.resolve(ROOT, 'src/lib/activity-plans-rich-mapper.mjs');
    assert.ok(fs.existsSync(mapperMod), 'mapper module must exist');

    const { buildFormalPlanBackfillRows } = await import(pathToFileURL(mapperMod).href);

    const legacyPlans = [
      {
        id: 'half-day',
        label: 'A. 半日行程',
        duration: '約 4 小時',
        priceMultiplier: 1,
        price: 3600,
        detailsLinkText: '查看方案詳情 ›',
        bookingBtnText: '立即預約',
        highlights: ['最早出發前 1 天可預訂'],
        language: '中文',
        earliestDeparture: '1 天前',
        confirmByDays: 1,
        freeCancelDays: 7,
        planInclusions: ['導覽'],
        planExclusions: ['餐食'],
        planItinerary: [
          { text: '迪化街導覽', imageUrl: 'https://example.com/i.jpg' },
          { text: '永樂市場自由活動' },
        ],
        meetingPointName: '台北車站',
        meetingAddress: '台北市中正區',
        experiencePointName: '迪化街',
        experienceAddress: '台北市大同區',
        planNotices: ['請提前 10 分鐘到場'],
        planRefundRules: ['7 天前免費取消'],
      },
      {
        id: 'bad-price',
        label: 'B. 無效價格方案',
        duration: '約 2 小時',
        price: null,
      },
    ];

    const existingBySlug = new Map([
      ['half-day', { id: '11111111-1111-4111-8111-111111111111', slug: 'half-day' }],
    ]);

    const result = buildFormalPlanBackfillRows({
      activityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      legacyPlans,
      existingBySlug,
    });

    assert.equal(result.upserts.length, 1, 'only valid rows should become upserts');
    assert.equal(result.skipped.length, 1, 'invalid price row should be audited as skipped');
    assert.equal(result.upserts[0].id, '11111111-1111-4111-8111-111111111111', 'must preserve existing formal row id');
    assert.equal(result.upserts[0].base_price, 3600);
    assert.deepEqual(result.upserts[0].plan_itinerary, [
      { text: '迪化街導覽', imageUrl: 'https://example.com/i.jpg' },
      { text: '永樂市場自由活動' },
    ]);
    assert.equal(result.skipped[0].reason, 'invalid_price');
  });

  it('admin plans API routes wire rich payload normalizer', () => {
    const listRoute = read('app/api/v2/admin/activities/[activityId]/plans/route.ts');
    const itemRoute = read('app/api/v2/admin/activities/[activityId]/plans/[planId]/route.ts');

    assert.match(listRoute, /normalizeRichPlanPayload/i, 'POST route should normalize rich payload fields');
    assert.match(itemRoute, /normalizeRichPlanPayload/i, 'PUT route should normalize rich payload fields');
  });

  it('activity detail prefers active formal activity_plans over legacy activities.plans', async () => {
    const dbMod = await import(pathToFileURL(path.resolve(ROOT, 'src/lib/db.mjs')).href);
    const originalUrl = process.env.SUPABASE_URL;
    const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    dbMod.__setSupabaseClientForTest(buildSupabaseMock());

    try {
      const activity = await dbMod.getActivityBySlugDb('midao-demo');
      assert.ok(Array.isArray(activity?.plans), 'plans should exist');
      assert.equal(activity.plans[0].id, 'plan-formal-1');
      assert.equal(activity.plans[0].label, '正式方案一');
      assert.equal(activity.plans[0].basePrice, 5200);
      assert.equal(activity.plans[0].priceType, 'per_group');
      assert.equal(activity.plans[0].minParticipants, 2);
      assert.equal(activity.plans[0].maxParticipants, 6);
      assert.deepEqual(activity.plans[0].planInclusions, ['含導覽']);
      assert.deepEqual(activity.plans[0].planExclusions, ['不含餐食']);
      assert.deepEqual(activity.plans[0].planItinerary, [{ text: '第一站', imageUrl: 'https://example.com/1.jpg' }]);
      assert.equal(activity.plans[0].meetingPointName, '集合點');
      assert.equal(activity.plans[0].experiencePointName, '體驗點');
      assert.notEqual(activity.plans[0].id, 'legacy-fallback');
    } finally {
      dbMod.__setSupabaseClientForTest(null);
      if (originalUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = originalUrl;
      if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    }
  });
});
