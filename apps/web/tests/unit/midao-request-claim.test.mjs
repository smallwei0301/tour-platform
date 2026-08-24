import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';

import {
  createMidaoRequestClaimToken,
  decodeMidaoRequestClaimPepper,
  hashMidaoRequestClaimToken,
  unavailableMidaoRequestClaimEnvelope,
  validateMidaoRequestClaimBridgeBody,
} from '../../src/lib/midao/midao-request-claim.ts';

const TOKEN = randomBytes(32).toString('base64url');
const PEPPER = randomBytes(32).toString('base64url');
const OTHER_PEPPER = randomBytes(32).toString('base64url');
const TRAVELER_A = '11111111-1111-4111-8111-111111111111';

function assertUnavailable(value) {
  assert.deepEqual(value, {
    ok: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Resource not found',
    },
  });
}

test('uses a peppered HMAC-SHA-256 claim namespace rather than SHA-only hashing', () => {
  const hash = hashMidaoRequestClaimToken(TOKEN, PEPPER);
  assert.match(hash, /^[0-9a-f]{64}$/u);
  assert.notEqual(hash, '7b6a6f3c5a8f090986f4d65be70f01f16a57ca4a75c30822d4056ca3a1037c97');
  assert.equal(hash, hashMidaoRequestClaimToken(TOKEN, PEPPER));
  assert.notEqual(hash, hashMidaoRequestClaimToken(TOKEN, OTHER_PEPPER));
});

test('creates a 256-bit request claim and accepts only an exact base64url 32-byte pepper', () => {
  const issued = createMidaoRequestClaimToken();
  assert.match(issued, /^[A-Za-z0-9_-]{43}$/u);
  assert.equal(Buffer.from(issued, 'base64url').length, 32);

  const decoded = decodeMidaoRequestClaimPepper(PEPPER);
  assert.equal(decoded.length, 32);
  assert.throws(() => decodeMidaoRequestClaimPepper('a'.repeat(43)), /MIDAO_REQUEST_CLAIM_PEPPER_INVALID/u);
  assert.throws(() => decodeMidaoRequestClaimPepper('not-a-real-pepper'), /MIDAO_REQUEST_CLAIM_PEPPER_INVALID/u);
  assert.throws(() => hashMidaoRequestClaimToken(TOKEN, 'local-test-only-midao-request-claim-pepper'), /MIDAO_REQUEST_CLAIM_PEPPER_INVALID/u);
});

test('rejects client-supplied traveler identity instead of allowing it into the bridge command', () => {
  const rejected = validateMidaoRequestClaimBridgeBody({
    token: TOKEN,
    travelerUserId: TRAVELER_A,
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, 'INVALID_REQUEST_BODY');
});

test('uses one indistinguishable envelope for every unavailable claim state', () => {
  const states = [
    'malformed',
    'missing',
    'expired',
    'revoked',
    'wrong-user',
    'foreign',
    'already-bound',
  ];
  for (const state of states) assertUnavailable(unavailableMidaoRequestClaimEnvelope(state));
});
