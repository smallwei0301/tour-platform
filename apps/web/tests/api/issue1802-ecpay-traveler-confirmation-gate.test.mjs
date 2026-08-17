// Issue #1802 — /order/pay ECPay create must enforce the traveler confirmation gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canCheckoutTravelerConfirmation } from '../../src/lib/booking-type-flow.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const v2CreateRoute = readFileSync(
  join(__dirname, '../../app/api/v2/payments/ecpay/create/route.ts'),
  'utf8',
);
const INQUIRY_ID = '11111111-1111-4111-8111-111111111111';

// ---------------------------------------------------------------------------
// Payment-boundary decision cases
// ---------------------------------------------------------------------------

test('pending LINE inquiry booking is blocked before ECPay payment creation', () => {
  const result = canCheckoutTravelerConfirmation({
    sourceInquiryId: INQUIRY_ID,
    travelerConfirmationStatus: 'pending',
  });

  assert.equal(result.allowed, false);
  assert.equal(result.code, 'TRAVELER_CONFIRMATION_REQUIRED');
  assert.match(result.messageZh, /確認/);
});

test('confirmed inquiry booking remains allowed through the ECPay payment boundary', () => {
  const result = canCheckoutTravelerConfirmation({
    sourceInquiryId: INQUIRY_ID,
    travelerConfirmationStatus: 'confirmed',
  });

  assert.deepEqual(result, { allowed: true });
});

test('non-inquiry booking remains allowed through the ECPay payment boundary', () => {
  const result = canCheckoutTravelerConfirmation({
    sourceInquiryId: null,
    travelerConfirmationStatus: 'not_required',
  });

  assert.deepEqual(result, { allowed: true });
});

// ---------------------------------------------------------------------------
// ECPay create route wiring
// ---------------------------------------------------------------------------

test('V2 ECPay create reads confirmation fields through the persisted aggregate gateway', () => {
  assert.match(v2CreateRoute, /getMaterializedOrderDetailForPayment\(orderId\)/);
  assert.match(v2CreateRoute, /sourceInquiryId: order\.sourceInquiryId/);
  assert.match(v2CreateRoute, /travelerConfirmationStatus: order\.travelerConfirmationStatus/);
});

test('V2 ECPay create invokes the shared traveler confirmation gate', () => {
  assert.match(v2CreateRoute, /canCheckoutTravelerConfirmation\(/);
});

test('/order/pay V2 endpoint implements the guarded ECPay create handler', () => {
  assert.match(v2CreateRoute, /isMaterializedOrderReadyForPayment\(order\)/);
});

test('V2 ECPay create blocks the gate with an explicit 409 error before payment side effects', () => {
  const gateIndex = v2CreateRoute.indexOf('const confirmation');
  const credentialIndex = v2CreateRoute.indexOf(
    'const { hashKey, hashIV } = getECPayCredentials();',
  );
  const paymentAttemptIndex = v2CreateRoute.indexOf('upsertEcpayPaymentAttemptDb(');

  assert.ok(gateIndex > -1, 'confirmation gate not found');
  assert.ok(credentialIndex > gateIndex, 'credentials must be read after the gate');
  assert.ok(paymentAttemptIndex > gateIndex, 'payment attempt must be created after the gate');

  const gateBlock = v2CreateRoute.slice(gateIndex, credentialIndex);
  assert.match(gateBlock, /if \(!confirmation\.allowed\)/);
  assert.match(gateBlock, /jsonError\(confirmation\.code, confirmation\.messageZh, 409\)/);
  assert.match(gateBlock, /jsonError\([^)]*, 409\)/);
});
