/**
 * #1811：建單協調器只能在 commit 後讀回成功後發布持久化結果。
 *
 * 公開 seam：materializeDraftBookingOrder(input, deps)。四個 deps 都是資料庫或
 * 外部通知邊界；測試只觀察回傳、拒絕與可見副作用，不檢查實作原始碼。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { materializeDraftBookingOrder } from '../../src/lib/checkout/booking-order-materialization.mjs';

test('#1811/#1813 建單只發布 atomic commit 後的持久化快照，原子建立或讀回失敗時 fail closed', async () => {
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
  const persisted = {
    bookingId: atomicResult.bookingId,
    bookingNo: 'BK-BASE',
    bookingStatus: 'draft',
    activityId: input.activityId,
    planId: input.planId,
    orderId: atomicResult.orderId,
    orderStatus: 'pending_payment',
    totalTwd: 7_400,
  };
  const events = [];
  const result = await materializeDraftBookingOrder(input, {
    createAtomic: async () => {
      events.push('atomic');
      return atomicResult;
    },
    readBack: async (readBackInput) => {
      events.push('read-back');
      assert.deepEqual(readBackInput, {
        bookingId: atomicResult.bookingId,
        orderId: atomicResult.orderId,
        expectedActivityId: input.activityId,
        expectedPlanId: input.planId,
        requireTotalMatch: true,
      });
      return persisted;
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
          bookingId: persisted.bookingId,
          orderId: persisted.orderId,
          totalTwd: persisted.totalTwd,
        },
        '成功通知只能引用最後持久化快照',
      );
    },
  });

  assert.deepEqual(events, [
    'atomic',
    'read-back',
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
      bookingId: persisted.bookingId,
      bookingNo: persisted.bookingNo,
      bookingStatus: persisted.bookingStatus,
      orderId: persisted.orderId,
      orderStatus: persisted.orderStatus,
      amount: persisted.totalTwd,
    },
    '成功回應不能引用 request、RPC、第一次讀回或 applyExtras 的暫存值',
  );

  async function assertFailsClosed({ failAtomic = false, failReadBackAt = 0 }) {
    let notifyCount = 0;

    await assert.rejects(() => materializeDraftBookingOrder(input, {
      createAtomic: async () => {
        if (failAtomic) throw new Error('atomic failed');
        return atomicResult;
      },
      readBack: async () => {
        if (failReadBackAt === 1) throw new Error('read-back failed');
        return persisted;
      },
      notify: async () => {
        notifyCount += 1;
      },
    }));

    assert.equal(notifyCount, 0, '失敗流程不得發出成功通知');
    if (failAtomic) {
      return;
    }
  }

  await assertFailsClosed({ failAtomic: true });
  await assertFailsClosed({ failReadBackAt: 1 });
});
