import assert from 'node:assert/strict';
import test from 'node:test';

import { materializeDraftBookingOrder } from '../../src/lib/checkout/booking-order-materialization.mjs';
import { buildEcpayCheckoutParams } from '../../src/lib/ecpay-create-orchestration.mjs';

for (const scenario of [
  { name: 'basic', totalTwd: 7400 },
  { name: 'valid add-on', totalTwd: 7800 },
  { name: 'valid points redemption', totalTwd: 6900 },
]) {
  test(`#1815 ${scenario.name}: response, notification double and payment double use the committed total`, async () => {
    const notificationTotals = [];
    const result = await materializeDraftBookingOrder({
      activityId: 'activity-1815', planId: 'plan-1815', participants: 2,
    }, {
      createAtomic: async () => ({ bookingId: `booking-${scenario.name}`, orderId: `order-${scenario.name}` }),
      readBack: async () => ({
        bookingId: `booking-${scenario.name}`, bookingNo: 'BK-1815', bookingStatus: 'draft',
        activityId: 'activity-1815', planId: 'plan-1815', orderId: `order-${scenario.name}`,
        orderStatus: 'pending_payment', totalTwd: scenario.totalTwd,
      }),
      notify: async ({ totalTwd }) => { notificationTotals.push(totalTwd); },
    });

    const paymentDouble = buildEcpayCheckoutParams({
      merchantId: '2000132', merchantTradeNo: 'ISSUE1815TRADE', tradeDate: '2026/08/17 12:00:00',
      totalTwd: result.amount, title: 'Issue 1815', callbackUrl: 'https://example.test/callback',
      returnUrl: 'https://example.test/success', orderId: result.orderId, contactEmail: 'masked@example.test',
    });

    assert.equal(result.amount, scenario.totalTwd);
    assert.deepEqual(notificationTotals, [scenario.totalTwd]);
    assert.equal(Number(paymentDouble.TotalAmount), scenario.totalTwd);
  });
}
