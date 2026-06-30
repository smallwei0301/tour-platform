/**
 * 排程 vs 即時 預約「可用時間來源」嚴格區隔 — PR1 後端守門
 *
 * 需求（owner 拍板）：
 *   - 排程預約（scheduled）只看固定場次（activity_schedules），不看導遊可行時間。
 *   - 即時／申請預約（instant／request）只看導遊可行時間（guide_availability_rules），
 *     不看固定場次。
 *
 * 引擎讀取層早已落實此區隔；PR1 補「設定守門」與「instant 收斂」：
 *   1. 動態可預約時段規則寫入路由（guide×2、admin×2）：當綁定的方案 booking_type
 *      === 'scheduled' → 422 RULE_NOT_APPLICABLE_FOR_BOOKING_TYPE（守門先於 insert/update）。
 *   2. draft：instant／request 嚴格忽略傳入的 scheduleId（只用動態規則）。
 *
 * 純函式行為測試見 tests/unit/booking-type-flow.test.mjs。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

const HELPER_PATH = join(REPO_ROOT, 'src/lib/availability-v2/assert-plan-belongs-to-guide.ts');
const GUIDE_POST = join(REPO_ROOT, 'app/api/guide/availability-rules/route.ts');
const GUIDE_PUT = join(REPO_ROOT, 'app/api/guide/availability-rules/[ruleId]/route.ts');
const ADMIN_POST = join(REPO_ROOT, 'app/api/v2/admin/guides/[guideId]/availability-rules/route.ts');
const ADMIN_PUT = join(
  REPO_ROOT,
  'app/api/v2/admin/guides/[guideId]/availability-rules/[ruleId]/route.ts'
);
const DRAFT = join(REPO_ROOT, 'app/api/v2/bookings/draft/route.ts');

function read(p) {
  return readFileSync(p, 'utf8');
}

test('純函式：booking-type-flow 匯出 isDynamicAvailabilityApplicable', () => {
  const src = read(join(REPO_ROOT, 'src/lib/booking-type-flow.mjs'));
  assert.match(src, /export function isDynamicAvailabilityApplicable/);
  // scheduled 必須回 false（只看固定場次）。
  assert.match(src, /normalizeBookingType\(bookingType\)\s*!==\s*'scheduled'/);
});

test('guide POST：ensureOwnedUsablePlan 取 booking_type 並回 422 RULE_NOT_APPLICABLE_FOR_BOOKING_TYPE', () => {
  const src = read(GUIDE_POST);
  assert.match(src, /isDynamicAvailabilityApplicable/, '應引入純函式判準');
  assert.match(src, /booking_type/, 'select 應補 booking_type');
  assert.match(src, /RULE_NOT_APPLICABLE_FOR_BOOKING_TYPE/);
  assert.match(src, /status:\s*422/);
  // 守門位於 ensureOwnedUsablePlan，且 POST 在 .insert( 前呼叫它。
  const guardIdx = src.indexOf('ensureOwnedUsablePlan(');
  const insertIdx = src.indexOf('.insert(');
  assert.ok(guardIdx >= 0 && insertIdx >= 0 && guardIdx < insertIdx, '守門必須先於 insert');
});

test('guide PUT：ensureOwnedUsablePlan 取 booking_type 並回 422，守門先於 update', () => {
  const src = read(GUIDE_PUT);
  assert.match(src, /isDynamicAvailabilityApplicable/);
  assert.match(src, /booking_type/);
  assert.match(src, /RULE_NOT_APPLICABLE_FOR_BOOKING_TYPE/);
  assert.match(src, /status:\s*422/);
  const guardIdx = src.indexOf('ensureOwnedUsablePlan(');
  const updateIdx = src.indexOf('.update(');
  assert.ok(guardIdx >= 0 && updateIdx >= 0 && guardIdx < updateIdx, '守門必須先於 update');
});

test('共用 helper：assertPlanBelongsToGuide 取 booking_type 並回 RULE_NOT_APPLICABLE_FOR_BOOKING_TYPE', () => {
  const src = read(HELPER_PATH);
  assert.match(src, /isDynamicAvailabilityApplicable/);
  // select 必須含 booking_type，否則無從判斷。
  assert.match(src, /select\([^)]*booking_type/);
  assert.match(src, /RULE_NOT_APPLICABLE_FOR_BOOKING_TYPE/);
});

test('admin POST：透過共用 helper 守門，422 先於 insert', () => {
  const src = read(ADMIN_POST);
  assert.match(src, /assertPlanBelongsToGuide/);
  assert.match(src, /RULE_NOT_APPLICABLE_FOR_BOOKING_TYPE/);
  assert.match(src, /status:\s*422/);
  const guardIdx = src.indexOf('assertPlanBelongsToGuide(');
  const insertIdx = src.indexOf('.insert(');
  assert.ok(guardIdx >= 0 && insertIdx >= 0 && guardIdx < insertIdx, '守門必須先於 insert');
});

test('admin PUT：透過共用 helper 守門，422 先於 update', () => {
  const src = read(ADMIN_PUT);
  assert.match(src, /assertPlanBelongsToGuide/);
  assert.match(src, /RULE_NOT_APPLICABLE_FOR_BOOKING_TYPE/);
  assert.match(src, /status:\s*422/);
  const guardIdx = src.indexOf('assertPlanBelongsToGuide(');
  const updateIdx = src.indexOf('.update(');
  assert.ok(guardIdx >= 0 && updateIdx >= 0 && guardIdx < updateIdx, '守門必須先於 update');
});

test('draft：instant／request 嚴格忽略 scheduleId（固定場次解析閘在 booking_type==="scheduled"）', () => {
  const src = read(DRAFT);
  // 固定場次解析區塊的進入條件必須同時要求 scheduled。
  assert.match(
    src,
    /if\s*\(\s*data\.scheduleId\s*&&\s*planData\.booking_type\s*===\s*'scheduled'\s*\)/,
    'scheduleId 解析必須限定 scheduled 方案，instant／request 不採固定場次'
  );
});
