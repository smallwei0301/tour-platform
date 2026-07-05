// issue #1501 — 外部佔位（external_hold）結算/營收隔離契約測試
//
// external_hold 是「佔名額但無金流」的 booking（source_channel='external'、
// status='external_hold'、無對應 order）。本測試用 source-contract 方式鎖死
// 「它永遠不會被誤計入營收或待結算金額」這個假設 —— 防止未來重構（例如把
// 統計改成以 bookings 為源）意外把外部佔位算成營收（這正是 #1376 類問題的溫床）。
//
// 鎖三道防線：
//   1. 結算 sweep（getUnsettledOrdersDb）只查 orders 且 status='completed'，不查 bookings。
//   2. fn_create_external_hold 只 INSERT 進 bookings，絕不 INSERT 進 orders → 外部佔位沒有營收列。
//   3. group-booking-rule：external_hold 計入 capacity hold、但不在 formed 集合（不算成團）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..', '..');
const read = (rel) => readFileSync(join(repoRoot, rel), 'utf8');

// 取出某個 named export function 的函式主體（到下一個 top-level export 為止）
function extractFn(src, name) {
  const start = src.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `找不到函式 ${name}`);
  // 邊界取「下一個 export」或「下一個 JSDoc 區塊（下一個函式的註解）」較近者，
  // 避免把下一個函式的 JSDoc 一併圈入造成誤判。
  const candidates = [src.indexOf('\nexport ', start + 1), src.indexOf('\n/**', start + 1)]
    .filter((i) => i !== -1);
  const end = candidates.length ? Math.min(...candidates) : src.length;
  return src.slice(start, end);
}

const DB = read('apps/web/src/lib/db.mjs') + read('apps/web/src/lib/db-settlement-ops.mjs'); // #1613：settlement 已拆出
const MIGRATION = read('supabase/migrations/20260624140000_external_hold_source_and_rpc.sql');
const RULE = read('apps/web/src/lib/availability-v2/group-booking-rule.ts');

test('防線1：結算 sweep 只以 orders 為源、且只取 completed —— 外部佔位（無 order）天然排除', () => {
  const fn = extractFn(DB, 'getUnsettledOrdersDb');
  assert.match(fn, /\.from\(\s*['"]orders['"]\s*\)/, '結算 sweep 必須查 orders 表');
  assert.match(fn, /\.eq\(\s*['"]status['"]\s*,\s*['"]completed['"]\s*\)/, '結算只納入 completed 訂單');
  // 不得改成以 bookings 為源（那會讓 external_hold 漏進結算）
  assert.doesNotMatch(fn, /\.from\(\s*['"]bookings['"]\s*\)/, '結算 sweep 不得查 bookings 表');
  assert.doesNotMatch(fn, /external_hold/, '結算 sweep 不得涉及 external_hold');
});

test('防線1b：admin 營收列表（listAdminOrdersDb）以 orders 為源，不以 bookings 計額', () => {
  const fn = extractFn(DB, 'listAdminOrdersDb');
  assert.match(fn, /\.from\(\s*['"]orders['"]\s*\)/, 'admin 訂單/營收必須查 orders 表');
  assert.doesNotMatch(fn, /\.from\(\s*['"]bookings['"]\s*\)/, 'admin 營收不得改以 bookings 計額');
  assert.doesNotMatch(fn, /external_hold/, 'admin 營收列表不得涉及 external_hold');
});

test('防線2：fn_create_external_hold 只 INSERT bookings，絕不 INSERT orders（外部佔位沒有營收列）', () => {
  const start = MIGRATION.indexOf('CREATE OR REPLACE FUNCTION fn_create_external_hold');
  assert.notEqual(start, -1, '找不到 fn_create_external_hold');
  const end = MIGRATION.indexOf('$$ LANGUAGE plpgsql;', start);
  const body = MIGRATION.slice(start, end === -1 ? MIGRATION.length : end);

  assert.match(body, /INSERT INTO bookings/, '外部佔位需建立一筆 bookings 列');
  // 關鍵：不得寫入 orders / payments / payout_items —— 否則就會產生假營收
  assert.doesNotMatch(body, /INSERT INTO orders/i, 'fn_create_external_hold 不得 INSERT orders');
  assert.doesNotMatch(body, /INSERT INTO payments/i, 'fn_create_external_hold 不得 INSERT payments');
  assert.doesNotMatch(body, /INSERT INTO payout_items/i, 'fn_create_external_hold 不得 INSERT payout_items');
});

test('防線3：external_hold 計入 capacity hold、但不在 formed 集合（不算成團、不視為已售營收）', () => {
  // 擷取兩個集合「定義」的陣列內容（只取 = [ ... ] 之間）
  const capDef = RULE.match(/CAPACITY_HOLD_BOOKING_STATUSES\s*=\s*\[([\s\S]*?)\]\s*as const/);
  const formedDef = RULE.match(/FORMED_GROUP_BOOKING_STATUSES\s*=\s*\[([\s\S]*?)\]\s*as const/);
  assert.ok(capDef, '找不到 CAPACITY_HOLD_BOOKING_STATUSES 定義');
  assert.ok(formedDef, '找不到 FORMED_GROUP_BOOKING_STATUSES 定義');
  assert.match(capDef[1], /external_hold/, 'external_hold 需在 capacity-hold 集合');
  assert.doesNotMatch(formedDef[1], /external_hold/, 'external_hold 不得進入 formed（成團）集合');
});
