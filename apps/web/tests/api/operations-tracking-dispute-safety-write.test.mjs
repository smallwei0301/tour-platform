/**
 * operations_tracking 的 is_disputed / is_safety_case 寫入端（owner 待辦 2026-06-22）。
 *
 * 背景：#1221/#1284 讓結算/導遊端讀 is_disputed（payment_dispute）與
 * is_safety_case（safety_review）兩個 payout-hold 旗標，#1473 補了 DB 欄位，但
 * admin 後台一直沒有設定這兩個 hold 的入口（updateOperationsTrackingDb 不寫）。
 * 本測試鎖定：gateway + in-memory fallback 都能寫入／讀回這兩個旗標，且任一為真
 * 時 hasException=true（與既有 has_complaint / has_oversell_issue 一致）。
 *
 * Run: node --test apps/web/tests/api/operations-tracking-dispute-safety-write.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createOrderDb, updateOperationsTrackingDb, listOperationsTrackingDb } from '../../src/lib/db.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');

test('updateOperationsTrackingDb 寫入並讀回 isDisputed / isSafetyCase（fallback）', async () => {
  const order = await createOrderDb({
    experienceSlug: 'kaohsiung-chaishan-cave-experience',
    scheduleId: 'sch_chaishan_0410',
    peopleCount: 1,
    contactName: 'Dispute Safety',
    contactPhone: '0900333444',
    contactEmail: 'dispute-safety@example.com',
  });

  const updated = await updateOperationsTrackingDb({
    orderId: order.id,
    isDisputed: true,
    isSafetyCase: true,
  });

  assert.equal(updated.isDisputed, true);
  assert.equal(updated.isSafetyCase, true);
  // 任一 hold 為真 → 該單視為異常（不健康）
  assert.equal(updated.hasException, true);

  const rows = await listOperationsTrackingDb();
  const fresh = rows.find((r) => r.orderId === order.id);
  assert.equal(fresh.isDisputed, true);
  assert.equal(fresh.isSafetyCase, true);
});

test('updateOperationsTrackingDb 可清除 isDisputed / isSafetyCase', async () => {
  const order = await createOrderDb({
    experienceSlug: 'kaohsiung-chaishan-cave-experience',
    scheduleId: 'sch_chaishan_0410',
    peopleCount: 1,
    contactName: 'Clear Hold',
    contactPhone: '0900555666',
    contactEmail: 'clear-hold@example.com',
  });

  await updateOperationsTrackingDb({ orderId: order.id, isDisputed: true, isSafetyCase: true });
  const cleared = await updateOperationsTrackingDb({ orderId: order.id, isDisputed: false, isSafetyCase: false });
  assert.equal(cleared.isDisputed, false);
  assert.equal(cleared.isSafetyCase, false);
});

test('源碼契約：db.mjs 與 fallback 的 payload 都含 is_disputed / is_safety_case', () => {
  const dbSrc = readFileSync(join(repoRoot, 'src/lib/db-settlement-ops.mjs'), 'utf8'); // #1613 strangler 後實作所在
  assert.match(dbSrc, /is_disputed:\s*!!input\?\.isDisputed/, 'db.mjs payload 需寫 is_disputed');
  assert.match(dbSrc, /is_safety_case:\s*!!input\?\.isSafetyCase/, 'db.mjs payload 需寫 is_safety_case');
  assert.match(dbSrc, /is_disputed,\s*is_safety_case|is_disputed, is_safety_case/, 'listOperationsTrackingDb select 需含兩欄');

  const adminSrc = readFileSync(join(repoRoot, 'src/lib/admin.mjs'), 'utf8');
  assert.match(adminSrc, /input\.isDisputed\s*!=\s*null/, 'fallback 需處理 isDisputed');
  assert.match(adminSrc, /input\.isSafetyCase\s*!=\s*null/, 'fallback 需處理 isSafetyCase');
});

test('源碼契約：admin operations-tracking 頁面有兩個新 hold 的 toggle', () => {
  const pageSrc = readFileSync(join(repoRoot, 'app/admin/operations-tracking/page.tsx'), 'utf8');
  assert.match(pageSrc, /key:\s*'isDisputed'/, '頁面需有 isDisputed toggle');
  assert.match(pageSrc, /key:\s*'isSafetyCase'/, '頁面需有 isSafetyCase toggle');
});
