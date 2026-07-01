import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildV2PlanInsertRows } from '../../src/lib/activity-plans-rich-mapper.mjs';

// #admin-plan-revert 後續：投稿／JSON 匯入改生 V2 方案，且「只新增不覆蓋」。
// 這支鎖定純建構層：欄位映射、預設值、slug 去重（既有＋本批）、無效資料跳過。

const ACTIVITY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

test('maps a V2 plan into an activity_plans insert row with its V2 fields', () => {
  const { inserts, skipped } = buildV2PlanInsertRows({
    activityId: ACTIVITY_ID,
    plans: [{
      name: 'Group Charter',
      slug: 'group-charter',
      priceType: 'per_group',
      basePrice: 9000,
      durationMinutes: 240,
      bookingType: 'instant',
      minParticipants: 2,
      maxParticipants: 6,
      highlights: ['亮點一'],
      planItinerary: [{ icon: '📍', title: '第一站', description: '描述' }],
    }],
  });

  assert.equal(skipped.length, 0);
  assert.equal(inserts.length, 1);
  const row = inserts[0];
  assert.equal(row.activity_id, ACTIVITY_ID);
  assert.equal(row.slug, 'group-charter');
  assert.equal(row.name, 'Group Charter');
  assert.equal(row.price_type, 'per_group');
  assert.equal(row.base_price, 9000);
  assert.equal(row.duration_minutes, 240);
  assert.equal(row.booking_type, 'instant');
  assert.equal(row.min_participants, 2);
  assert.equal(row.max_participants, 6);
  assert.equal(row.status, 'active');
  assert.deepEqual(row.highlights, ['亮點一']);
  assert.deepEqual(row.plan_itinerary, [{ icon: '📍', title: '第一站', description: '描述' }]);
});

test('skips a plan whose slug already exists (never overwrites existing 方案管理 plan)', () => {
  const { inserts, skipped } = buildV2PlanInsertRows({
    activityId: ACTIVITY_ID,
    plans: [{ name: 'Half Day', slug: 'half-day', basePrice: 1800 }],
    existingSlugs: new Set(['half-day']),
  });

  assert.equal(inserts.length, 0);
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].reason, 'slug_exists');
  assert.equal(skipped[0].slug, 'half-day');
});

test('dedupes duplicate slugs within the same batch (first wins, rest skipped)', () => {
  const { inserts, skipped } = buildV2PlanInsertRows({
    activityId: ACTIVITY_ID,
    plans: [
      { name: 'Sunrise Tour', basePrice: 1000 },
      { name: 'Sunrise Tour', basePrice: 2000 },
    ],
  });

  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].base_price, 1000);
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].reason, 'slug_exists');
});

test('defaults price_type/booking_type/duration when missing or invalid', () => {
  const { inserts } = buildV2PlanInsertRows({
    activityId: ACTIVITY_ID,
    plans: [{ name: 'Basic', slug: 'basic', basePrice: 500, priceType: 'bogus', bookingType: 'nope', durationMinutes: 5 }],
  });

  assert.equal(inserts[0].price_type, 'per_person');
  assert.equal(inserts[0].booking_type, 'scheduled');
  assert.equal(inserts[0].duration_minutes, 60); // 5 < 15 → 預設 60
});

test('skips rows with missing name or invalid price', () => {
  const { inserts, skipped } = buildV2PlanInsertRows({
    activityId: ACTIVITY_ID,
    plans: [
      { slug: 'noname', basePrice: 100 },
      { name: 'No Price', slug: 'noprice' },
      { name: 'Neg Price', slug: 'neg', basePrice: -5 },
    ],
  });

  assert.equal(inserts.length, 0);
  const reasons = skipped.map((s) => s.reason).sort();
  assert.deepEqual(reasons, ['invalid_price', 'invalid_price', 'missing_name']);
});
