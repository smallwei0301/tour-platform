import assert from 'node:assert/strict';
import test from 'node:test';

import { materializeDraftBookingOrder } from '../../src/lib/checkout/booking-order-materialization.mjs';
import {
  __resetBookingDraftIdempotencyReplayStoreForTest,
  __seedBookingDraftIdempotencyReplayForTest,
  createBookingDraftAtomicDb,
  findBookingDraftIdempotencyReplayDb,
} from '../../src/lib/checkout/db-booking-order-materialization.mjs';

const input = {
  travelerId: '18140000-0000-4000-8000-000000000001',
  planId: '18140000-0000-4000-8000-000000000002',
  activityId: '18140000-0000-4000-8000-000000000003',
  startAt: '2027-01-20T02:00:00.000Z',
  endAt: '2027-01-20T04:00:00.000Z',
  timezone: 'Asia/Taipei',
  participants: 2,
  sourceChannel: 'web',
  contactName: 'Issue 1814 Traveler',
  contactPhone: '0900001814',
  contactEmail: 'issue1814@example.invalid',
  correlationId: 'issue1814-correlation',
  paymentDeadlineAt: '2027-01-21T02:00:00.000Z',
  addonSelections: [{ addonId: '18140000-0000-4000-8000-000000000004', quantity: 1 }],
  redeemPoints: 300,
  idempotencyKey: 'issue1814-same-key',
  requestHash: 'a'.repeat(64),
  idempotencyActorType: 'traveler',
  idempotencyActorId: '18140000-0000-4000-8000-000000000001',
};

test('#1814 RED: completed replay reads the same persisted aggregate without another success notification', async () => {
  const events = [];
  const result = await materializeDraftBookingOrder(input, {
    createAtomic: async () => {
      events.push('atomic-replay');
      return { bookingId: 'booking-1814', orderId: 'order-1814', replayed: true };
    },
    readBack: async () => {
      events.push('read-back');
      return {
        bookingId: 'booking-1814', bookingNo: 'BK-1814', bookingStatus: 'draft',
        activityId: input.activityId, planId: input.planId,
        orderId: 'order-1814', orderStatus: 'pending_payment', totalTwd: 7100,
      };
    },
    notify: async () => { events.push('notify'); },
  });

  assert.deepEqual(events, ['atomic-replay', 'read-back']);
  assert.equal(result.replayed, true);
  assert.equal(result.orderId, 'order-1814');
});

test('#1814 RED: gateway sends idempotency identity to the one atomic checkout RPC', async () => {
  let rpcName;
  let rpcArgs;
  await createBookingDraftAtomicDb(input, {
    rpc: async (name, args) => {
      rpcName = name;
      rpcArgs = args;
      return { data: { booking_id: 'booking-1814', order_id: 'order-1814', replayed: false }, error: null };
    },
  });

  assert.equal(rpcName, 'fn_create_booking_draft_with_addons_points_idempotent');
  assert.deepEqual(
    {
      key: rpcArgs.p_idempotency_key,
      hash: rpcArgs.p_request_hash,
      actorType: rpcArgs.p_idempotency_actor_type,
      actorId: rpcArgs.p_idempotency_actor_id,
    },
    {
      key: input.idempotencyKey,
      hash: input.requestHash,
      actorType: input.idempotencyActorType,
      actorId: input.idempotencyActorId,
    },
  );
});

test('#1814 replay projection has equivalent injected-DB and in-memory fallback contracts', async () => {
  const clientFor = (row) => ({
    from: () => {
      const builder = {
        select: () => builder, eq: () => builder, maybeSingle: async () => ({ data: row, error: null }),
      };
      return builder;
    },
  });
  const replayInput = {
    idempotencyKey: input.idempotencyKey, requestHash: input.requestHash,
    actorType: input.idempotencyActorType, actorId: input.idempotencyActorId,
  };
  const completed = {
      actor_type: input.idempotencyActorType, actor_id: input.idempotencyActorId, request_hash: input.requestHash,
      state: 'completed', response_body: { booking_id: 'booking-1814', order_id: 'order-1814', booking_type: 'scheduled' },
  };
  const cases = [
    { row: null, assertResult: async (lookup) => assert.equal(await lookup(), null) },
    { row: { ...completed, actor_id: 'other' }, assertResult: async (lookup) => assert.rejects(lookup, (error) => error?.code === 'IDEMPOTENCY_CONFLICT') },
    { row: { ...completed, state: 'processing', response_body: null }, assertResult: async (lookup) => assert.rejects(lookup, (error) => error?.code === 'IDEMPOTENCY_IN_PROGRESS') },
    { row: completed, assertResult: async (lookup) => assert.deepEqual(await lookup(), { bookingId: 'booking-1814', orderId: 'order-1814', bookingType: 'scheduled', replayed: true }) },
  ];
  for (const { row, assertResult } of cases) {
    await assertResult(() => findBookingDraftIdempotencyReplayDb(replayInput, clientFor(row)));
    __resetBookingDraftIdempotencyReplayStoreForTest();
    if (row) __seedBookingDraftIdempotencyReplayForTest(replayInput, row);
    await assertResult(() => findBookingDraftIdempotencyReplayDb(replayInput));
  }
  __resetBookingDraftIdempotencyReplayStoreForTest();
});
