/**
 * #1811：建單協調器只能在 commit 後讀回成功後發布持久化結果。
 *
 * 公開 seam：materializeDraftBookingOrder(input, deps)。四個 deps 都是資料庫或
 * 外部通知邊界；測試只觀察回傳、拒絕與可見副作用，不檢查實作原始碼。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { materializeDraftBookingOrder } from '../../src/lib/checkout/booking-order-materialization.mjs';

test('#1811 建單只發布最後持久化快照，原子建立或任一讀回失敗時 fail closed', async () => {
  const input = {
    activityId: 'activity-from-request',
    planId: 'plan-from-request',
    participants: 2,
    totalAmount: 1,
    addonSelections: [{ addonId: 'meal', quantity: 1 }],
  };
  const atomicResult = {
    bookingId: 'booking-from-rpc',
    orderId: 'order-from-rpc',
    totalTwd: 7_100,
  };
  const persistedBase = {
    bookingId: atomicResult.bookingId,
    bookingNo: 'BK-BASE',
    bookingStatus: 'draft',
    activityId: input.activityId,
    planId: input.planId,
    orderId: atomicResult.orderId,
    orderStatus: 'pending_payment',
    totalTwd: 7_400,
  };
  const persistedFinal = {
    bookingId: atomicResult.bookingId,
    bookingNo: 'BK-FINAL',
    bookingStatus: 'draft',
    activityId: input.activityId,
    planId: input.planId,
    orderId: atomicResult.orderId,
    orderStatus: 'pending_payment',
    totalTwd: 8_125,
  };

  const events = [];
  let readBackCount = 0;
  const result = await materializeDraftBookingOrder(input, {
    createAtomic: async () => {
      events.push('atomic');
      return atomicResult;
    },
    readBack: async (readBackInput) => {
      readBackCount += 1;
      events.push(readBackCount === 1 ? 'read-back-base' : 'read-back-final');
      assert.deepEqual(readBackInput, {
        bookingId: atomicResult.bookingId,
        orderId: atomicResult.orderId,
        expectedActivityId: input.activityId,
        expectedPlanId: input.planId,
        requireTotalMatch: true,
      });
      return readBackCount === 1 ? persistedBase : persistedFinal;
    },
    applyExtras: async (extrasInput) => {
      events.push('apply-extras');
      assert.equal(
        extrasInput.totalAmount,
        persistedBase.totalTwd,
        '點數 seam 只能以第一次 commit-after read-back 的持久化金額為起點',
      );
      assert.equal(extrasInput.addonSelections, undefined, '加購不得交給 commit 後 extras seam');
      return { totalAmount: persistedBase.totalTwd, addonTotal: 0, redeemed: 0 };
    },
    notify: async (notification) => {
      events.push('notify');
      assert.deepEqual(
        {
          bookingId: notification.bookingId,
          orderId: notification.orderId,
          totalTwd: notification.totalTwd,
        },
        {
          bookingId: persistedFinal.bookingId,
          orderId: persistedFinal.orderId,
          totalTwd: persistedFinal.totalTwd,
        },
        '成功通知只能引用最後持久化快照',
      );
    },
  });

  assert.deepEqual(events, [
    'atomic',
    'read-back-base',
    'apply-extras',
    'read-back-final',
    'notify',
  ]);
  assert.deepEqual(
    {
      bookingId: result.bookingId,
      bookingNo: result.bookingNo,
      bookingStatus: result.bookingStatus,
      orderId: result.orderId,
      orderStatus: result.orderStatus,
      amount: result.amount,
    },
    {
      bookingId: persistedFinal.bookingId,
      bookingNo: persistedFinal.bookingNo,
      bookingStatus: persistedFinal.bookingStatus,
      orderId: persistedFinal.orderId,
      orderStatus: persistedFinal.orderStatus,
      amount: persistedFinal.totalTwd,
    },
    '成功回應不能引用 request、RPC、第一次讀回或 applyExtras 的暫存值',
  );

  async function assertFailsClosed({ failAtomic = false, failReadBackAt = 0 }) {
    let failedReadBackCount = 0;
    let applyExtrasCount = 0;
    let notifyCount = 0;

    await assert.rejects(() => materializeDraftBookingOrder(input, {
      createAtomic: async () => {
        if (failAtomic) throw new Error('atomic failed');
        return atomicResult;
      },
      readBack: async () => {
        failedReadBackCount += 1;
        if (failedReadBackCount === failReadBackAt) throw new Error('read-back failed');
        return failedReadBackCount === 1 ? persistedBase : persistedFinal;
      },
      applyExtras: async () => {
        applyExtrasCount += 1;
        return { totalAmount: 99_999 };
      },
      notify: async () => {
        notifyCount += 1;
      },
    }));

    assert.equal(notifyCount, 0, '失敗流程不得發出成功通知');
    if (failAtomic) {
      assert.equal(failedReadBackCount, 0, '原子建立失敗後不得讀回');
      assert.equal(applyExtrasCount, 0, '原子建立失敗後不得處理加購');
    }
    if (failReadBackAt === 1) {
      assert.equal(applyExtrasCount, 0, '第一次 commit-after read-back 失敗後不得處理加購');
    }
    if (failReadBackAt === 2) {
      assert.equal(applyExtrasCount, 1, '第二次讀回失敗前已完成一次加購處理');
    }
  }

  await assertFailsClosed({ failAtomic: true });
  await assertFailsClosed({ failReadBackAt: 1 });
  await assertFailsClosed({ failReadBackAt: 2 });

  const baseOnlyReadBackModes = [];
  let baseOnlyReadCount = 0;
  await materializeDraftBookingOrder({ ...input, addonSelections: [], redeemPoints: 0 }, {
    createAtomic: async () => atomicResult,
    readBack: async ({ requireTotalMatch }) => {
      baseOnlyReadBackModes.push(requireTotalMatch);
      baseOnlyReadCount += 1;
      return baseOnlyReadCount === 1 ? persistedBase : { ...persistedBase, bookingNo: 'BK-BASE-FINAL' };
    },
    applyExtras: async () => ({ totalAmount: persistedBase.totalTwd, addonTotal: 0, redeemed: 0 }),
    notify: async () => {},
  });
  assert.deepEqual(baseOnlyReadBackModes, [true, true]);
});
