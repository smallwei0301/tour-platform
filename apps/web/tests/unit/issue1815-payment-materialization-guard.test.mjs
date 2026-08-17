import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isMaterializedOrderReadyForPayment } from '../../src/lib/ecpay-create-orchestration.mjs';
import { getMaterializedOrderDetailForPayment } from '../../src/lib/payment/db-payment-detail.mjs';

const valid = {
  id: 'order-1815',
  bookingId: 'booking-1815',
  status: 'pending_payment',
  paymentStatus: 'pending',
  totalTwd: 1200,
  booking: { id: 'booking-1815', order_id: 'order-1815', status: 'draft' },
  items: [{ order_id: 'order-1815', booking_id: 'booking-1815', item_type: 'activity_booking', subtotal_amount: 1200 }],
};

test('RED: payment accepts only a committed booking/order/item total', () => {
  assert.equal(isMaterializedOrderReadyForPayment(valid), true);
  assert.equal(isMaterializedOrderReadyForPayment({
    ...valid,
    totalTwd: 1100,
    items: [
      valid.items[0],
      { order_id: 'order-1815', booking_id: null, item_type: 'fee', subtotal_amount: 400, metadata: { kind: 'addon' } },
      { order_id: 'order-1815', booking_id: null, item_type: 'discount', subtotal_amount: -500, metadata: { kind: 'points_redemption' } },
    ],
  }), true);
  assert.equal(isMaterializedOrderReadyForPayment({ ...valid, items: [] }), false);
  assert.equal(isMaterializedOrderReadyForPayment({ ...valid, totalTwd: 1199 }), false);
  assert.equal(isMaterializedOrderReadyForPayment({ ...valid, booking: { ...valid.booking, order_id: 'other' } }), false);
  assert.equal(isMaterializedOrderReadyForPayment({ ...valid, paymentStatus: 'paid' }), false);
  assert.equal(isMaterializedOrderReadyForPayment({ ...valid, items: [...valid.items, valid.items[0]] }), false);
  assert.equal(isMaterializedOrderReadyForPayment({ ...valid, items: [{ ...valid.items[0], item_type: 'other' }] }), false);
  assert.equal(isMaterializedOrderReadyForPayment({ ...valid, items: [{ ...valid.items[0], order_id: 'other' }] }), false);
  assert.equal(isMaterializedOrderReadyForPayment({ ...valid, items: [{ ...valid.items[0], booking_id: null }] }), false);
});

test('in-memory fallback has no V2 materialized aggregate and therefore cannot open payment', async () => {
  const savedUrl = process.env.SUPABASE_URL;
  const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    assert.equal(await getMaterializedOrderDetailForPayment('order-1815'), null);
  } finally {
    if (savedUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = savedUrl;
    if (savedKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
  }
});
