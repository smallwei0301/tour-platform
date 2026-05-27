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
        planItinerary: { imageUrl: 'https://example.com/i.jpg' },
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
    assert.equal(result.skipped[0].reason, 'invalid_price');
  });

  it('admin plans API routes wire rich payload normalizer', () => {
    const listRoute = read('app/api/v2/admin/activities/[activityId]/plans/route.ts');
    const itemRoute = read('app/api/v2/admin/activities/[activityId]/plans/[planId]/route.ts');

    assert.match(listRoute, /normalizeRichPlanPayload/i, 'POST route should normalize rich payload fields');
    assert.match(itemRoute, /normalizeRichPlanPayload/i, 'PUT route should normalize rich payload fields');
  });
});
