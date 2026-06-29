// #1493 — 付款期限寫入契約：
//  - draft route 以 booking_type 決定 payment_deadline_at（source-contract）
//  - approval gateway 於 approve 時起算 24h（in-memory 實測 + Supabase source-contract）
//  - listMyOrdersDb / listAdminOrdersDb 序列化 paymentDeadlineAt

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  decideBookingApprovalDb,
  __seedV2BookingForTest,
  __resetV2BookingStoreForTest,
} from '../../src/lib/db.mjs';
import { computePaymentDeadline } from '../../src/lib/payment-deadline.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = join(__dirname, '../..');
const read = (rel) => readFileSync(join(APP, rel), 'utf8');

test('draft route 以 initialPaymentDeadlineForBookingType 寫 payment_deadline_at', () => {
  const src = read('app/api/v2/bookings/draft/route.ts');
  // 起算值由 initialPaymentDeadlineForBookingType 算出後寫入 order（#1493 之三 refactor 為具名變數）。
  assert.match(src, /const paymentDeadlineAt = initialPaymentDeadlineForBookingType/);
  assert.match(src, /payment_deadline_at:\s*paymentDeadlineAt/);
});

test('listMyOrdersDb / listAdminOrdersDb 序列化 paymentDeadlineAt 且 select 帶欄位', () => {
  const src = read('src/lib/db.mjs');
  assert.match(src, /payment_deadline_at,\s*user_id/); // listMyOrders select
  assert.match(src, /paymentDeadlineAt:\s*r\.payment_deadline_at/);
});

test('approval gateway（Supabase 路徑）approve 時 update orders.payment_deadline_at', () => {
  const src = read('src/lib/db.mjs');
  assert.match(src, /decision\.nextGuideApprovalStatus === 'approved' && booking\.order_id/);
  assert.match(src, /payment_deadline_at: paymentDeadlineAt/);
  // 仍只動仍為 pending_payment 的 order（避免覆蓋已付款）。
  assert.match(src, /\.eq\('status', 'pending_payment'\)/);
});

test('in-memory approve 回傳 paymentDeadlineAt = 審核時 + 24h', async () => {
  __resetV2BookingStoreForTest();
  __seedV2BookingForTest({
    id: 'bk_req_1',
    guide_id: 'guide-1',
    order_id: 'ord_1',
    status: 'draft',
    guide_approval_status: 'pending',
    booking_type: 'request',
  });

  const res = await decideBookingApprovalDb({ bookingId: 'bk_req_1', guideId: 'guide-1', action: 'approve' });
  assert.equal(res.status, 'draft');
  assert.equal(res.guideApprovalStatus, 'approved');
  assert.ok(res.paymentDeadlineAt, 'approve 後回傳付款截止時間');
  // 起算點為審核時間，截止 = 審核 + 24h（允許 ±2s 誤差）。
  const expected = computePaymentDeadline(new Date(Date.now()).toISOString());
  const drift = Math.abs(new Date(res.paymentDeadlineAt).getTime() - new Date(expected).getTime());
  assert.ok(drift < 2000, `deadline drift ${drift}ms`);

  __resetV2BookingStoreForTest();
});

test('in-memory reject 不起算付款期限', async () => {
  __resetV2BookingStoreForTest();
  __seedV2BookingForTest({
    id: 'bk_req_2',
    guide_id: 'guide-1',
    order_id: 'ord_2',
    status: 'draft',
    guide_approval_status: 'pending',
    booking_type: 'request',
  });

  const res = await decideBookingApprovalDb({ bookingId: 'bk_req_2', guideId: 'guide-1', action: 'reject' });
  assert.equal(res.status, 'cancelled');
  assert.equal(res.guideApprovalStatus, 'rejected');
  assert.equal(res.paymentDeadlineAt, null);

  __resetV2BookingStoreForTest();
});
