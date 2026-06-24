/**
 * buildPlanColumnPatch 單測 —— 核准時把 pending_changes 套用回 row 的關鍵映射。
 * 重點：部分更新不得把未提供的 rich 欄位寫成 null（否則核准會清空既有內容）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlanColumnPatch } from '../../src/lib/plan-column-patch.mjs';

test('plain 欄位直通，name 去空白', () => {
  const patch = buildPlanColumnPatch({
    name: '  半日遊  ', base_price: 1800, price_type: 'per_person',
    duration_minutes: 240, min_participants: 2, max_participants: 8,
    booking_type: 'scheduled', is_year_round: true,
  });
  assert.equal(patch.name, '半日遊');
  assert.equal(patch.base_price, 1800);
  assert.equal(patch.price_type, 'per_person');
  assert.equal(patch.duration_minutes, 240);
  assert.equal(patch.min_participants, 2);
  assert.equal(patch.max_participants, 8);
  assert.equal(patch.booking_type, 'scheduled');
  assert.equal(patch.is_year_round, true);
});

test('只改價格 → patch 只含 base_price，未提供的 rich 欄位不出現（不會被寫 null）', () => {
  const patch = buildPlanColumnPatch({ base_price: 2200 });
  assert.deepEqual(Object.keys(patch), ['base_price']);
  assert.equal('plan_inclusions' in patch, false);
  assert.equal('plan_itinerary' in patch, false);
  assert.equal('highlights' in patch, false);
});

test('提供 rich 陣列欄位 → 正規化後寫入', () => {
  const patch = buildPlanColumnPatch({
    plan_inclusions: ['  保險 ', '', '導覽'],
    highlights: ['亮點A'],
  });
  assert.deepEqual(patch.plan_inclusions, ['保險', '導覽']);
  assert.deepEqual(patch.highlights, ['亮點A']);
  assert.equal('plan_exclusions' in patch, false);
});

test('提供站點時間表 → 正規化保留 title/description/imageUrl', () => {
  const patch = buildPlanColumnPatch({
    plan_itinerary: [{ title: '集合', description: '烏石港', imageUrl: 'http://x/y.jpg' }],
  });
  assert.equal(Array.isArray(patch.plan_itinerary), true);
  assert.equal(patch.plan_itinerary[0].title, '集合');
  assert.equal(patch.plan_itinerary[0].imageUrl, 'http://x/y.jpg');
});

test('空輸入 / 非物件 → 空 patch', () => {
  assert.deepEqual(buildPlanColumnPatch({}), {});
  assert.deepEqual(buildPlanColumnPatch(null), {});
  assert.deepEqual(buildPlanColumnPatch('x'), {});
});
