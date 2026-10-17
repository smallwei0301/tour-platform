import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
const mode = process.env.ISSUE1816_PROBE_MODE;
assert.ok(mode === 'control' || mode === 'recording', 'explicit probe mode required');
const root = new URL('../../../src/lib/', import.meta.url).href;
const gateway = root + 'midao/db-midao-booking-confirmations.mjs';
const events = [];
let phase = 'setup';
function view(store, name) {
  let proxy;
  const methods = new Map();
  proxy = new Proxy(store, {
    get(target, key) {
      const value = Reflect.get(target, key, target);
      if (typeof value !== 'function') {
        events.push({ phase, store: name, op: String(key) });
        return value;
      }
      if (!methods.has(key)) methods.set(key, (...args) => {
        events.push({ phase, store: name, op: String(key) });
        if (key === 'forEach') {
          const [callback, thisArg] = args;
          if (typeof callback !== 'function') return target.forEach(callback, thisArg);
          return target.forEach((v, k) => callback.call(thisArg, v, k, proxy));
        }
        const result = Reflect.apply(value, target, args);
        return result === target ? proxy : result;
      });
      return methods.get(key);
    },
  });
  return proxy;
}

// Driver controls are independent of production and never count toward AC1.
test('recording view preserves Map behavior and records operations', () => {
  const row = { count: 1 };
  const backing = new Map([['x', row]]);
  const p = view(backing, 'control');
  assert.equal(p.get('x'), row);
  assert.equal(p.set('y', row), p);
  assert.deepEqual([...p.values()], [row, row]);
  p.forEach((v, k, m) => { assert.equal(m, p); assert.equal(v, row); });
  assert.equal(backing.get('y'), row);
  assert.ok(events.some(e => e.op === 'values'));
  assert.equal(p.size, 2);
  assert.equal(p.has('x'), true);
  assert.deepEqual([...p.keys()], ['x', 'y']);
  assert.deepEqual([...p.entries()], [['x', row], ['y', row]]);
  assert.deepEqual([...p], [['x', row], ['y', row]]);
  assert.equal(p.delete('x'), true);
  assert.equal(p.delete('missing'), false);
  assert.equal(p.size, 1);
  assert.equal(p.clear(), undefined);
  assert.equal(p.size, 0);
  assert.equal(backing.size, 0);
  assert.throws(() => view(new Map(), 'empty').forEach(null), TypeError);
  events.length = 0;
});

test('public lifecycle does not traverse legacy mutable export', async () => {
  for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
    'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_ANON_KEY', 'DATABASE_URL', 'DIRECT_URL']) delete process.env[key];
  const savedFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Unexpected network'); };
  let replacement;
  try {
    const real = await import(gateway);
    const env = await import(root + 'supabase-env.mjs');
    env.__setSupabaseClientForTest(null);
    assert.equal(env.hasSupabaseEnv(), false);
    // Absence is valid after GREEN. No assertion tests export names/existence.
    if (mode === 'recording') {
      const runtime = Object.fromEntries(Object.entries(real.__confirmationRuntime ?? {})
        .map(([k, v]) => [k, v instanceof Map ? view(v, k) : v]));
      replacement = mock.module(gateway, {
        cache: true, namedExports: { ...real, __confirmationRuntime: runtime },
      });
    }
    const consumer = await import(root + 'midao/db-midao-traveler-confirmation.mjs');
    const G = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const I = '11111111-1111-4111-8111-111111111111';
    const P = '22222222-2222-4222-8222-222222222222';
    const A = '33333333-3333-4333-8333-333333333333';
    const T = '44444444-4444-4444-8444-444444444444';
    const token = 'f'.repeat(64), hash = 'a'.repeat(64);
    real.__resetMidaoBookingConfirmationStoreForTest();
    real.__setMidaoBookingConfirmationClockForTest('2026-08-07T00:00:00.000Z');
    real.__setMidaoConfirmationTokenFactoryForTest(() => token);
    real.__seedMidaoInquiryConversionFixtureForTest({
      inquiry: { id: I, guideId: G, activityId: A, status: 'replied',
        convertedBookingId: null, travelerUserId: T },
      plan: { id: P, activityId: A, guideId: G, bookingType: 'request',
        status: 'active', minParticipants: 1, maxParticipants: 4 },
      traveler: { id: T, name: 'Fixture', email: 'fixture@example.test' },
    });
    const command = { guideId: G, actorType: 'guide', actorId: G,
      inquiryId: I, activityPlanId: P, startAt: '2026-09-01T02:00:00.000Z',
      endAt: '2026-09-01T06:00:00.000Z', participants: 2, quotedTotalTwd: 8000,
      guideNote: null, confirmationTtlHours: 12,
      idempotencyKey: 'convert-key-1816', requestHash: hash };
    events.length = 0;
    phase = 'conversion';
    const c = await real.convertMidaoInquiryToBookingDb(command);
    assert.equal(c.created, true);
    assert.equal(c.travelerConfirmationStatus, 'pending');
    const input = { travelerUserId: T, rawToken: c.confirmationToken };
    phase = 'preview';
    const expected = { status: 'pending', bookingId: c.bookingId, orderId: c.orderId,
      service: { activityId: A, activityPlanId: P, title: null, planName: null },
      schedule: { startAt: command.startAt, endAt: command.endAt }, partySize: 2,
      price: { quotedTotalTwd: 8000, currency: 'TWD' },
      expiresAt: '2026-08-07T12:00:00.000Z' };
    assert.deepEqual(await consumer.getMidaoTravelerConfirmationPreviewDb(input), expected);
    assert.deepEqual(await consumer.getMidaoTravelerConfirmationPreviewDb(input), expected);
    phase = 'accept';
    const accept = { ...input, idempotencyKey: 'accept-key-1816', requestHash: hash };
    const accepted = { accepted: true, replayed: false, bookingId: c.bookingId,
      orderId: c.orderId, bookingStatus: 'draft', travelerConfirmationStatus: 'confirmed',
      paymentDeadlineAt: '2026-08-08T00:00:00.000Z' };
    assert.deepEqual(await consumer.acceptMidaoTravelerConfirmationDb(accept), accepted);
    phase = 'replay';
    assert.deepEqual(await consumer.acceptMidaoTravelerConfirmationDb(accept),
      { ...accepted, replayed: true });
    phase = 'used-preview';
    assert.deepEqual(await consumer.getMidaoTravelerConfirmationPreviewDb(input),
      { ...expected, status: 'used' });
    phase = 'double-convert';
    const replay = await real.convertMidaoInquiryToBookingDb(command);
    assert.equal(replay.bookingId, c.bookingId);
    assert.equal(replay.replayed, true);
    assert.equal(replay.confirmationToken, null);
    if (mode === 'recording') {
      assert.deepEqual(events, [], 'consumer crossed legacy mutable-store boundary');
    }
  } finally {
    replacement?.restore();
    globalThis.fetch = savedFetch;
  }
});
