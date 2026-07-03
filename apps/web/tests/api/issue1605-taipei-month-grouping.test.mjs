/**
 * issue1605 — 台北時區月鍵分組純函式契約
 * guide dashboard 6 個月營收趨勢由「逐月查詢」改為「單一區間查詢＋記憶體分組」，
 * 分組必須與原本逐月 [mStart, mEnd) 半開區間查詢語意完全等價（台北 UTC+8 月界）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { taipeiMonthKey, groupOrdersByTaipeiMonth } from '../../src/lib/guide-dashboard-trend.mjs';

const TAIPEI_OFFSET_MINUTES = 8 * 60;

test('taipeiMonthKey: UTC 月底 15:59:59Z 仍屬台北當月（23:59:59）', () => {
  assert.equal(taipeiMonthKey('2026-01-31T15:59:59Z'), '2026-01');
});

test('taipeiMonthKey: UTC 月底 16:00:00Z 已是台北隔月 00:00', () => {
  assert.equal(taipeiMonthKey('2026-01-31T16:00:00Z'), '2026-02');
});

test('taipeiMonthKey: 支援 Supabase 回傳的 +00:00 offset 格式', () => {
  assert.equal(taipeiMonthKey('2026-01-31T16:00:00+00:00'), '2026-02');
  assert.equal(taipeiMonthKey('2026-06-15T04:00:00+00:00'), '2026-06');
});

test('taipeiMonthKey: 跨年月界（12 月台北 → 1 月）', () => {
  assert.equal(taipeiMonthKey('2025-12-31T15:59:59Z'), '2025-12');
  assert.equal(taipeiMonthKey('2025-12-31T16:00:00Z'), '2026-01');
});

test('taipeiMonthKey: 與 route 的 gmvMonthStart/gmvMonthEnd 半開區間語意等價', () => {
  // 重現 route.ts 的月界推導：台北 2026-06 月 = [UTC(2026,5,1)-8h, UTC(2026,6,1)-8h)
  const mStart = new Date(Date.UTC(2026, 5, 1) - TAIPEI_OFFSET_MINUTES * 60000);
  const mEnd = new Date(Date.UTC(2026, 6, 1) - TAIPEI_OFFSET_MINUTES * 60000);
  // 區間內（含下界、不含上界）→ 月鍵 = 2026-06
  assert.equal(taipeiMonthKey(mStart.toISOString()), '2026-06');
  assert.equal(taipeiMonthKey(new Date(mEnd.getTime() - 1000).toISOString()), '2026-06');
  // 區間外 → 不是 2026-06
  assert.equal(taipeiMonthKey(mEnd.toISOString()), '2026-07');
  assert.equal(taipeiMonthKey(new Date(mStart.getTime() - 1000).toISOString()), '2026-05');
});

test('groupOrdersByTaipeiMonth: 按月鍵分桶且保留原順序', () => {
  const orders = [
    { id: 'a', created_at: '2026-05-10T00:00:00Z' },
    { id: 'b', created_at: '2026-06-01T00:00:00Z' },
    { id: 'c', created_at: '2026-05-31T16:00:00Z' }, // 台北 6/1 00:00 → 2026-06
    { id: 'd', created_at: '2026-05-31T15:59:59Z' }, // 台北 5/31 23:59 → 2026-05
  ];
  const byMonth = groupOrdersByTaipeiMonth(orders);
  assert.deepEqual((byMonth.get('2026-05') ?? []).map((o) => o.id), ['a', 'd']);
  assert.deepEqual((byMonth.get('2026-06') ?? []).map((o) => o.id), ['b', 'c']);
  assert.equal(byMonth.get('2026-07'), undefined);
});

test('groupOrdersByTaipeiMonth: 空/缺值輸入回空 Map', () => {
  assert.equal(groupOrdersByTaipeiMonth([]).size, 0);
  assert.equal(groupOrdersByTaipeiMonth(null).size, 0);
  assert.equal(groupOrdersByTaipeiMonth(undefined).size, 0);
});
