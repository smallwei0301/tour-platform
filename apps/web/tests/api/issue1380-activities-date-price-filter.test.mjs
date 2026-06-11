/**
 * Issue #1380 — 活動列表：日期可訂篩選 + 價格區間
 *
 * AC1: GET /api/activities?date=YYYY-MM-DD 只回傳該日有可訂 slot 的活動
 * AC2: priceMin/priceMax 過濾正確（邊界含等於）
 * AC3: 與 region/type/q 疊加
 * AC4: in-memory fallback 行為一致（route 層統一過濾，兩後端同 code path）
 *
 * 純 helper 單元測試 + route 接線 source-contract；
 * 真實 API 行為由 dev server live smoke 與 e2e 驗證。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  parseActivitiesFilterParams,
  applyPriceRange,
  hasOpenScheduleOn,
} from '../../src/lib/activities-list-filters.mjs';

// ── parseActivitiesFilterParams ─────────────────────────────────────────────

test('parse: 合法 date / priceMin / priceMax', () => {
  const sp = new URLSearchParams('date=2026-04-10&priceMin=1000&priceMax=2500');
  const r = parseActivitiesFilterParams(sp);
  assert.equal(r.error, undefined);
  assert.equal(r.date, '2026-04-10');
  assert.equal(r.priceMin, 1000);
  assert.equal(r.priceMax, 2500);
});

test('parse: 全部缺省 → 無過濾、無錯誤', () => {
  const r = parseActivitiesFilterParams(new URLSearchParams(''));
  assert.equal(r.error, undefined);
  assert.equal(r.date, null);
  assert.equal(r.priceMin, null);
  assert.equal(r.priceMax, null);
});

test('parse: 非法日期 → INVALID_DATE（400）', () => {
  for (const bad of ['2026-13-01', '2026-02-30', 'not-a-date', '20260410', '2026-4-1']) {
    const r = parseActivitiesFilterParams(new URLSearchParams(`date=${bad}`));
    assert.equal(r.error?.code, 'INVALID_DATE', `date=${bad} 應為 INVALID_DATE`);
  }
});

test('parse: 非法價格（負數/NaN/min>max）→ INVALID_PRICE_RANGE', () => {
  for (const qs of ['priceMin=-1', 'priceMax=abc', 'priceMin=3000&priceMax=1000']) {
    const r = parseActivitiesFilterParams(new URLSearchParams(qs));
    assert.equal(r.error?.code, 'INVALID_PRICE_RANGE', `${qs} 應為 INVALID_PRICE_RANGE`);
  }
});

// ── applyPriceRange（AC2 邊界含等於）────────────────────────────────────────

const PRICED = [
  { slug: 'a', priceTwd: 1200 },
  { slug: 'b', priceTwd: 1500 },
  { slug: 'c', priceTwd: 2000 },
  { slug: 'd', priceTwd: 3200 },
];

test('price: min/max 邊界含等於', () => {
  assert.deepEqual(applyPriceRange(PRICED, 1500, 2000).map((a) => a.slug), ['b', 'c']);
  assert.deepEqual(applyPriceRange(PRICED, null, 1200).map((a) => a.slug), ['a']);
  assert.deepEqual(applyPriceRange(PRICED, 3200, null).map((a) => a.slug), ['d']);
  assert.equal(applyPriceRange(PRICED, null, null).length, 4);
});

// ── hasOpenScheduleOn（AC1 in-memory 判定）──────────────────────────────────

const SCHEDULES = [
  { startAt: '2026-04-01T09:00:00+08:00', capacity: 12, bookedCount: 1, status: 'open' },
  { startAt: '2026-04-03T09:00:00+08:00', capacity: 12, bookedCount: 12, status: 'full' },
  { startAt: '2026-04-05T14:00:00+08:00', capacity: 8, bookedCount: 8, status: 'open' },
];

test('date: 該日有 open 且有餘額的 slot → true', () => {
  assert.equal(hasOpenScheduleOn(SCHEDULES, '2026-04-01'), true);
});

test('date: 該日 slot 為 full 狀態 → false', () => {
  assert.equal(hasOpenScheduleOn(SCHEDULES, '2026-04-03'), false);
});

test('date: status open 但已滿（booked>=capacity）→ false', () => {
  assert.equal(hasOpenScheduleOn(SCHEDULES, '2026-04-05'), false);
});

test('date: 該日無 slot / schedules 為空 → false', () => {
  assert.equal(hasOpenScheduleOn(SCHEDULES, '2026-04-09'), false);
  assert.equal(hasOpenScheduleOn([], '2026-04-01'), false);
  assert.equal(hasOpenScheduleOn(undefined, '2026-04-01'), false);
});

// ── source-contract：route 接線 ─────────────────────────────────────────────

const routeSrc = readFileSync(path.resolve('app/api/activities/route.ts'), 'utf8');

test('接線: route 解析 date/priceMin/priceMax 並於非法輸入回 400', () => {
  assert.match(routeSrc, /parseActivitiesFilterParams/, 'route 應用統一 parser');
  assert.match(routeSrc, /status:\s*400/, '非法參數應回 400');
});

test('接線: Supabase 模式日期過濾走 v2 availability 引擎；fallback 走 fixture schedules', () => {
  assert.match(routeSrc, /hasSupabaseEnv/, '應依環境分流');
  assert.match(routeSrc, /getV2ActivityAvailability/, 'Supabase 模式應用 v2 引擎判定可訂');
  assert.match(routeSrc, /hasOpenScheduleOn/, 'fallback 應用 fixture schedules 判定');
});

test('接線: 價格過濾套用於統一回傳 shape（兩後端同 code path）', () => {
  assert.match(routeSrc, /applyPriceRange/, '應用 applyPriceRange');
});
