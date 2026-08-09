// Issue #1802 — /order/pay ECPay create must enforce the traveler confirmation gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canCheckoutTravelerConfirmation } from '../../src/lib/booking-type-flow.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const createRoute = readFileSync(
  join(__dirname, '../../app/api/payments/ecpay/create/route.ts'),
  'utf8',
);
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

test('ECPay create reads the booking confirmation fields by order_id', () => {
  const queryStart = createRoute.indexOf(".from('bookings')");
  const queryEnd = createRoute.indexOf('const cGate', queryStart);
  assert.ok(queryStart > -1, 'ECPay create must query bookings');
  assert.ok(queryEnd > queryStart, 'booking query must feed the confirmation gate');

  const bookingQuery = createRoute.slice(queryStart, queryEnd);
  assert.match(bookingQuery, /source_inquiry_id/);
  assert.match(bookingQuery, /traveler_confirmation_status/);
  assert.match(bookingQuery, /\.eq\('order_id', orderId\)/);
});

test('ECPay create invokes the shared traveler confirmation gate', () => {
  assert.match(createRoute, /canCheckoutTravelerConfirmation\(/);
});

test('/order/pay v2 adapter reaches the guarded ECPay create handler', () => {
  assert.match(v2CreateRoute, /export \{ POST \} from ['"]\.\.\/\.\.\/\.\.\/\.\.\/payments\/ecpay\/create\/route['"]/);
});

test('ECPay create blocks the gate with an explicit 409 error before payment side effects', () => {
  const gateIndex = createRoute.indexOf('const cGate');
  const credentialIndex = createRoute.indexOf(
    'const { hashKey, hashIV } = getECPayCredentials();',
  );
  const paymentAttemptIndex = createRoute.indexOf('upsertEcpayPaymentAttemptDb(');

  assert.ok(gateIndex > -1, 'confirmation gate not found');
  assert.ok(credentialIndex > gateIndex, 'credentials must be read after the gate');
  assert.ok(paymentAttemptIndex > gateIndex, 'payment attempt must be created after the gate');

  const gateBlock = createRoute.slice(gateIndex, credentialIndex);
  assert.match(gateBlock, /if \(!cGate\.allowed\)/);
  assert.match(gateBlock, /fail\(cGate\.code, cGate\.messageZh\)/);
  assert.match(gateBlock, /status:\s*409/);
});
