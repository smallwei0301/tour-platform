import test from 'node:test';
import assert from 'node:assert/strict';

import { adminStatusToTelegramKind } from '../../src/lib/admin-order-event-kind.mjs';

test('adminStatusToTelegramKind: 付款狀態 → payment_received', () => {
  assert.equal(adminStatusToTelegramKind('paid'), 'payment_received');
});

test('adminStatusToTelegramKind: 各種取消狀態 → order_cancelled', () => {
  assert.equal(adminStatusToTelegramKind('cancelled_by_user'), 'order_cancelled');
  assert.equal(adminStatusToTelegramKind('cancelled_by_guide'), 'order_cancelled');
  assert.equal(adminStatusToTelegramKind('rejected'), 'order_cancelled');
});

test('adminStatusToTelegramKind: 退款狀態 → refund_requested / refund_executed', () => {
  assert.equal(adminStatusToTelegramKind('refund_pending'), 'refund_requested');
  assert.equal(adminStatusToTelegramKind('refunded'), 'refund_executed');
});

test('adminStatusToTelegramKind: 無對應事件的狀態 → null（不發通知，避免誤導）', () => {
  assert.equal(adminStatusToTelegramKind('pending_payment'), null);
  assert.equal(adminStatusToTelegramKind('confirmed'), null);
  assert.equal(adminStatusToTelegramKind('completed'), null);
});

test('adminStatusToTelegramKind: 空值 / 未知狀態 → null', () => {
  assert.equal(adminStatusToTelegramKind(''), null);
  assert.equal(adminStatusToTelegramKind(undefined), null);
  assert.equal(adminStatusToTelegramKind(null), null);
  assert.equal(adminStatusToTelegramKind('something_else'), null);
});
