// #1493 — 付款期限純函式單測。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PAYMENT_WINDOW_HOURS,
  PAYMENT_WINDOW_MS,
  computePaymentDeadline,
  initialPaymentDeadlineForBookingType,
  isPaymentExpired,
  describePaymentRemaining,
} from '../../src/lib/payment-deadline.mjs';

test('視窗為 24 小時', () => {
  assert.equal(PAYMENT_WINDOW_HOURS, 24);
  assert.equal(PAYMENT_WINDOW_MS, 24 * 60 * 60 * 1000);
});

test('computePaymentDeadline = 起算 + 24h', () => {
  assert.equal(computePaymentDeadline('2030-07-06T00:00:00.000Z'), '2030-07-07T00:00:00.000Z');
});

test('computePaymentDeadline 拒絕非法輸入', () => {
  assert.throws(() => computePaymentDeadline('not-a-date'));
});

test('initialPaymentDeadlineForBookingType: instant/scheduled 起算建立 + 24h', () => {
  const created = '2030-07-06T00:00:00.000Z';
  assert.equal(initialPaymentDeadlineForBookingType('instant', created), '2030-07-07T00:00:00.000Z');
  assert.equal(initialPaymentDeadlineForBookingType('scheduled', created), '2030-07-07T00:00:00.000Z');
  // 未知 booking_type fallback instant
  assert.equal(initialPaymentDeadlineForBookingType('weird', created), '2030-07-07T00:00:00.000Z');
});

test('initialPaymentDeadlineForBookingType: request 建立時為 null（待審核）', () => {
  assert.equal(initialPaymentDeadlineForBookingType('request', '2030-07-06T00:00:00.000Z'), null);
});

test('isPaymentExpired: null → 永不逾時', () => {
  assert.equal(isPaymentExpired(null, '2999-01-01T00:00:00Z'), false);
  assert.equal(isPaymentExpired(undefined, '2999-01-01T00:00:00Z'), false);
});

test('isPaymentExpired: now 達/超過截止 → true', () => {
  const deadline = '2030-07-07T00:00:00.000Z';
  assert.equal(isPaymentExpired(deadline, '2030-07-06T23:59:59.000Z'), false);
  assert.equal(isPaymentExpired(deadline, '2030-07-07T00:00:00.000Z'), true);
  assert.equal(isPaymentExpired(deadline, '2030-07-07T00:00:01.000Z'), true);
});

test('describePaymentRemaining: 計算剩餘時/分', () => {
  const deadline = '2030-07-07T00:00:00.000Z';
  const r = describePaymentRemaining(deadline, '2030-07-06T13:30:00.000Z');
  assert.equal(r.hasDeadline, true);
  assert.equal(r.isOverdue, false);
  assert.equal(r.hours, 10);
  assert.equal(r.minutes, 30);
});

test('describePaymentRemaining: 逾時 → isOverdue, clamp 0', () => {
  const deadline = '2030-07-07T00:00:00.000Z';
  const r = describePaymentRemaining(deadline, '2030-07-08T00:00:00.000Z');
  assert.equal(r.isOverdue, true);
  assert.equal(r.hours, 0);
  assert.equal(r.minutes, 0);
  assert.ok(r.remainingMs < 0);
});

test('describePaymentRemaining: 無截止時間', () => {
  const r = describePaymentRemaining(null, '2030-07-06T00:00:00.000Z');
  assert.equal(r.hasDeadline, false);
  assert.equal(r.isOverdue, false);
});
