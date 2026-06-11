/**
 * Issue #1411 — 站內訊息第一期：純邏輯（發言窗口、通知節流、序列化、body 驗證）
 * 定案（owner 2026-06-11）：窗口 = 付款後（paid/confirmed）～ completed 後 14 天；
 * 通知節流 = 同訂單同角色 15 分鐘內只通知第一則。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ORDER_MESSAGE_MAX_LENGTH,
  ORDER_MESSAGE_READONLY_DAYS,
  ORDER_MESSAGE_NOTIFY_THROTTLE_MINUTES,
  getOrderMessageWindow,
  shouldNotifyOrderMessage,
  serialiseOrderMessage,
  validateOrderMessageBody,
  orderMessageErrorToResponseParts,
} from '../../src/lib/order-messages.mjs';

const NOW = '2026-06-11T00:00:00.000Z';

test('定案參數鎖定：1000 字上限 / completed 後 14 天唯讀 / 15 分鐘通知節流', () => {
  assert.equal(ORDER_MESSAGE_MAX_LENGTH, 1000);
  assert.equal(ORDER_MESSAGE_READONLY_DAYS, 14);
  assert.equal(ORDER_MESSAGE_NOTIFY_THROTTLE_MINUTES, 15);
});

// ---------------------------------------------------------------------------
// getOrderMessageWindow — 發言窗口
// ---------------------------------------------------------------------------

test('paid / confirmed / reschedule_requested 訂單可發言可閱讀', () => {
  for (const status of ['paid', 'confirmed', 'reschedule_requested']) {
    const w = getOrderMessageWindow({ orderStatus: status, now: NOW });
    assert.equal(w.canView, true, status);
    assert.equal(w.canPost, true, status);
  }
});

test('completed 且距結束 14 天內可發言', () => {
  const w = getOrderMessageWindow({
    orderStatus: 'completed',
    scheduleEndAt: '2026-06-01T13:00:00.000Z', // 距 now 約 9.5 天
    now: NOW,
  });
  assert.equal(w.canView, true);
  assert.equal(w.canPost, true);
});

test('completed 超過 14 天轉唯讀（canView true / canPost false）', () => {
  const w = getOrderMessageWindow({
    orderStatus: 'completed',
    scheduleEndAt: '2026-05-20T13:00:00.000Z', // 距 now 約 21.5 天
    now: NOW,
  });
  assert.equal(w.canView, true);
  assert.equal(w.canPost, false);
  assert.equal(w.reason, 'MESSAGE_WINDOW_CLOSED');
});

test('completed 邊界：第 14 天整點仍可發言、超過一毫秒即唯讀', () => {
  const endAt = '2026-05-28T00:00:00.000Z'; // now - 14d 整
  const open = getOrderMessageWindow({ orderStatus: 'completed', scheduleEndAt: endAt, now: NOW });
  assert.equal(open.canPost, true);

  const closed = getOrderMessageWindow({
    orderStatus: 'completed',
    scheduleEndAt: '2026-05-27T23:59:59.999Z',
    now: NOW,
  });
  assert.equal(closed.canPost, false);
});

test('completed 以 completedAt 優先於 scheduleEndAt / scheduleStartAt', () => {
  const w = getOrderMessageWindow({
    orderStatus: 'completed',
    completedAt: '2026-06-05T00:00:00.000Z',      // 14 天內
    scheduleEndAt: '2026-01-01T00:00:00.000Z',    // 早就過期
    now: NOW,
  });
  assert.equal(w.canPost, true);
});

test('cancelled / refunded / refunding 唯讀（canView true / canPost false）', () => {
  for (const status of ['cancelled', 'refunded', 'refunding', 'refund_requested']) {
    const w = getOrderMessageWindow({ orderStatus: status, now: NOW });
    assert.equal(w.canView, true, status);
    assert.equal(w.canPost, false, status);
    assert.equal(w.reason, 'MESSAGE_WINDOW_CLOSED', status);
  }
});

test('pending_payment / 未知狀態：不可見也不可發言', () => {
  for (const status of ['pending_payment', 'expired', 'weird_status', '', undefined]) {
    const w = getOrderMessageWindow({ orderStatus: status, now: NOW });
    assert.equal(w.canView, false, String(status));
    assert.equal(w.canPost, false, String(status));
  }
});

// ---------------------------------------------------------------------------
// shouldNotifyOrderMessage — 通知節流
// ---------------------------------------------------------------------------

test('第一則留言一定通知', () => {
  assert.equal(
    shouldNotifyOrderMessage({ previousMessages: [], senderRole: 'traveler', now: NOW }),
    true
  );
});

test('同角色 15 分鐘內連發 → 第二則不通知', () => {
  const prev = [
    { senderRole: 'traveler', createdAt: '2026-06-10T23:50:00.000Z' }, // 10 分鐘前
  ];
  assert.equal(
    shouldNotifyOrderMessage({ previousMessages: prev, senderRole: 'traveler', now: NOW }),
    false
  );
});

test('同角色超過 15 分鐘 → 重新通知', () => {
  const prev = [
    { senderRole: 'traveler', createdAt: '2026-06-10T23:40:00.000Z' }, // 20 分鐘前
  ];
  assert.equal(
    shouldNotifyOrderMessage({ previousMessages: prev, senderRole: 'traveler', now: NOW }),
    true
  );
});

test('不同角色互不節流：guide 剛回覆不影響 traveler 通知', () => {
  const prev = [
    { senderRole: 'guide', createdAt: '2026-06-10T23:59:00.000Z' }, // 1 分鐘前
  ];
  assert.equal(
    shouldNotifyOrderMessage({ previousMessages: prev, senderRole: 'traveler', now: NOW }),
    true
  );
});

test('節流以同角色「最後一則」為準（snake_case row 也接受）', () => {
  const prev = [
    { sender_role: 'traveler', created_at: '2026-06-10T22:00:00.000Z' },
    { sender_role: 'traveler', created_at: '2026-06-10T23:55:00.000Z' }, // 5 分鐘前
  ];
  assert.equal(
    shouldNotifyOrderMessage({ previousMessages: prev, senderRole: 'traveler', now: NOW }),
    false
  );
});

// ---------------------------------------------------------------------------
// serialiseOrderMessage — Supabase row / in-memory 物件 → 統一 shape
// ---------------------------------------------------------------------------

test('serialise：snake_case 與 camelCase 輸入 → 相同輸出 shape', () => {
  const fromSupabase = serialiseOrderMessage({
    id: 'msg-1',
    order_id: 'ord-1',
    sender_role: 'guide',
    sender_id: 'andy-lee',
    body: '哈囉',
    created_at: '2026-06-10T10:00:00.000Z',
  });
  const fromMemory = serialiseOrderMessage({
    id: 'msg-1',
    orderId: 'ord-1',
    senderRole: 'guide',
    senderId: 'andy-lee',
    body: '哈囉',
    createdAt: '2026-06-10T10:00:00.000Z',
  });
  assert.deepEqual(fromSupabase, fromMemory);
  assert.deepEqual(Object.keys(fromSupabase).sort(), ['body', 'createdAt', 'id', 'orderId', 'senderId', 'senderRole']);
  assert.equal(fromSupabase.senderRole, 'guide');
});

// ---------------------------------------------------------------------------
// validateOrderMessageBody
// ---------------------------------------------------------------------------

test('body 驗證：trim 後非空且 ≤1000 字才合法', () => {
  assert.equal(validateOrderMessageBody('  你好 ').ok, true);
  assert.equal(validateOrderMessageBody('  你好 ').value, '你好');

  const empty = validateOrderMessageBody('   ');
  assert.equal(empty.ok, false);
  assert.equal(empty.code, 'BAD_REQUEST');

  assert.equal(validateOrderMessageBody('a'.repeat(1000)).ok, true);
  const tooLong = validateOrderMessageBody('a'.repeat(1001));
  assert.equal(tooLong.ok, false);
  assert.equal(tooLong.code, 'MESSAGE_TOO_LONG');

  assert.equal(validateOrderMessageBody(undefined).ok, false);
  assert.equal(validateOrderMessageBody(123).ok, false);
});

// ---------------------------------------------------------------------------
// orderMessageErrorToResponseParts
// ---------------------------------------------------------------------------

test('錯誤碼 → HTTP status 對應；未知錯誤 500 不外洩', () => {
  assert.deepEqual(
    orderMessageErrorToResponseParts(new Error('ORDER_NOT_FOUND: order not found')),
    { status: 404, code: 'ORDER_NOT_FOUND', message: 'order not found' }
  );
  assert.equal(orderMessageErrorToResponseParts(new Error('MESSAGE_WINDOW_CLOSED: closed')).status, 403);
  assert.equal(orderMessageErrorToResponseParts(new Error('FORBIDDEN: not yours')).status, 403);
  assert.equal(orderMessageErrorToResponseParts(new Error('MESSAGE_TOO_LONG: too long')).status, 400);
  assert.equal(orderMessageErrorToResponseParts(new Error('BAD_REQUEST: nope')).status, 400);

  const unknown = orderMessageErrorToResponseParts(new Error('supabase exploded with secrets'));
  assert.equal(unknown.status, 500);
  assert.equal(unknown.code, 'INTERNAL_ERROR');
  assert.ok(!unknown.message.includes('secrets'));
});
