import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  __resetMidaoBookingConfirmationStoreForTest as reset,
  __seedMidaoInquiryConversionFixtureForTest as seed,
  __setMidaoBookingConfirmationClockForTest as clock,
  __setMidaoConfirmationTokenFactoryForTest as tokenFactory,
  convertMidaoInquiryToBookingDb as convert,
} from '../../../src/lib/midao/db-midao-booking-confirmations.mjs';
import { __internal as lifecycle } from '../../../src/lib/midao/db-midao-traveler-confirmation.mjs';
import { __setSupabaseClientForTest } from '../../../src/lib/supabase-env.mjs';

export const G = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const I = '11111111-1111-4111-8111-111111111111';
export const P = '22222222-2222-4222-8222-222222222222';
export const A = '33333333-3333-4333-8333-333333333333';
export const T = '44444444-4444-4444-8444-444444444444';
export const OTHER = '77777777-7777-4777-8777-777777777777';
export const NOW = '2026-08-07T00:00:00.000Z';
export const EXPIRY = '2026-08-07T12:00:00.000Z';
export const RAW = 'f'.repeat(64);
export const HASH = 'a'.repeat(64);
export const tokenHash = createHash('sha256').update(RAW).digest('hex');
export const input = { travelerUserId: T, rawToken: RAW };
export const acceptInput = { ...input, idempotencyKey: 'accept-1816', requestHash: HASH };
export const command = { guideId: G, actorType: 'guide', actorId: G, inquiryId: I,
  activityPlanId: P, startAt: '2026-09-01T02:00:00.000Z', endAt: '2026-09-01T06:00:00.000Z',
  participants: 2, quotedTotalTwd: 8000, guideNote: null, confirmationTtlHours: 12,
  idempotencyKey: 'convert-1816', requestHash: HASH };

export function cleanup() {
  __setSupabaseClientForTest(null);
  for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY', 'DATABASE_URL', 'DIRECT_URL']) delete process.env[key];
  reset(); clock(undefined); tokenFactory(undefined);
}
export async function memoryScenario(scenario = {}) {
  cleanup(); clock(NOW); tokenFactory(() => RAW);
  seed({ inquiry: { id: I, guideId: G, activityId: A, status: 'replied', travelerUserId: T },
    plan: { id: P, activityId: A, guideId: G, bookingType: 'request', status: 'active',
      minParticipants: 1, maxParticipants: 4, name: 'Plan', activityTitle: 'Activity' } });
  const converted = await convert(command);
  lifecycle.seedConfirmationLifecycleForTest({ bookingId: converted.bookingId, ...scenario });
  return converted;
}
export function expectedPreview(ids, scenario = {}, status = 'pending') {
  return { status, bookingId: ids.bookingId, orderId: ids.orderId,
    service: { activityId: A, activityPlanId: P,
      title: scenario.missingPlan ? null : 'Activity', planName: scenario.missingPlan ? null : 'Plan' },
    schedule: { startAt: command.startAt, endAt: command.endAt }, partySize: 2,
    price: { quotedTotalTwd: 8000, currency: 'TWD' },
    expiresAt: 'bookingExpiresAt' in scenario ? scenario.bookingExpiresAt : EXPIRY };
}

export function fakeScenario(ids, scenario = {}, options = {}) {
  const calls = [], writes = [], rpcCalls = [];
  const data = {
    booking_confirmation_tokens: scenario.missingToken ? null : { booking_id: ids.bookingId,
      expires_at: scenario.tokenExpiresAt ?? EXPIRY, consumed_at: scenario.consumedAt ?? null },
    bookings: scenario.missingBooking ? null : { id: ids.bookingId, traveler_id: T,
      status: scenario.bookingStatus ?? 'draft', traveler_confirmation_status: scenario.confirmationStatus ?? 'pending',
      traveler_confirmation_expires_at: 'bookingExpiresAt' in scenario ? scenario.bookingExpiresAt : EXPIRY,
      participants: 2, start_at: command.startAt, end_at: command.endAt, activity_id: A, activity_plan_id: P },
    orders: scenario.missingOrder ? [] : [{ id: ids.orderId }],
    booking_pricing_snapshots: options.missingSnapshot ? null : { quoted_total_twd: 8000, currency: 'TWD', party_size: options.partySize ?? 2 },
    activities: scenario.missingPlan ? null : { title: 'Activity' },
    activity_plans: scenario.missingPlan ? null : { name: 'Plan' },
  };
  const tripwire = (operation) => { writes.push(operation); throw new Error('Unexpected write'); };
  const client = {
    from(table) {
      assert.ok(table in data, 'unexpected table');
      const query = {};
      for (const method of ['select', 'eq', 'order', 'limit']) query[method] = (...args) => {
        calls.push({ table, method, args }); return query;
      };
      for (const method of ['insert', 'update', 'upsert', 'delete']) query[method] = () => tripwire(method);
      query.then = (resolve, reject) => {
        if (options.rejectTable === table) return Promise.reject(new Error('unsafe driver detail')).then(resolve, reject);
        return Promise.resolve({ data: data[table], error: options.errorTable === table ? { message: 'unsafe driver detail' } : null }).then(resolve, reject);
      };
      query.maybeSingle = () => query;
      return query;
    },
    async rpc(name, args) {
      rpcCalls.push({ name, args });
      if (!options.rpcResponse) return tripwire('rpc');
      return options.rpcResponse;
    },
  };
  __setSupabaseClientForTest(client);
  process.env.SUPABASE_URL = 'https://fake.supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-only';
  return { calls, writes, rpcCalls };
}
export async function observed(action) {
  try { return { value: await action() }; }
  catch (error) { return { error: { name: error.name, message: error.message, code: error.code, status: error.status } }; }
}
