/**
 * 行為測試：後台「取消＋退款」一次性流程（cancelOrderAdminDb → createAdminPosRefundEntryDb）
 *
 * 背景：cancel route（POST /api/admin/orders/:orderId/cancel）先 cancelOrderAdminDb
 * 把訂單設成 cancelled_by_guide，再 createAdminPosRefundEntryDb 建立全額退款 entry。
 * 既有的 contract 測試只做 regex source 檢查，沒有實跑流程，因此漏掉兩個真實 bug：
 *   1. cancelOrderAdminDb 的 in-memory fallback 呼叫不存在的 getOrders/setOrders。
 *   2. createRefundRequestDb 對 cancelled_by_guide 直接拒絕，導致退款 entry 永遠建不出來。
 *
 * 本檔以 in-memory fallback 實跑整條流程，鎖定「取消→釋放名額→建立 refunded 退款 entry」的契約。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import {
  createOrderDb,
  updateAdminOrderDb,
  cancelOrderAdminDb,
  createAdminPosRefundEntryDb,
  listAdminRefundRequestsDb,
  getMyOrderDetailDb,
} from '../../src/lib/db.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbSrc = readFileSync(join(__dirname, '../../src/lib/db.mjs'), 'utf8');
const servicesSrc = readFileSync(join(__dirname, '../../src/lib/services.mjs'), 'utf8');

async function seedPaidOrder(email) {
  const order = await createOrderDb({
    experienceSlug: 'dadadaocheng-walk',
    scheduleId: 'sch_dadaocheng_0402',
    peopleCount: 1,
    contactName: 'Cancel Refund',
    contactPhone: '0900000007',
    contactEmail: email,
  });
  await updateAdminOrderDb({ orderId: order.id, status: 'paid', actor: 'admin', sourceChannel: 'admin_pos' });
  return order;
}

test('cancelOrderAdminDb 在 in-memory fallback 下可把 paid 訂單設為 cancelled_by_guide', async () => {
  const order = await seedPaidOrder('cancel-step1@example.com');
  const result = await cancelOrderAdminDb({ orderId: order.id });
  assert.equal(result.status, 'cancelled_by_guide');

  const detail = await getMyOrderDetailDb({ orderId: order.id });
  assert.equal(detail.status, 'cancelled_by_guide');
});

test('取消＋退款完整流程：取消後仍能建立 refunded 退款 entry，訂單最終為 refunded', async () => {
  const order = await seedPaidOrder('cancel-refund-flow@example.com');

  // 模擬 cancel route：先取消，再建立全額退款 entry
  await cancelOrderAdminDb({ orderId: order.id });
  const refund = await createAdminPosRefundEntryDb({
    orderId: order.id,
    requestId: `req-cancel-refund-${order.id}`,
    adminNote: 'admin cancel + refund',
  });

  assert.equal(refund.refundStatus, 'refunded');
  assert.ok(refund.refundRequestId, 'should return a refundRequestId');

  // 退款管理列表（listAdminRefundRequestsDb）必須看得到這筆退款
  const rows = await listAdminRefundRequestsDb();
  const row = rows.find((r) => r.id === refund.refundRequestId);
  assert.ok(row, '退款 entry 必須出現在退款管理列表');
  assert.equal(row.orderId, order.id);

  // 訂單最終狀態為 refunded
  const detail = await getMyOrderDetailDb({ orderId: order.id });
  assert.equal(detail.status, 'refunded');
});

test('取消＋退款具冪等性：相同 requestId 重跑回 replay，不重複建立退款 entry', async () => {
  const order = await seedPaidOrder('cancel-refund-idem@example.com');
  const requestId = `req-cancel-refund-idem-${order.id}`;

  await cancelOrderAdminDb({ orderId: order.id });
  const first = await createAdminPosRefundEntryDb({ orderId: order.id, requestId, adminNote: 'first' });
  assert.equal(first.refundStatus, 'refunded');

  const second = await createAdminPosRefundEntryDb({ orderId: order.id, requestId, adminNote: 'replay' });
  assert.equal(second.refundStatus, 'refunded');
  assert.equal(second.refundRequestId, first.refundRequestId, '重跑必須回同一筆退款 entry');

  const rows = await listAdminRefundRequestsDb();
  const matching = rows.filter((r) => r.orderId === order.id);
  assert.equal(matching.length, 1, '相同 requestId 不得建立第二筆退款 entry');
});

// 契約測試：Supabase 與 in-memory 兩路都必須尊重 allowAdminCancelled，
// createAdminPosRefundEntryDb 必須帶上此旗標 — 避免 fallback/Supabase 再度分歧。
test('contract: createAdminPosRefundEntryDb 帶 allowAdminCancelled 旗標', () => {
  const start = dbSrc.indexOf('export async function createAdminPosRefundEntryDb');
  assert.ok(start > -1, 'createAdminPosRefundEntryDb 必須存在');
  const end = dbSrc.indexOf('\nexport async function', start + 1);
  const body = dbSrc.slice(start, end > -1 ? end : start + 3000);
  assert.match(body, /allowAdminCancelled:\s*true/, 'createAdminPosRefundEntryDb 必須傳 allowAdminCancelled: true');
});

test('contract: db.mjs createRefundRequestDb 依 allowAdminCancelled 切換 blocked 狀態', () => {
  const start = dbSrc.indexOf('export async function createRefundRequestDb');
  const end = dbSrc.indexOf('\nexport async function', start + 1);
  const body = dbSrc.slice(start, end > -1 ? end : start + 4000);
  assert.match(body, /allowAdminCancelled/, 'Supabase 路徑必須讀 allowAdminCancelled');
});

test('contract: services.mjs createRefundRequest 依 allowAdminCancelled 切換 blocked 狀態', () => {
  const start = servicesSrc.indexOf('export function createRefundRequest');
  const end = servicesSrc.indexOf('\nexport function', start + 1);
  const body = servicesSrc.slice(start, end > -1 ? end : start + 4000);
  assert.match(body, /allowAdminCancelled/, 'in-memory 路徑必須讀 allowAdminCancelled');
});

// 契約測試：cancelOrderAdminDb 的 in-memory fallback 不得再呼叫不存在的 getOrders/setOrders。
test('contract: cancelOrderAdminDb fallback 不依賴不存在的 getOrders/setOrders', () => {
  const start = dbSrc.indexOf('export async function cancelOrderAdminDb');
  const end = dbSrc.indexOf('\nexport async function', start + 1);
  const body = dbSrc.slice(start, end > -1 ? end : start + 3000);
  assert.ok(!/getOrders\(|setOrders\(/.test(body), 'fallback 不得呼叫 getOrders()/setOrders()');
});
