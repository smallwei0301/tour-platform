import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  createBookingDraftAtomicDb,
  isPointsInputError,
  readBackBookingOrderMaterializationDb,
} from '../../src/lib/checkout/db-booking-order-materialization.mjs';

const bookingId = '18130000-0000-4000-8000-000000000011';
const orderId = '18130000-0000-4000-8000-000000000012';
const travelerId = '18130000-0000-4000-8000-000000000013';
const repoRoot = resolve(import.meta.dirname, '../../../..');

function redeemedReadBack() {
  return {
    id: orderId,
    booking_id: bookingId,
    activity_id: 'activity-id',
    status: 'pending_payment',
    payment_status: 'pending',
    total_twd: 6900,
    discount_amount: 500,
    payment_deadline_at: '2027-01-19T02:00:00.000Z',
    booking: {
      id: bookingId,
      booking_no: 'BK-1813',
      status: 'draft',
      order_id: orderId,
      activity_id: 'activity-id',
      activity_plan_id: 'plan-id',
    },
    items: [
      {
        order_id: orderId,
        booking_id: bookingId,
        item_type: 'activity_booking',
        ref_id: bookingId,
        quantity: 2,
        unit_price: 3700,
        subtotal_amount: 7400,
      },
      {
        order_id: orderId,
        booking_id: null,
        item_type: 'discount',
        ref_id: orderId,
        quantity: 1,
        unit_price: -500,
        subtotal_amount: -500,
        metadata: { kind: 'points_redemption', requestedPoints: 500, redeemedPoints: 500 },
      },
    ],
    addons: [],
    point_ledger: [{ user_id: travelerId, order_id: orderId, delta: -500, reason: 'redeem_order', expires_at: null }],
  };
}

test('#1813 gateway forwards only a requested point count, never a client total', async () => {
  let observedName;
  let observedArgs;
  await createBookingDraftAtomicDb({
    travelerId,
    planId: 'plan-id',
    startAt: '2027-01-18T02:00:00.000Z',
    endAt: '2027-01-18T04:00:00.000Z',
    timezone: 'Asia/Taipei',
    participants: 2,
    sourceChannel: 'web',
    contactName: 'Traveler',
    contactPhone: '0900000000',
    contactEmail: 'traveler@example.invalid',
    correlationId: 'issue1813-unit',
    paymentDeadlineAt: '2027-01-19T02:00:00.000Z',
    addonSelections: [],
    redeemPoints: 500,
    totalAmount: 1,
    totalTwd: 2,
    amount: 3,
  }, {
    rpc: async (name, args) => {
      observedName = name;
      observedArgs = args;
      return { data: { booking_id: bookingId, order_id: orderId }, error: null };
    },
  });

  assert.equal(observedName, 'fn_create_booking_draft_with_addons_points_idempotent');
  assert.equal(observedArgs.p_redeem_points, 500);
  assert.equal(Object.keys(observedArgs).some((key) => /total|amount/i.test(key)), false);
});

test('#1813 read-back requires the persisted points ledger, discount item and payable total to reconcile', async () => {
  const clientFor = (row) => ({
    from: () => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        single: async () => ({ data: row, error: null }),
      };
      return builder;
    },
  });
  const persisted = await readBackBookingOrderMaterializationDb({ bookingId, orderId }, clientFor(redeemedReadBack()));
  assert.equal(persisted.totalTwd, 6900);
  assert.equal(persisted.pointsRedeemed, 500);

  const missingLedger = redeemedReadBack();
  missingLedger.point_ledger = [];
  await assert.rejects(
    () => readBackBookingOrderMaterializationDb({ bookingId, orderId }, clientFor(missingLedger)),
    /points redemption must contain exactly one ledger and discount item/,
  );
});

test('#1813 maps unavailable points to a public input error and rollback companion is owner-gated', () => {
  assert.equal(isPointsInputError(Object.assign(new Error('POINTS_UNAVAILABLE'), { code: 'POINTS_UNAVAILABLE' })), true);
  const rollback = readFileSync(
    resolve(repoRoot, 'supabase/migrations/20260812160000_issue1813_points_atomic_materialization.rollback.sql'),
    'utf8',
  );
  assert.match(rollback, /midao\.rollback_owner_authorized/u);
  assert.match(rollback, /MIDAO_ROLLBACK_OWNER_AUTHORIZATION_REQUIRED/u);
  assert.match(rollback, /REVOKE ALL ON FUNCTION public\.fn_create_booking_draft_with_addons_and_points_atomic/u);
  assert.match(rollback, /DROP FUNCTION IF EXISTS public\.fn_create_booking_draft_with_addons_and_points_atomic/u);
  assert.doesNotMatch(rollback, /\b(?:DELETE\s+FROM|TRUNCATE|DROP\s+TABLE|INSERT\s+INTO|UPDATE\s+\S+\s+SET)\b/iu);
});
