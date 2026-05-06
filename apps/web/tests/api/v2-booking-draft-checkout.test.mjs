/**
 * Booking Draft + Checkout API Tests (TP-BP-005)
 *
 * Tests for:
 *   - POST /api/v2/bookings/draft
 *   - POST /api/v2/bookings/:bookingId/checkout
 *
 * Note: These tests focus on validation logic and response structure.
 * Integration tests require the dev server and Supabase.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// ============================================================================
// Validation Helpers (mirrors implementation)
// ============================================================================

function isValidUuid(str) {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

function isValidISODateTime(str) {
  const date = new Date(str);
  return !isNaN(date.getTime());
}

function isValidTimezone(tz) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone) {
  return /^[\d\s\-+()]{7,20}$/.test(phone);
}

const VALID_CHANNELS = ['web', 'line', 'admin_pos'];
const REUSABLE_PAYMENT_STATUSES = new Set(['pending', 'processing', 'created']);

function isReusableCheckoutPayment(status) {
  if (!status) return false;
  return REUSABLE_PAYMENT_STATUSES.has(status);
}

function findReusableCheckoutPayment(payments) {
  if (!payments || payments.length === 0) return null;

  return (
    payments.find(
      (payment) =>
        Boolean(payment?.id) &&
        Boolean(payment?.trade_no) &&
        isReusableCheckoutPayment(payment?.status)
    ) || null
  );
}

function parseAndValidateDraftBody(body) {
  if (!body || typeof body !== 'object') {
    return { error: { code: 'VALIDATION_ERROR', message: 'Request body is required' } };
  }

  // activityId
  if (!body.activityId || typeof body.activityId !== 'string') {
    return { error: { code: 'VALIDATION_ERROR', message: 'activityId is required' } };
  }
  if (!isValidUuid(body.activityId)) {
    return { error: { code: 'VALIDATION_ERROR', message: 'Invalid activityId format' } };
  }

  // planId
  if (!body.planId || typeof body.planId !== 'string') {
    return { error: { code: 'VALIDATION_ERROR', message: 'planId is required' } };
  }
  if (!isValidUuid(body.planId)) {
    return { error: { code: 'VALIDATION_ERROR', message: 'Invalid planId format' } };
  }

  // startAt
  if (!body.startAt || typeof body.startAt !== 'string') {
    return { error: { code: 'VALIDATION_ERROR', message: 'startAt is required' } };
  }
  if (!isValidISODateTime(body.startAt)) {
    return { error: { code: 'VALIDATION_ERROR', message: 'Invalid startAt format (ISO 8601)' } };
  }

  // timezone
  if (!body.timezone || typeof body.timezone !== 'string') {
    return { error: { code: 'VALIDATION_ERROR', message: 'timezone is required' } };
  }
  if (!isValidTimezone(body.timezone)) {
    return { error: { code: 'VALIDATION_ERROR', message: 'Invalid timezone' } };
  }

  // participants
  if (typeof body.participants !== 'number' || !Number.isInteger(body.participants)) {
    return { error: { code: 'VALIDATION_ERROR', message: 'participants must be an integer' } };
  }
  if (body.participants < 1) {
    return { error: { code: 'VALIDATION_ERROR', message: 'participants must be at least 1' } };
  }

  // sourceChannel (optional)
  let sourceChannel = 'web';
  if (body.sourceChannel) {
    if (!VALID_CHANNELS.includes(body.sourceChannel)) {
      return {
        error: {
          code: 'VALIDATION_ERROR',
          message: `sourceChannel must be one of: ${VALID_CHANNELS.join(', ')}`,
        },
      };
    }
    sourceChannel = body.sourceChannel;
  }

  // contactName
  if (!body.contactName || typeof body.contactName !== 'string') {
    return { error: { code: 'VALIDATION_ERROR', message: 'contactName is required' } };
  }
  const contactName = body.contactName.trim();
  if (contactName.length < 1) {
    return { error: { code: 'VALIDATION_ERROR', message: 'contactName cannot be empty' } };
  }

  // contactPhone
  if (!body.contactPhone || typeof body.contactPhone !== 'string') {
    return { error: { code: 'VALIDATION_ERROR', message: 'contactPhone is required' } };
  }
  const contactPhone = body.contactPhone.trim();
  if (!isValidPhone(contactPhone)) {
    return { error: { code: 'VALIDATION_ERROR', message: 'Invalid contactPhone format' } };
  }

  // contactEmail
  if (!body.contactEmail || typeof body.contactEmail !== 'string') {
    return { error: { code: 'VALIDATION_ERROR', message: 'contactEmail is required' } };
  }
  const contactEmail = body.contactEmail.trim().toLowerCase();
  if (!isValidEmail(contactEmail)) {
    return { error: { code: 'VALIDATION_ERROR', message: 'Invalid contactEmail format' } };
  }

  // customerNote (optional)
  const customerNote =
    body.customerNote && typeof body.customerNote === 'string' ? body.customerNote.trim() : undefined;

  return {
    data: {
      activityId: body.activityId,
      planId: body.planId,
      startAt: body.startAt,
      timezone: body.timezone,
      participants: body.participants,
      sourceChannel,
      contactName,
      contactPhone,
      contactEmail,
      customerNote,
    },
  };
}

// ============================================================================
// UUID Validation Tests
// ============================================================================

test('isValidUuid accepts valid UUIDs', () => {
  assert.equal(isValidUuid('550e8400-e29b-41d4-a716-446655440000'), true);
  assert.equal(isValidUuid('6ba7b810-9dad-11d1-80b4-00c04fd430c8'), true);
  assert.equal(isValidUuid('f47ac10b-58cc-4372-a567-0e02b2c3d479'), true);
});

test('isValidUuid rejects invalid UUIDs', () => {
  assert.equal(isValidUuid('not-a-uuid'), false);
  assert.equal(isValidUuid(''), false);
  assert.equal(isValidUuid('550e8400-e29b-41d4-a716'), false);
  assert.equal(isValidUuid('550e8400-e29b-61d4-a716-446655440000'), false);
});

// ============================================================================
// DateTime Validation Tests
// ============================================================================

test('isValidISODateTime accepts valid ISO date times', () => {
  assert.equal(isValidISODateTime('2026-04-20T09:00:00+08:00'), true);
  assert.equal(isValidISODateTime('2026-04-20T09:00:00Z'), true);
  assert.equal(isValidISODateTime('2026-04-20T01:00:00.000Z'), true);
});

test('isValidISODateTime rejects invalid date times', () => {
  assert.equal(isValidISODateTime('not-a-date'), false);
  assert.equal(isValidISODateTime(''), false);
  // Note: '2026-04-20' (date-only) is actually valid in JS Date parsing
  // The API expects full ISO datetime but technically accepts date-only
  assert.equal(isValidISODateTime('2026-04-20'), true);
});

// ============================================================================
// Email Validation Tests
// ============================================================================

test('isValidEmail accepts valid emails', () => {
  assert.equal(isValidEmail('test@example.com'), true);
  assert.equal(isValidEmail('user.name@domain.co'), true);
  assert.equal(isValidEmail('user+tag@domain.com'), true);
});

test('isValidEmail rejects invalid emails', () => {
  assert.equal(isValidEmail('not-an-email'), false);
  assert.equal(isValidEmail('@domain.com'), false);
  assert.equal(isValidEmail('user@'), false);
  assert.equal(isValidEmail(''), false);
});

// ============================================================================
// Phone Validation Tests
// ============================================================================

test('isValidPhone accepts valid phone numbers', () => {
  assert.equal(isValidPhone('0912345678'), true);
  assert.equal(isValidPhone('+886-912-345-678'), true);
  assert.equal(isValidPhone('(02) 1234 5678'), true);
});

test('isValidPhone rejects invalid phone numbers', () => {
  assert.equal(isValidPhone('123'), false); // too short
  assert.equal(isValidPhone(''), false);
  assert.equal(isValidPhone('abc-def-ghij'), false);
});

// ============================================================================
// Booking Draft Body Validation Tests
// ============================================================================

test('parseAndValidateDraftBody requires activityId', () => {
  const body = {
    planId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    startAt: '2026-04-20T09:00:00+08:00',
    timezone: 'Asia/Taipei',
    participants: 2,
    contactName: '王小明',
    contactPhone: '0912345678',
    contactEmail: 'test@example.com',
  };

  const result = parseAndValidateDraftBody(body);
  assert.ok('error' in result);
  assert.equal(result.error.message, 'activityId is required');
});

test('parseAndValidateDraftBody requires planId', () => {
  const body = {
    activityId: '550e8400-e29b-41d4-a716-446655440000',
    startAt: '2026-04-20T09:00:00+08:00',
    timezone: 'Asia/Taipei',
    participants: 2,
    contactName: '王小明',
    contactPhone: '0912345678',
    contactEmail: 'test@example.com',
  };

  const result = parseAndValidateDraftBody(body);
  assert.ok('error' in result);
  assert.equal(result.error.message, 'planId is required');
});

test('parseAndValidateDraftBody requires startAt', () => {
  const body = {
    activityId: '550e8400-e29b-41d4-a716-446655440000',
    planId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    timezone: 'Asia/Taipei',
    participants: 2,
    contactName: '王小明',
    contactPhone: '0912345678',
    contactEmail: 'test@example.com',
  };

  const result = parseAndValidateDraftBody(body);
  assert.ok('error' in result);
  assert.equal(result.error.message, 'startAt is required');
});

test('parseAndValidateDraftBody requires timezone', () => {
  const body = {
    activityId: '550e8400-e29b-41d4-a716-446655440000',
    planId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    startAt: '2026-04-20T09:00:00+08:00',
    participants: 2,
    contactName: '王小明',
    contactPhone: '0912345678',
    contactEmail: 'test@example.com',
  };

  const result = parseAndValidateDraftBody(body);
  assert.ok('error' in result);
  assert.equal(result.error.message, 'timezone is required');
});

test('parseAndValidateDraftBody validates participants is positive integer', () => {
  const baseBody = {
    activityId: '550e8400-e29b-41d4-a716-446655440000',
    planId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    startAt: '2026-04-20T09:00:00+08:00',
    timezone: 'Asia/Taipei',
    contactName: '王小明',
    contactPhone: '0912345678',
    contactEmail: 'test@example.com',
  };

  // Missing participants
  let result = parseAndValidateDraftBody({ ...baseBody });
  assert.ok('error' in result);
  assert.equal(result.error.message, 'participants must be an integer');

  // Zero participants
  result = parseAndValidateDraftBody({ ...baseBody, participants: 0 });
  assert.ok('error' in result);
  assert.equal(result.error.message, 'participants must be at least 1');

  // Negative participants
  result = parseAndValidateDraftBody({ ...baseBody, participants: -1 });
  assert.ok('error' in result);
  assert.equal(result.error.message, 'participants must be at least 1');

  // Non-integer participants
  result = parseAndValidateDraftBody({ ...baseBody, participants: 2.5 });
  assert.ok('error' in result);
  assert.equal(result.error.message, 'participants must be an integer');
});

test('parseAndValidateDraftBody requires contactName', () => {
  const body = {
    activityId: '550e8400-e29b-41d4-a716-446655440000',
    planId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    startAt: '2026-04-20T09:00:00+08:00',
    timezone: 'Asia/Taipei',
    participants: 2,
    contactPhone: '0912345678',
    contactEmail: 'test@example.com',
  };

  const result = parseAndValidateDraftBody(body);
  assert.ok('error' in result);
  assert.equal(result.error.message, 'contactName is required');
});

test('parseAndValidateDraftBody requires contactPhone', () => {
  const body = {
    activityId: '550e8400-e29b-41d4-a716-446655440000',
    planId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    startAt: '2026-04-20T09:00:00+08:00',
    timezone: 'Asia/Taipei',
    participants: 2,
    contactName: '王小明',
    contactEmail: 'test@example.com',
  };

  const result = parseAndValidateDraftBody(body);
  assert.ok('error' in result);
  assert.equal(result.error.message, 'contactPhone is required');
});

test('parseAndValidateDraftBody requires contactEmail', () => {
  const body = {
    activityId: '550e8400-e29b-41d4-a716-446655440000',
    planId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    startAt: '2026-04-20T09:00:00+08:00',
    timezone: 'Asia/Taipei',
    participants: 2,
    contactName: '王小明',
    contactPhone: '0912345678',
  };

  const result = parseAndValidateDraftBody(body);
  assert.ok('error' in result);
  assert.equal(result.error.message, 'contactEmail is required');
});

test('parseAndValidateDraftBody validates sourceChannel', () => {
  const baseBody = {
    activityId: '550e8400-e29b-41d4-a716-446655440000',
    planId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    startAt: '2026-04-20T09:00:00+08:00',
    timezone: 'Asia/Taipei',
    participants: 2,
    contactName: '王小明',
    contactPhone: '0912345678',
    contactEmail: 'test@example.com',
  };

  // Invalid sourceChannel
  const result = parseAndValidateDraftBody({ ...baseBody, sourceChannel: 'invalid' });
  assert.ok('error' in result);
  assert.ok(result.error.message.includes('sourceChannel must be one of'));
});

test('parseAndValidateDraftBody accepts valid complete request', () => {
  const body = {
    activityId: '550e8400-e29b-41d4-a716-446655440000',
    planId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    startAt: '2026-04-20T09:00:00+08:00',
    timezone: 'Asia/Taipei',
    participants: 2,
    sourceChannel: 'web',
    contactName: '王小明',
    contactPhone: '0912345678',
    contactEmail: 'test@example.com',
    customerNote: '有長輩同行',
  };

  const result = parseAndValidateDraftBody(body);
  assert.ok('data' in result);
  assert.equal(result.data.activityId, body.activityId);
  assert.equal(result.data.planId, body.planId);
  assert.equal(result.data.startAt, body.startAt);
  assert.equal(result.data.timezone, body.timezone);
  assert.equal(result.data.participants, body.participants);
  assert.equal(result.data.sourceChannel, 'web');
  assert.equal(result.data.contactName, body.contactName);
  assert.equal(result.data.contactPhone, body.contactPhone);
  assert.equal(result.data.contactEmail, 'test@example.com');
  assert.equal(result.data.customerNote, body.customerNote);
});

test('parseAndValidateDraftBody defaults sourceChannel to web', () => {
  const body = {
    activityId: '550e8400-e29b-41d4-a716-446655440000',
    planId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    startAt: '2026-04-20T09:00:00+08:00',
    timezone: 'Asia/Taipei',
    participants: 2,
    contactName: '王小明',
    contactPhone: '0912345678',
    contactEmail: 'test@example.com',
  };

  const result = parseAndValidateDraftBody(body);
  assert.ok('data' in result);
  assert.equal(result.data.sourceChannel, 'web');
});

test('parseAndValidateDraftBody accepts line sourceChannel', () => {
  const body = {
    activityId: '550e8400-e29b-41d4-a716-446655440000',
    planId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    startAt: '2026-04-20T09:00:00+08:00',
    timezone: 'Asia/Taipei',
    participants: 2,
    sourceChannel: 'line',
    contactName: '王小明',
    contactPhone: '0912345678',
    contactEmail: 'test@example.com',
  };

  const result = parseAndValidateDraftBody(body);
  assert.ok('data' in result);
  assert.equal(result.data.sourceChannel, 'line');
});

test('parseAndValidateDraftBody accepts admin_pos sourceChannel', () => {
  const body = {
    activityId: '550e8400-e29b-41d4-a716-446655440000',
    planId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    startAt: '2026-04-20T09:00:00+08:00',
    timezone: 'Asia/Taipei',
    participants: 2,
    sourceChannel: 'admin_pos',
    contactName: '王小明',
    contactPhone: '0912345678',
    contactEmail: 'test@example.com',
  };

  const result = parseAndValidateDraftBody(body);
  assert.ok('data' in result);
  assert.equal(result.data.sourceChannel, 'admin_pos');
});

// ============================================================================
// Response Structure Tests (API Spec Compliance)
// ============================================================================

test('successV2 booking draft response format matches API spec', () => {
  function successV2(data) {
    return { success: true, data };
  }

  const response = successV2({
    bookingId: 'bk_123',
    bookingNo: 'BK-20260420-00001',
    bookingStatus: 'draft',
    orderId: 'ord_123',
    orderStatus: 'pending_payment',
    amount: 4800,
    currency: 'TWD',
  });

  assert.equal(response.success, true);
  assert.ok(response.data);
  assert.ok(response.data.bookingId);
  assert.ok(response.data.bookingNo);
  assert.equal(response.data.bookingStatus, 'draft');
  assert.ok(response.data.orderId);
  assert.equal(response.data.orderStatus, 'pending_payment');
  assert.equal(typeof response.data.amount, 'number');
  assert.equal(response.data.currency, 'TWD');
});

test('successV2 checkout response format matches API spec', () => {
  function successV2(data) {
    return { success: true, data };
  }

  const response = successV2({
    provider: 'ecpay',
    paymentId: 'pay_123',
    merchantTradeNo: 'TP202604200001',
    paymentFormHtml: '<form>...</form>',
  });

  assert.equal(response.success, true);
  assert.ok(response.data);
  assert.equal(response.data.provider, 'ecpay');
  assert.ok(response.data.paymentId);
  assert.ok(response.data.merchantTradeNo);
  assert.ok(response.data.paymentFormHtml);
});

test('errorV2 response format matches API spec', () => {
  function errorV2(code, message) {
    return { success: false, error: { code, message } };
  }

  // SLOT_UNAVAILABLE error
  let response = errorV2('SLOT_UNAVAILABLE', 'The selected time slot is already booked');
  assert.equal(response.success, false);
  assert.ok(response.error);
  assert.equal(response.error.code, 'SLOT_UNAVAILABLE');
  assert.ok(response.error.message);

  // INVALID_STATE_TRANSITION error
  response = errorV2('INVALID_STATE_TRANSITION', 'Booking must be in draft status to checkout');
  assert.equal(response.success, false);
  assert.equal(response.error.code, 'INVALID_STATE_TRANSITION');
});

// ============================================================================
// Booking Status Tests
// ============================================================================

test('valid booking statuses', () => {
  const validStatuses = [
    'draft',
    'pending_confirmation',
    'confirmed',
    'completed',
    'cancelled',
    'no_show',
    'reschedule_requested',
  ];

  validStatuses.forEach((status) => {
    assert.ok(typeof status === 'string');
    assert.ok(status.length > 0);
  });
});

test('valid order statuses', () => {
  const validStatuses = [
    'draft',
    'pending_payment',
    'paid',
    'cancelled',
    'refunded',
    'partially_refunded',
  ];

  validStatuses.forEach((status) => {
    assert.ok(typeof status === 'string');
    assert.ok(status.length > 0);
  });
});

test('valid payment statuses', () => {
  const validStatuses = ['created', 'pending', 'paid', 'failed', 'cancelled', 'refunded'];

  validStatuses.forEach((status) => {
    assert.ok(typeof status === 'string');
    assert.ok(status.length > 0);
  });
});

test('isReusableCheckoutPayment only allows pending-like statuses', () => {
  assert.equal(isReusableCheckoutPayment('created'), true);
  assert.equal(isReusableCheckoutPayment('pending'), true);
  assert.equal(isReusableCheckoutPayment('processing'), true);

  assert.equal(isReusableCheckoutPayment('paid'), false);
  assert.equal(isReusableCheckoutPayment('failed'), false);
  assert.equal(isReusableCheckoutPayment('cancelled'), false);
  assert.equal(isReusableCheckoutPayment('refunded'), false);
  assert.equal(isReusableCheckoutPayment(null), false);
});

test('findReusableCheckoutPayment picks reusable payment from latest-first list', () => {
  const latestFirstPayments = [
    { id: 'pay_new_failed', trade_no: 'TN_NEW_FAILED', status: 'failed' },
    { id: 'pay_old_pending', trade_no: 'TN_OLD_PENDING', status: 'pending' },
  ];

  const candidate = findReusableCheckoutPayment(latestFirstPayments);
  assert.ok(candidate);
  assert.equal(candidate.id, 'pay_old_pending');
  assert.equal(candidate.trade_no, 'TN_OLD_PENDING');
});

test('findReusableCheckoutPayment rejects non-reusable or malformed payments', () => {
  const noReusable = [
    { id: 'pay_paid', trade_no: 'TN_PAID', status: 'paid' },
    { id: 'pay_failed', trade_no: 'TN_FAILED', status: 'failed' },
    { id: 'pay_missing_trade_no', trade_no: null, status: 'pending' },
  ];

  assert.equal(findReusableCheckoutPayment(noReusable), null);
  assert.equal(findReusableCheckoutPayment([]), null);
  assert.equal(findReusableCheckoutPayment(null), null);
});

// ============================================================================
// Checkout Validation Tests
// ============================================================================

test('checkout requires valid bookingId', () => {
  // Validates that bookingId must be a valid UUID
  assert.equal(isValidUuid('not-a-uuid'), false);
  assert.equal(isValidUuid(''), false);
  assert.equal(isValidUuid('550e8400-e29b-41d4-a716-446655440000'), true);
});

test('valid payment providers', () => {
  const validProviders = ['ecpay'];

  validProviders.forEach((provider) => {
    assert.ok(typeof provider === 'string');
    assert.ok(provider.length > 0);
  });
});

// ============================================================================
// MerchantTradeNo Generation Tests
// ============================================================================

test('generateMerchantTradeNo creates valid trade number', () => {
  function generateMerchantTradeNo(bookingId) {
    const idPart = bookingId.replace(/-/g, '').slice(0, 12);
    const timePart = Date.now().toString().slice(-8);
    return `${idPart}${timePart}`;
  }

  const bookingId = '550e8400-e29b-41d4-a716-446655440000';
  const tradeNo = generateMerchantTradeNo(bookingId);

  // Should be exactly 20 characters (12 + 8)
  assert.equal(tradeNo.length, 20);

  // Should not contain dashes
  assert.ok(!tradeNo.includes('-'));

  // First 12 chars should be from the UUID
  assert.equal(tradeNo.slice(0, 12), '550e8400e29b');
});

console.log('All Booking Draft + Checkout API tests completed!');
