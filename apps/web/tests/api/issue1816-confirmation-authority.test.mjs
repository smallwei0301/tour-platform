import assert from 'node:assert/strict';
import test, { beforeEach, afterEach } from 'node:test';
import { __internal as domain, acceptMidaoTravelerConfirmationDb as accept,
  getMidaoTravelerConfirmationPreviewDb as preview } from '../../src/lib/midao/db-midao-traveler-confirmation.mjs';
import { __internal as conversion, __resetMidaoBookingConfirmationStoreForTest as reset,
  __seedMidaoInquiryConversionFixtureForTest as seed,
  __setMidaoBookingConfirmationClockForTest as clock,
  __setMidaoConfirmationTokenFactoryForTest as tokenFactory,
  convertMidaoInquiryToBookingDb as convert } from '../../src/lib/midao/db-midao-booking-confirmations.mjs';
import { G, P, A, T, OTHER, NOW, EXPIRY, RAW, HASH, input, acceptInput,
  command, cleanup, memoryScenario, fakeScenario, observed } from './fixtures/issue1816-confirmation-scenarios.mjs';

let savedFetch;
beforeEach(() => { savedFetch = globalThis.fetch; globalThis.fetch = async () => { throw new Error('Unexpected network'); }; });
afterEach(() => { cleanup(); globalThis.fetch = savedFetch; });

function accepted(ids, replayed = false) {
  return { accepted: true, replayed, bookingId: ids.bookingId, orderId: ids.orderId,
    bookingStatus: 'draft', travelerConfirmationStatus: 'confirmed', paymentDeadlineAt: '2026-08-08T00:00:00.000Z' };
}
function rpcSuccess(ids) {
  return { data: { accepted: true, replayed: false, booking_id: ids.bookingId, order_id: ids.orderId,
    booking_status: 'draft', traveler_confirmation_status: 'confirmed', payment_deadline_at: '2026-08-08T00:00:00.000Z' }, error: null };
}

test('two previews do not consume token or create accept claim; output/inspect are detached', async () => {
  const ids = await memoryScenario();
  const first = await preview(input);
  first.price.quotedTotalTwd = 1; first.service.title = 'mutated';
  const inspected = conversion.inspectStoresForTest();
  inspected.orders[0].totalTwd = 1;
  inspected.idempotency[0].responseBody.orderId = OTHER;
  const second = await preview(input);
  assert.equal(second.price.quotedTotalTwd, 8000); assert.equal(second.service.title, 'Activity');
  assert.equal(conversion.inspectStoresForTest().idempotency.length, 1);
  assert.deepEqual(await accept(acceptInput), accepted(ids));
  assert.deepEqual(await accept(acceptInput), accepted(ids, true));
});

test('accept seed owns completed response snapshot; replay precedes ownership and expiry', async () => {
  const ids = await memoryScenario();
  const snapshot = accepted(ids);
  domain.seedAcceptIdempotencyForTest({ ...ids, ...acceptInput, state: 'completed', responseBody: snapshot });
  snapshot.orderId = OTHER;
  clock(EXPIRY);
  assert.deepEqual(await accept({ ...acceptInput, travelerUserId: OTHER }), accepted(ids, true));
});

test('reset clears lifecycle and replay while preserving clock and token providers', async () => {
  await memoryScenario();
  reset();
  assert.equal((await observed(() => preview(input))).error.code, 'NOT_FOUND');
  assert.equal((await observed(() => accept(acceptInput))).error.code, 'NOT_FOUND');
  await assert.rejects(() => convert(command), { code: 'NOT_FOUND' });
  // Provider retention is observed through a fresh legitimate conversion.
  seed({ inquiry: { id: command.inquiryId, guideId: G, activityId: A, status: 'replied', travelerUserId: T },
    plan: { id: P, activityId: A, guideId: G, bookingType: 'request', status: 'active', minParticipants: 1, maxParticipants: 4 } });
  const result = await convert(command);
  assert.equal(result.confirmationToken, RAW);
  assert.equal(result.travelerConfirmationExpiresAt, EXPIRY);
});

test('fixture input and returned snapshot are detached', async () => {
  await memoryScenario(); reset();
  const fixture = { inquiry: { id: command.inquiryId, guideId: G, activityId: A, status: 'replied', travelerUserId: T },
    plan: { id: P, activityId: A, guideId: G, bookingType: 'request', status: 'active', minParticipants: 1, maxParticipants: 4 } };
  const returned = seed(fixture);
  fixture.inquiry.status = 'cancelled'; returned.plan.maxParticipants = 1;
  assert.equal((await convert(command)).created, true);
});

test('preview pending then clock crosses expiry; accept rejects without consuming', async () => {
  await memoryScenario(); assert.equal((await preview(input)).status, 'pending'); clock(EXPIRY);
  await assert.rejects(() => accept(acceptInput), { code: 'CONFIRMATION_TOKEN_EXPIRED', status: 410 });
  assert.equal(conversion.inspectStoresForTest().confirmationTokens[0].consumedAt, null);
});

