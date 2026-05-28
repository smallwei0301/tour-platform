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
  it('backfill script provides deterministic dry-run audit and blocks invalid price writes', async () => {
    const scriptPath = path.resolve(ROOT, '../../scripts/admin/issue841-formal-plan-backfill.mjs');
    assert.ok(fs.existsSync(scriptPath), 'backfill script must exist');

    const { runFormalPlanBackfill } = await import(pathToFileURL(scriptPath).href);

    const upsertCalls = [];
    function chain(table, ctx = {}) {
      return {
        select() {
          return chain(table, ctx);
        },
        not() {
          return chain(table, ctx);
        },
        in(column, values) {
          return chain(table, { ...ctx, [column]: values });
        },
        order() {
          if (table === 'activities') {
            return Promise.resolve({
              data: [
                {
                  id: 'act-1',
                  plans: [
                    { id: 'legacy-ok', label: 'OK 方案', price: 3200, minParticipants: 1, maxParticipants: 4 },
                    { id: 'legacy-bad-price', label: '壞價格方案', price: 0 },
                  ],
                },
              ],
              error: null,
            });
          }
          if (table === 'activity_plans') {
            return Promise.resolve({
              data: [{ id: 'plan-1', activity_id: 'act-1', slug: 'legacy-ok' }],
              error: null,
            });
          }
          return Promise.resolve({ data: [], error: null });
        },
        upsert(rows) {
          upsertCalls.push(rows);
          return Promise.resolve({ error: null });
        },
      };
    }

    const client = { from: (table) => chain(table) };
    const audit = await runFormalPlanBackfill({ client, apply: false });

    assert.equal(audit.scannedActivities, 1);
    assert.equal(audit.candidatePlans, 2);
    assert.equal(audit.rowsUpdate, 1);
    assert.equal(audit.rowsInsert, 0);
    assert.equal(audit.rowsSkip, 1);
    assert.equal(audit.invalidPriceBlocked, 1);
    assert.equal(audit.skippedReasons.invalid_price, 1);
    assert.equal(upsertCalls.length, 0, 'dry-run must not mutate DB');
  });

  it('backfill apply mode is explicitly gated and dry-run is default', () => {
    const scriptPath = path.resolve(ROOT, '../../scripts/admin/issue841-formal-plan-backfill.mjs');
    const src = fs.readFileSync(scriptPath, 'utf8');

    assert.match(src, /const\s+dryRun\s*=\s*!apply/);
    assert.match(src, /ISSUE841_BACKFILL_ALLOW_APPLY/);
    assert.match(src, /--yes/);
    assert.match(src, /mode:\s*apply\s*\?\s*'apply'\s*:\s*'dry-run'/);
  });
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

  it('activity detail still uses formal activity_plans when formal rows are status-null (avoid silent legacy price fallback)', async () => {
    const dbMod = await import(pathToFileURL(path.resolve(ROOT, 'src/lib/db.mjs')).href);
    const originalUrl = process.env.SUPABASE_URL;
    const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

    const activityRow = {
      id: 'act-2',
      slug: 'status-null-formal',
      title: 'demo',
      price_twd: 1800,
      duration_minutes: 240,
      min_participants: 1,
      max_participants: 8,
      plans: [
        { id: 'half-day-morning', label: 'Legacy 半日', price: 18, priceMultiplier: 0.01 },
      ],
      status: 'published',
      guide_id: null,
      guide_slug: null,
    };

    const formalPlanRows = [
      {
        id: 'plan-formal-2',
        slug: 'half-day-morning',
        name: '半日行程（正式）',
        duration_minutes: 240,
        price_type: 'per_person',
        base_price: 1800,
        min_participants: 1,
        max_participants: 8,
        status: null,
      },
    ];

    function chain(table, ctx = {}) {
      return {
        select() {
          return chain(table, ctx);
        },
        eq(column, value) {
          return chain(table, { ...ctx, [column]: value });
        },
        in() {
          return chain(table, ctx);
        },
        order() {
          if (table === 'activity_schedules') return Promise.resolve({ data: [], error: null });
          if (table === 'activity_reviews') return Promise.resolve({ data: [], error: null });
          if (table === 'activity_plans') {
            if (ctx.status === 'active') return Promise.resolve({ data: [], error: null });
            return Promise.resolve({ data: formalPlanRows, error: null });
          }
          return Promise.resolve({ data: [], error: null });
        },
        single() {
          if (table === 'activities' && ctx.slug === 'status-null-formal') {
            return Promise.resolve({ data: activityRow, error: null });
          }
          return Promise.resolve({ data: null, error: { message: 'not found' } });
        },
        maybeSingle() {
          return Promise.resolve({ data: null, error: null });
        },
        limit() {
          return Promise.resolve({ data: [], error: null });
        },
      };
    }

    dbMod.__setSupabaseClientForTest({ from: (table) => chain(table) });

    try {
      const activity = await dbMod.getActivityBySlugDb('status-null-formal');
      assert.ok(Array.isArray(activity?.plans), 'plans should exist');
      assert.equal(activity.plans[0].id, 'plan-formal-2');
      assert.equal(activity.plans[0].basePrice, 1800);
      assert.equal(activity.plans[0].priceType, 'per_person');
      assert.notEqual(activity.plans[0].id, 'half-day-morning');
      assert.notEqual(activity.plans[0].basePrice, 18);
    } finally {
      dbMod.__setSupabaseClientForTest(null);
      if (originalUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = originalUrl;
      if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    }
  });

  it('activity detail retries formal-plan query with pricing-safe subset when rich columns are unavailable', async () => {
    const dbMod = await import(pathToFileURL(path.resolve(ROOT, 'src/lib/db.mjs')).href);
    const originalUrl = process.env.SUPABASE_URL;
    const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

    const activityRow = {
      id: 'act-4',
      slug: 'formal-query-retry',
      title: 'retry demo',
      price_twd: 1800,
      duration_minutes: 240,
      min_participants: 1,
      max_participants: 8,
      plans: [{ id: 'legacy-plan', label: 'Legacy 方案', price: 18, priceMultiplier: 0.01 }],
      status: 'published',
      guide_id: null,
      guide_slug: null,
    };

    const formalPlanRows = [{
      id: 'plan-formal-retry',
      slug: 'half-day-morning',
      name: '半日正式方案',
      duration_minutes: 240,
      price_type: 'per_person',
      base_price: 1800,
      min_participants: 1,
      max_participants: 8,
      status: null,
    }];

    let activityPlansOrderCount = 0;
    function chain(table, ctx = {}) {
      return {
        select() {
          return chain(table, ctx);
        },
        eq(column, value) {
          return chain(table, { ...ctx, [column]: value });
        },
        in() {
          return chain(table, ctx);
        },
        order() {
          if (table === 'activity_schedules') return Promise.resolve({ data: [], error: null });
          if (table === 'activity_reviews') return Promise.resolve({ data: [], error: null });
          if (table === 'activity_plans') {
            activityPlansOrderCount += 1;
            if (activityPlansOrderCount === 1) {
              return Promise.resolve({ data: null, error: { message: 'column activity_plans.plan_itinerary_image_url does not exist' } });
            }
            return Promise.resolve({ data: formalPlanRows, error: null });
          }
          return Promise.resolve({ data: [], error: null });
        },
        single() {
          if (table === 'activities' && ctx.slug === 'formal-query-retry') {
            return Promise.resolve({ data: activityRow, error: null });
          }
          return Promise.resolve({ data: null, error: { message: 'not found' } });
        },
        maybeSingle() {
          return Promise.resolve({ data: null, error: null });
        },
        limit() {
          return Promise.resolve({ data: [], error: null });
        },
      };
    }

    dbMod.__setSupabaseClientForTest({ from: (table) => chain(table) });

    try {
      const activity = await dbMod.getActivityBySlugDb('formal-query-retry');
      assert.ok(Array.isArray(activity?.plans), 'plans should exist');
      assert.equal(activityPlansOrderCount, 2, 'should retry formal-plan query after rich-column failure');
      assert.equal(activity.plans[0].id, 'plan-formal-retry');
      assert.equal(activity.plans[0].basePrice, 1800);
      assert.equal(activity.plans[0].priceType, 'per_person');
      assert.notEqual(activity.plans[0].basePrice, 18);
    } finally {
      dbMod.__setSupabaseClientForTest(null);
      if (originalUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = originalUrl;
      if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    }
  });

  it('activity detail falls back to legacy plans when all formal plans are inactive/archived', async () => {
    const dbMod = await import(pathToFileURL(path.resolve(ROOT, 'src/lib/db.mjs')).href);
    const originalUrl = process.env.SUPABASE_URL;
    const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

    const activityRow = {
      id: 'act-3',
      slug: 'fallback-to-legacy-from-archived',
      title: 'legacy fallback',
      price_twd: 1200,
      duration_minutes: 180,
      min_participants: 1,
      max_participants: 4,
      plans: [
        { id: 'legacy-arch', label: 'Legacy 方案', price: 18, priceMultiplier: 0.01 },
      ],
      status: 'published',
      guide_id: null,
      guide_slug: null,
    };

    const formalPlanRows = [
      {
        id: 'inactive-plan',
        slug: 'formal-inactive',
        name: '停用正式方案',
        duration_minutes: 180,
        price_type: 'per_person',
        base_price: 5000,
        min_participants: 1,
        max_participants: 4,
        status: 'inactive',
      },
      {
        id: 'archived-plan',
        slug: 'formal-archived',
        name: '封存正式方案',
        duration_minutes: 180,
        price_type: 'per_person',
        base_price: 5500,
        min_participants: 1,
        max_participants: 4,
        status: 'archived',
      },
    ];

    function chain(table, ctx = {}) {
      return {
        select() {
          return chain(table, ctx);
        },
        eq(column, value) {
          return chain(table, { ...ctx, [column]: value });
        },
        in() {
          return chain(table, ctx);
        },
        order() {
          if (table === 'activity_schedules') return Promise.resolve({ data: [], error: null });
          if (table === 'activity_reviews') return Promise.resolve({ data: [], error: null });
          if (table === 'activity_plans') {
            return Promise.resolve({ data: formalPlanRows, error: null });
          }
          return Promise.resolve({ data: [], error: null });
        },
        single() {
          if (table === 'activities' && ctx.slug === 'fallback-to-legacy-from-archived') {
            return Promise.resolve({ data: activityRow, error: null });
          }
          return Promise.resolve({ data: null, error: { message: 'not found' } });
        },
        maybeSingle() {
          return Promise.resolve({ data: null, error: null });
        },
        limit() {
          return Promise.resolve({ data: [], error: null });
        },
      };
    }

    dbMod.__setSupabaseClientForTest({ from: (table) => chain(table) });

    try {
      const activity = await dbMod.getActivityBySlugDb('fallback-to-legacy-from-archived');
      assert.ok(Array.isArray(activity?.plans), 'plans should exist');
      assert.equal(activity.plans[0].id, 'legacy-arch');
      assert.equal(activity.plans[0].price || activity.plans[0].basePrice, 18);
    } finally {
      dbMod.__setSupabaseClientForTest(null);
      if (originalUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = originalUrl;
      if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    }
  });
});
