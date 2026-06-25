/**
 * 三種預約模式 PR3 — 付款 callback 依 booking_type 自動確認 booking 的契約。
 *
 * - 共享決策：純函式 shouldAutoConfirmOnPayment（三種皆 true）已於
 *   booking-type-flow.test.mjs 實測；此處鎖定 RPC 與其一致。
 * - Supabase 分支：source-contract 鎖定 fn_process_payment_callback_atomic 的
 *   booking_type → 終態 mapping、confirmed_at、鎖序（orders→bookings）、replay 冪等
 *   與 log dedup（NOT_VERIFIED-live：未連真 DB，live 行為由 migration 契約 +
 *   production 觀察涵蓋，見 docs/04-tech/04-tech-architecture/12-payment-callback-atomicity.md）。
 * - in-memory callback（services.mjs）為 legacy order 模型，不含 V2 bookings 維度，
 *   因此此轉態無 in-memory 對應實作（V2 draft/checkout 不走 db.mjs in-memory）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { shouldAutoConfirmOnPayment } from '../../src/lib/booking-type-flow.mjs';

const RPC_SRC = readFileSync(
  path.resolve('../../supabase/migrations/20260624130000_callback_booking_type_auto_confirm.sql'),
  'utf8',
);

test('shared pure fn: 三種 booking_type 付款後皆 auto-confirm', () => {
  assert.equal(shouldAutoConfirmOnPayment('instant'), true);
  assert.equal(shouldAutoConfirmOnPayment('scheduled'), true);
  assert.equal(shouldAutoConfirmOnPayment('request'), true);
});

test('RPC: 讀 booking_type 並 map instant/scheduled/request → confirmed，其餘 → pending_confirmation', () => {
  assert.match(RPC_SRC, /SELECT ap\.booking_type INTO v_booking_type/);
  assert.match(RPC_SRC, /IF v_booking_type IN \('instant', 'scheduled', 'request'\) THEN/);
  // confirmed branch then fallback
  const confirmIdx = RPC_SRC.indexOf("v_target_status := 'confirmed'");
  const fallbackIdx = RPC_SRC.indexOf("v_target_status := 'pending_confirmation'");
  assert.ok(confirmIdx > 0 && fallbackIdx > confirmIdx, 'confirmed branch precedes pending fallback');
});

test('RPC: confirmed 時寫 confirmed_at（coalesce 保留既有值）', () => {
  assert.match(
    RPC_SRC,
    /confirmed_at = CASE WHEN v_target_status = 'confirmed' THEN coalesce\(confirmed_at, now\(\)\) ELSE confirmed_at END/,
  );
});

test('RPC: 鎖序 orders → bookings（payment-callback-atomicity）', () => {
  const orderLock = RPC_SRC.indexOf('FROM orders');
  const orderForUpdate = RPC_SRC.indexOf('FOR UPDATE');
  const bookingLock = RPC_SRC.indexOf('FROM bookings');
  assert.ok(orderLock > 0 && orderForUpdate > orderLock, 'orders locked first');
  assert.ok(bookingLock > orderForUpdate, 'bookings locked after orders');
});

test('RPC: booking_status_log to_status 用 v_target_status 且以 orderId 去重（idempotent）', () => {
  assert.match(RPC_SRC, /'draft',\s*v_target_status,/);
  assert.match(RPC_SRC, /bsl\.to_status = v_target_status/);
  assert.match(RPC_SRC, /coalesce\(bsl\.metadata->>'orderId', ''\) = v_order\.id::text/);
});

test('RPC: replay 冪等路徑維持（order 已 paid/confirmed/completed 直接回傳）', () => {
  assert.match(RPC_SRC, /IF v_order\.status IN \('paid', 'confirmed', 'completed'\) THEN/);
});

test('RPC: 仍走 fn_book_schedule 扣位且 order → paid', () => {
  assert.match(RPC_SRC, /fn_book_schedule\(v_order\.schedule_id, v_order\.people_count\)/);
  assert.match(RPC_SRC, /SET status = 'paid'/);
});
