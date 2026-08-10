import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BOOKING_DRAFT_RPC_MISSING_CODE,
  createBookingDraftAtomicDb,
  readBackBookingOrderMaterializationDb,
} from '../../src/lib/checkout/db-booking-order-materialization.mjs';

const bookingId = '18110000-0000-4000-8000-000000000011';
const orderId = '18110000-0000-4000-8000-000000000012';

function validReadBack(totalTwd = 7400) {
  return {
    id: orderId,
    booking_id: bookingId,
    activity_id: 'activity-id',
    status: 'pending_payment',
    payment_status: 'pending',
    total_twd: totalTwd,
    payment_deadline_at: '2027-01-16T02:00:00.000Z',
    booking: {
      id: bookingId,
      booking_no: 'BK-1811',
      status: 'draft',
      order_id: orderId,
      activity_id: 'activity-id',
      activity_plan_id: 'plan-id',
    },
    items: [{
      id: 'item-id',
      order_id: orderId,
      booking_id: bookingId,
      item_type: 'activity_booking',
      ref_id: bookingId,
      quantity: 2,
      unit_price: 3700,
      subtotal_amount: 7400,
    }],
  };
}

test('#1811 atomic gateway never sends a client total and maps missing RPC fail-closed', async () => {
  let observedName;
  let observedArgs;
  const client = {
    rpc: async (name, args) => {
      observedName = name;
      observedArgs = args;
      return { data: { booking_id: bookingId, order_id: orderId }, error: null };
    },
  };

  const created = await createBookingDraftAtomicDb({
    travelerId: null,
    planId: 'plan-id',
    startAt: '2027-01-15T02:00:00.000Z',
    endAt: '2027-01-15T04:00:00.000Z',
    timezone: 'Asia/Taipei',
    participants: 2,
    sourceChannel: 'web',
    contactName: 'Traveler',
    contactPhone: '0900000000',
    contactEmail: 'traveler@example.invalid',
    customerNote: null,
    conflictOverrideId: null,
    conflictOverrideSnapshot: null,
    correlationId: 'issue1811-unit',
    paymentDeadlineAt: '2027-01-16T02:00:00.000Z',
    totalAmount: 1,
    totalTwd: 2,
  }, client);

  assert.equal(observedName, 'fn_create_booking_draft_atomic');
  assert.deepEqual(created, { bookingId, orderId });
  assert.equal(
    Object.keys(observedArgs).some((key) => /total|amount/iu.test(key)),
    false,
    'RPC parameters must not contain request-side pricing',
  );

  await assert.rejects(
    () => createBookingDraftAtomicDb({ planId: 'plan-id' }, {
      rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'function missing' } }),
    }),
    (error) => error?.code === BOOKING_DRAFT_RPC_MISSING_CODE,
  );
});

test('#1811 commit-after read-back reconciles reciprocal IDs and base item math', async () => {
  let selected;
  const clientFor = (row) => ({
    from: (table) => {
      assert.equal(table, 'orders');
      const builder = {
        select: (value) => { selected = value; return builder; },
        eq: (column, value) => {
          assert.deepEqual([column, value], ['id', orderId]);
          return builder;
        },
        single: async () => ({ data: row, error: null }),
      };
      return builder;
    },
  });

  const persisted = await readBackBookingOrderMaterializationDb(
    {
      bookingId,
      orderId,
      expectedActivityId: 'activity-id',
      expectedPlanId: 'plan-id',
      requireTotalMatch: true,
    },
    clientFor(validReadBack()),
  );
  assert.match(selected, /bookings!orders_booking_id_fkey/);
  assert.match(selected, /order_items!order_items_order_id_fkey/);
  assert.deepEqual(persisted, {
    bookingId,
    bookingNo: 'BK-1811',
    bookingStatus: 'draft',
    activityId: 'activity-id',
    planId: 'plan-id',
    orderId,
    orderStatus: 'pending_payment',
    totalTwd: 7400,
    baseSubtotal: 7400,
    paymentDeadlineAt: '2027-01-16T02:00:00.000Z',
  });

  await assert.rejects(
    () => readBackBookingOrderMaterializationDb(
      { bookingId, orderId, requireTotalMatch: true },
      clientFor(validReadBack(7401)),
    ),
    /does not reconcile to persisted order total/,
  );

  await assert.rejects(
    () => readBackBookingOrderMaterializationDb(
      {
        bookingId,
        orderId,
        expectedActivityId: 'different-activity',
        expectedPlanId: 'plan-id',
      },
      clientFor(validReadBack()),
    ),
    /requested aggregate read-back mismatch/,
  );

  await assert.rejects(
    () => readBackBookingOrderMaterializationDb(
      { bookingId, orderId },
      clientFor({ ...validReadBack(), payment_status: 'paid' }),
    ),
    /status read-back mismatch/,
  );
});
