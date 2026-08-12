/**
 * #1812：加購必須跟基本 booking/order 一起 materialize；這是公開建單協調器的
 * 可注入邊界測試，不檢查 private helper 或原始碼字串。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { materializeDraftBookingOrder } from '../../src/lib/checkout/booking-order-materialization.mjs';

const input = {
  activityId: 'activity-1812',
  planId: 'plan-1812',
  participants: 2,
  addonSelections: [{ addonId: 'addon-meal', quantity: 1, priceTwd: 1 }],
  totalAmount: 1,
};

const persisted = {
  bookingId: 'booking-1812',
  bookingNo: 'BK-1812',
  bookingStatus: 'draft',
  activityId: input.activityId,
  planId: input.planId,
  orderId: 'order-1812',
  orderStatus: 'pending_payment',
  totalTwd: 7_800,
  baseSubtotal: 7_400,
  addonSubtotal: 400,
  paymentDeadlineAt: null,
};

test('#1812 RED：加購選擇必須在原子 materialization 前傳入，不能交給 commit 後 extras seam', async () => {
  const events = [];
  let observedAtomicInput;

  const result = await materializeDraftBookingOrder(input, {
    createAtomic: async (atomicInput) => {
      events.push('atomic');
      observedAtomicInput = atomicInput;
      return { bookingId: persisted.bookingId, orderId: persisted.orderId };
    },
    readBack: async (readBackInput) => {
      events.push('read-back');
      assert.equal(readBackInput.requireTotalMatch, true);
      return persisted;
    },
    applyExtras: async (extrasInput) => {
      events.push('apply-extras');
      assert.equal(
        extrasInput.addonSelections,
        undefined,
        '加購不可在 commit 後由 fail-soft extras seam 寫入',
      );
      return { totalAmount: persisted.totalTwd, redeemed: 0 };
    },
    notify: async () => events.push('notify'),
  });

  assert.deepEqual(observedAtomicInput.addonSelections, input.addonSelections);
  assert.deepEqual(events, ['atomic', 'read-back', 'apply-extras', 'read-back', 'notify']);
  assert.equal(result.amount, 7_800, '對外金額只能來自 commit 後 read-back');
});

test('#1812 RED：加購驗證或快照寫入失敗時，不得進入 extras、通知或對外成功結果', async () => {
  const events = [];
  await assert.rejects(
    () => materializeDraftBookingOrder(input, {
      createAtomic: async () => {
        events.push('atomic');
        throw Object.assign(new Error('ADDON_UNAVAILABLE'), { code: 'ADDON_UNAVAILABLE' });
      },
      readBack: async () => events.push('read-back'),
      applyExtras: async () => events.push('apply-extras'),
      notify: async () => events.push('notify'),
    }),
    (error) => error?.code === 'ADDON_UNAVAILABLE',
  );
  assert.deepEqual(events, ['atomic']);
});
