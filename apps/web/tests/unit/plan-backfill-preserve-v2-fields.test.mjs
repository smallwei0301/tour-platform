import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildFormalPlanBackfillRows } from '../../src/lib/activity-plans-rich-mapper.mjs';

// #admin-plan-revert：後台「方案管理」把計價方式改成每團後，若之後「行程編輯」儲存，
// 舊版 activities.plans JSON 會回寫覆蓋 activity_plans，把 price_type 用 priceMultiplier
// 反推回每人（舊 JSON 沒有 price_type 欄位）。修正：已存在方案的 V2 專屬欄位
// （price_type / duration_minutes / booking_type）保留現值，不被反推覆寫。

const ACTIVITY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

test('existing plan keeps its V2 price_type/duration/booking even when legacy JSON would derive per_person', () => {
  const legacyPlans = [
    // 舊 JSON 沒有 price_type；priceMultiplier=1 會被反推成 per_person。
    { id: 'half-day', label: '半日方案', price: 3600, priceMultiplier: 1 },
  ];
  const existingBySlug = new Map([
    ['half-day', {
      id: '11111111-1111-4111-8111-111111111111',
      slug: 'half-day',
      // 操作者在方案管理改成的值：
      price_type: 'per_group',
      duration_minutes: 240,
      booking_type: 'instant',
    }],
  ]);

  const { upserts } = buildFormalPlanBackfillRows({ activityId: ACTIVITY_ID, legacyPlans, existingBySlug });

  assert.equal(upserts.length, 1);
  const row = upserts[0];
  assert.equal(row.id, '11111111-1111-4111-8111-111111111111', '保留既有 formal row id');
  // V2 專屬欄位保留現值，未被舊 JSON 反推洗掉：
  assert.equal(row.price_type, 'per_group', 'price_type 必須保留方案管理的每團，不得被反推回每人');
  assert.equal(row.duration_minutes, 240, 'duration 必須保留現值，不得被寫死 60');
  assert.equal(row.booking_type, 'instant', 'booking_type 必須保留現值，不得被寫死 scheduled');
  // 舊版可表達的欄位仍照常同步：
  assert.equal(row.base_price, 3600);
  assert.equal(row.name, '半日方案');
});

test('new plan (not yet in activity_plans) still derives defaults from legacy JSON', () => {
  const legacyPlans = [
    { id: 'group-tour', label: '包團方案', price: 9000, priceMultiplier: 2 },
    { id: 'solo', label: '單人方案', price: 1500, priceMultiplier: 1 },
  ];
  const existingBySlug = new Map(); // 皆為新方案

  const { upserts } = buildFormalPlanBackfillRows({ activityId: ACTIVITY_ID, legacyPlans, existingBySlug });

  const bySlug = Object.fromEntries(upserts.map((r) => [r.slug, r]));
  // priceMultiplier>1 → per_group；否則 per_person（新方案維持既有推導，不受影響）。
  assert.equal(bySlug['group-tour'].price_type, 'per_group');
  assert.equal(bySlug['solo'].price_type, 'per_person');
  assert.equal(bySlug['group-tour'].duration_minutes, 60);
  assert.equal(bySlug['group-tour'].booking_type, 'scheduled');
});

test('existing row with null V2 fields falls back to legacy-derived defaults', () => {
  const legacyPlans = [{ id: 'x', label: 'X', price: 2000, priceMultiplier: 2 }];
  const existingBySlug = new Map([
    ['x', { id: '22222222-2222-4222-8222-222222222222', slug: 'x', price_type: null, duration_minutes: null, booking_type: null }],
  ]);

  const { upserts } = buildFormalPlanBackfillRows({ activityId: ACTIVITY_ID, legacyPlans, existingBySlug });

  assert.equal(upserts[0].price_type, 'per_group');
  assert.equal(upserts[0].duration_minutes, 60);
  assert.equal(upserts[0].booking_type, 'scheduled');
});