test('capacity changes after prediction; failed accept leaves no claim and same key can succeed', async () => {
  const ids = await memoryScenario(); assert.equal((await preview(input)).status, 'pending');
  domain.seedActiveBookingForTest({ bookingId: OTHER, activityId: A, activityPlanId: P,
    localDate: '2026-09-01', participants: 3 });
  await assert.rejects(() => accept(acceptInput), { code: 'CAPACITY_EXCEEDED', status: 409 });
  assert.equal(conversion.inspectStoresForTest().confirmationTokens[0].consumedAt, null);
  assert.equal(conversion.inspectStoresForTest().idempotency.length, 1);
  domain.clearCapacityBookingsForTest(); assert.deepEqual(await accept(acceptInput), accepted(ids));
});

for (const rpcCode of ['CONFIRMATION_TOKEN_EXPIRED', 'CAPACITY_EXCEEDED']) {
  test(`RPC overrides pending prediction: ${rpcCode}`, async () => {
    const ids = await memoryScenario();
    const fake = fakeScenario(ids, {}, { rpcResponse: { data: null, error: { message: rpcCode } } });
    assert.equal((await preview(input)).status, 'pending');
    const reads = fake.calls.length;
    await assert.rejects(() => accept(acceptInput), { code: rpcCode });
    assert.equal(fake.calls.length, reads); assert.equal(fake.rpcCalls.length, 1); assert.deepEqual(fake.writes, []);
    assert.equal(fake.rpcCalls[0].name, 'midao_accept_traveler_confirmation');
    assert.equal(Object.values(fake.rpcCalls[0].args).includes(RAW), false);
  });
}

test('RPC success remains authoritative after expired prediction; no local read before RPC', async () => {
  const ids = await memoryScenario();
  const fake = fakeScenario(ids, { bookingExpiresAt: NOW }, { rpcResponse: rpcSuccess(ids) });
  assert.equal((await preview(input)).status, 'expired');
  const reads = fake.calls.length;
  assert.deepEqual(await accept(acceptInput), accepted(ids));
  assert.equal(fake.calls.length, reads); assert.equal(fake.rpcCalls.length, 1); assert.deepEqual(fake.writes, []);
});

for (const table of ['booking_confirmation_tokens', 'bookings', 'orders', 'booking_pricing_snapshots', 'activities', 'activity_plans']) {
  for (const kind of ['errorTable', 'rejectTable']) {
    test(`Supabase ${table} ${kind} returns safe backend error`, async () => {
      const ids = await memoryScenario(); const fake = fakeScenario(ids, {}, { [kind]: table });
      assert.deepEqual(await observed(() => preview(input)), { error: { name: 'MidaoTravelerConfirmationBackendError',
        message: 'Midao traveler confirmation backend failure', code: undefined, status: undefined } });
      assert.deepEqual(fake.writes, []); assert.deepEqual(fake.rpcCalls, []);
    });
  }
}

test('Supabase missing snapshot is corruption; mismatched party size uses booking capacity truth', async () => {
  const ids = await memoryScenario(); fakeScenario(ids, {}, { missingSnapshot: true });
  assert.equal((await observed(() => preview(input))).error.message, 'Midao traveler confirmation pricing snapshot is invalid');
  const warn = console.warn, warnings = [];
  console.warn = (...args) => warnings.push(args);
  try {
    fakeScenario(ids, {}, { partySize: 9 }); assert.equal((await preview(input)).partySize, 2);
    assert.equal(warnings.length, 1);
  } finally { console.warn = warn; }
});

test('provider restore is separate from data reset and restores real clock/random token factory', async () => {
  await memoryScenario(); reset();
  clock(() => { throw new Error('stale clock'); });
  tokenFactory(() => { throw new Error('stale token factory'); });
  clock(undefined); tokenFactory(undefined);
  seed({ inquiry: { id: command.inquiryId, guideId: G, activityId: A, status: 'replied', travelerUserId: T },
    plan: { id: P, activityId: A, guideId: G, bookingType: 'request', status: 'active', minParticipants: 1, maxParticipants: 4 } });
  const before = Date.now(), result = await convert(command), after = Date.now();
  assert.match(result.confirmationToken, /^[0-9a-f]{64}$/);
  const createdAt = Date.parse(result.travelerConfirmationExpiresAt) - 12 * 60 * 60 * 1000;
  assert.ok(createdAt >= before && createdAt <= after);
});

test('missing plan is optional for preview but accept rejects without consuming token', async () => {
  await memoryScenario({ missingPlan: true });
  assert.equal((await preview(input)).status, 'pending');
  await assert.rejects(() => accept(acceptInput), { code: 'NOT_FOUND', status: 404 });
  assert.equal(conversion.inspectStoresForTest().confirmationTokens[0].consumedAt, null);
});
