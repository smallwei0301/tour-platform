import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';
import {
  getMidaoTravelerConfirmationPreviewDb as preview,
} from '../../src/lib/midao/db-midao-traveler-confirmation.mjs';
import { NOW, OTHER, input, tokenHash, cleanup, memoryScenario, expectedPreview,
  fakeScenario, observed } from './fixtures/issue1816-confirmation-scenarios.mjs';

let savedFetch;
beforeEach(() => { savedFetch = globalThis.fetch; globalThis.fetch = async () => { throw new Error('Unexpected network'); }; });
afterEach(() => { cleanup(); globalThis.fetch = savedFetch; });

const scenarios = [
  ['pending', {}, 'pending'],
  ['booking status precedes confirmed/used', { bookingStatus: 'confirmed', confirmationStatus: 'confirmed', consumedAt: NOW }, 'expired'],
  ['confirmed precedes expiry', { confirmationStatus: 'confirmed', bookingExpiresAt: NOW }, 'used'],
  ['confirmation expired', { confirmationStatus: 'expired' }, 'expired'],
  ['confirmation not_required', { confirmationStatus: 'not_required' }, 'expired'],
  ['missing booking expiry', { bookingExpiresAt: null }, 'expired'],
  ['past booking expiry', { bookingExpiresAt: '2026-08-06T00:00:00.000Z' }, 'expired'],
  ['booking expiry equals now', { bookingExpiresAt: NOW }, 'expired'],
  ['past token expiry', { tokenExpiresAt: '2026-08-06T00:00:00.000Z' }, 'expired'],
  ['token expiry equals now', { tokenExpiresAt: NOW }, 'expired'],
  ['consumed', { consumedAt: NOW }, 'used'],
  ['booking expiry precedes consumed token', { bookingExpiresAt: NOW, consumedAt: NOW }, 'expired'],
  ['missing display relations', { missingPlan: true }, 'pending'],
  ['unknown token', { missingToken: true }, 'not-found'],
  ['missing booking relation', { missingBooking: true }, 'not-found'],
  ['wrong traveler', {}, 'not-found', { ...input, travelerUserId: OTHER }],
  ['missing order relation', { missingOrder: true }, 'backend-error'],
];
for (const [name, scenario, status, request = input] of scenarios) {
  test(`shared full preview envelope: ${name}`, async () => {
    const ids = await memoryScenario(scenario);
    const memory = await observed(() => preview(request));
    const fake = fakeScenario(ids, scenario);
    const supabase = await observed(() => preview(request));
    const expected = status === 'not-found'
      ? { error: { name: 'MidaoRouteError', message: 'Resource not found', code: 'NOT_FOUND', status: 404 } }
      : status === 'backend-error'
        ? { error: { name: 'MidaoTravelerConfirmationBackendError', message: 'Midao traveler confirmation order relation is invalid', code: undefined, status: undefined } }
        : { value: expectedPreview(ids, scenario, status) };
    assert.deepEqual(memory, expected);
    assert.deepEqual(supabase, expected);
    assert.deepEqual(fake.writes, []);
    assert.deepEqual(fake.rpcCalls, []);
    assert.deepEqual(fake.calls.find(c => c.table === 'booking_confirmation_tokens' && c.method === 'eq'),
      { table: 'booking_confirmation_tokens', method: 'eq', args: ['token_hash', tokenHash] });
    if (!scenario.missingToken && !scenario.missingBooking && request === input) {
      assert.deepEqual(fake.calls.filter(c => c.table === 'orders' && ['order', 'limit'].includes(c.method)), [
        { table: 'orders', method: 'order', args: ['created_at', { ascending: true }] },
        { table: 'orders', method: 'order', args: ['id', { ascending: true }] },
        { table: 'orders', method: 'limit', args: [1] },
      ]);
    }
  });
}
