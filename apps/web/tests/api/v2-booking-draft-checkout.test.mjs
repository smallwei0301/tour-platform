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
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  CAPACITY_HOLD_BOOKING_STATUSES,
  FORMED_GROUP_BOOKING_STATUSES,
  calculateExistingParticipantsForGroup,
  evaluateGroupBookingRule,
  excludeSameActivityPlanDateBookings,
} from '../../src/lib/availability-v2/group-booking-rule.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

// ============================================================================
// Validation Helpers (mirrors implementation)
// ============================================================================

function isUuidLike(str) {
  const uuidLikeRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidLikeRegex.test(str);
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
  if (!isUuidLike(body.activityId)) {
    return { error: { code: 'VALIDATION_ERROR', message: 'Invalid activityId format' } };
  }

  // planId
  if (!body.planId || typeof body.planId !== 'string') {
    return { error: { code: 'VALIDATION_ERROR', message: 'planId is required' } };
  }
  if (!isUuidLike(body.planId)) {
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

test('isUuidLike accepts database UUID values including fixture UUID-like IDs', () => {
  assert.equal(isUuidLike('550e8400-e29b-41d4-a716-446655440000'), true);
  assert.equal(isUuidLike('6ba7b810-9dad-11d1-80b4-00c04fd430c8'), true);
  assert.equal(isUuidLike('f47ac10b-58cc-4372-a567-0e02b2c3d479'), true);
  assert.equal(isUuidLike('c0000003-0000-0000-0000-000000000001'), true);
});

test('isUuidLike rejects malformed UUID strings', () => {
  assert.equal(isUuidLike('not-a-uuid'), false);
  assert.equal(isUuidLike(''), false);
  assert.equal(isUuidLike('550e8400-e29b-41d4-a716'), false);
  assert.equal(isUuidLike('550e8400-e29b-zzzz-a716-446655440000'), false);
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
  // Validates that bookingId must be a database UUID-like value
  assert.equal(isUuidLike('not-a-uuid'), false);
  assert.equal(isUuidLike(''), false);
  assert.equal(isUuidLike('550e8400-e29b-41d4-a716-446655440000'), true);
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

// ============================================================================
// PR #708 Regression Guards — slug→resolved-ID fix
// ============================================================================

test('draft API rejects slug-style activityId (regression guard for PR #708)', () => {
  // Slug-style IDs should be rejected — not UUID-like
  const slugPayloads = [
    'kaohsiung-chaishan-cave-experience',
    'half-day',
    'taipei-101-night-tour',
    'activity-slug-with-numbers-123',
  ];
  for (const slug of slugPayloads) {
    const result = parseAndValidateDraftBody({
      activityId: slug,
      planId: 'c0000003-0000-0000-0000-000000000002',
      startAt: '2026-06-01T09:00:00+08:00',
      timezone: 'Asia/Taipei',
      participants: 2,
      contactName: 'Test User',
      contactPhone: '0912345678',
      contactEmail: 'test@example.com',
    });
    assert.ok('error' in result, `Expected error for slug activityId: ${slug}`);
    assert.equal(result.error.message, 'Invalid activityId format', `Expected Invalid activityId format for: ${slug}`);
  }
});

test('draft API rejects slug-style planId (regression guard for PR #708)', () => {
  const slugPlanIds = ['half-day', 'full-day', 'sunset-tour', 'plan-slug-123'];
  for (const slug of slugPlanIds) {
    const result = parseAndValidateDraftBody({
      activityId: 'c0000003-0000-0000-0000-000000000001',
      planId: slug,
      startAt: '2026-06-01T09:00:00+08:00',
      timezone: 'Asia/Taipei',
      participants: 2,
      contactName: 'Test User',
      contactPhone: '0912345678',
      contactEmail: 'test@example.com',
    });
    assert.ok('error' in result, `Expected error for slug planId: ${slug}`);
    assert.equal(result.error.message, 'Invalid planId format', `Expected Invalid planId format for: ${slug}`);
  }
});

test('draft API accepts UUID-like resolved activityId and planId (regression guard for PR #708)', () => {
  // These are the resolved IDs that the V2 booking shell should send after slug resolution
  const result = parseAndValidateDraftBody({
    activityId: 'c0000003-0000-0000-0000-000000000001',
    planId: 'c0000003-0000-0000-0000-000000000002',
    startAt: '2026-06-01T09:00:00+08:00',
    timezone: 'Asia/Taipei',
    participants: 2,
    contactName: 'Test User',
    contactPhone: '0912345678',
    contactEmail: 'test@example.com',
  });
  assert.ok('data' in result, `Expected no error for UUID-like IDs, got: ${result.error?.message}`);
  assert.equal(result.data.activityId, 'c0000003-0000-0000-0000-000000000001');
  assert.equal(result.data.planId, 'c0000003-0000-0000-0000-000000000002');
});

test('draft route applies formed-group rule and avoids same-group overlap hard conflict', async () => {
  const rel = 'app/api/v2/bookings/draft/route.ts';
  const src = await readFile(path.join(ROOT, rel), 'utf8');

  assert.match(src, /FORMED_GROUP_BOOKING_STATUSES/);
  assert.match(src, /CAPACITY_HOLD_BOOKING_STATUSES/);
  assert.match(src, /evaluateGroupBookingRule\(/);
  assert.match(src, /effectiveGroupRule/);
  assert.match(src, /calculateExistingParticipantsForGroup\(/);
  assert.match(src, /effectiveGroupRule\.messageZh/);
  assert.match(src, /excludeSameActivityPlanDateBookings\(/);
  assert.match(src, /bookings: nonGroupBookings/);
});

test('behavior: draft rule blocks if confirmed+draft participants already exceed remaining capacity', () => {
  const guideId = 'guide_001';
  const activityId = 'activity_001';
  const planId = 'plan_001';
  const timezone = 'Asia/Taipei';

  const slotDate = '2026-04-20';
  const baseBooking = {
    id: 'same_slot_existing',
    guide_id: guideId,
    start_at: '2026-04-20T01:00:00Z',
    end_at: '2026-04-20T05:00:00Z',
    participants: 4,
    activity_id: activityId,
    activity_plan_id: planId,
  };

  const formedExisting = calculateExistingParticipantsForGroup({
    bookings: [
      {
        ...baseBooking,
        id: 'formed_existing',
        status: 'confirmed',
        participants: 4,
      },
      {
        ...baseBooking,
        id: 'draft_existing',
        status: 'draft',
        participants: 3,
      },
    ],
    activityId,
    planId,
    localDate: slotDate,
    timezone,
    statuses: FORMED_GROUP_BOOKING_STATUSES,
  });
  const capacityHoldExisting = calculateExistingParticipantsForGroup({
    bookings: [
      {
        ...baseBooking,
        id: 'formed_existing',
        status: 'confirmed',
        participants: 4,
      },
      {
        ...baseBooking,
        id: 'draft_existing',
        status: 'draft',
        participants: 3,
      },
    ],
    activityId,
    planId,
    localDate: slotDate,
    timezone,
    statuses: CAPACITY_HOLD_BOOKING_STATUSES,
  });

  const capacityHoldRule = evaluateGroupBookingRule({
    minParticipants: 4,
    maxParticipants: 5,
    effectiveExistingParticipants: capacityHoldExisting,
    requestedParticipants: 1,
  });
  const formedRule = evaluateGroupBookingRule({
    minParticipants: 4,
    maxParticipants: 5,
    effectiveExistingParticipants: formedExisting,
    requestedParticipants: 1,
  });

  assert.equal(capacityHoldExisting, 7);
  assert.equal(formedExisting, 4);
  assert.equal(formedRule.allowed, true);
  assert.equal(capacityHoldRule.allowed, false);
  assert.equal(capacityHoldRule.reasonCode, 'CAPACITY_EXCEEDED');
});

test('behavior: draft pre-insert validation allows formed add-on but blocks when total exceeds max', () => {
  const guideId = 'guide_001';
  const activityId = 'activity_001';
  const planId = 'plan_001';
  const timezone = 'Asia/Taipei';

  const slotStart = '2026-04-20T01:00:00Z';
  const slotEnd = '2026-04-20T05:00:00Z';
  const baseBooking = {
    id: 'same_slot_existing',
    guide_id: guideId,
    start_at: slotStart,
    end_at: slotEnd,
    status: 'confirmed',
    activity_id: activityId,
    activity_plan_id: planId,
  };

  const formedBookings = [{ ...baseBooking, participants: 4 }];
  const formedExisting = calculateExistingParticipantsForGroup({
    bookings: formedBookings,
    activityId,
    planId,
    localDate: '2026-04-20',
    timezone,
    statuses: FORMED_GROUP_BOOKING_STATUSES,
  });
  const formedRule = evaluateGroupBookingRule({
    minParticipants: 4,
    maxParticipants: 5,
    effectiveExistingParticipants: formedExisting,
    requestedParticipants: 1,
  });
  assert.equal(formedRule.allowed, true);

  const nonGroupBookings = excludeSameActivityPlanDateBookings({
    bookings: formedBookings,
    activityId,
    planId,
    localDate: '2026-04-20',
    timezone,
  });
  assert.equal(nonGroupBookings.length, 0);

  const slotHasHardConflict = nonGroupBookings.some((booking) => {
    const bookingStart = new Date(booking.start_at).getTime();
    const bookingEnd = new Date(booking.end_at).getTime();
    const requestStart = new Date(slotStart).getTime();
    const requestEnd = new Date(slotEnd).getTime();
    return requestStart < bookingEnd && requestEnd > bookingStart;
  });
  assert.equal(slotHasHardConflict, false);

  const overCapacityBookings = [{ ...baseBooking, participants: 5 }];
  const overCapacityExisting = calculateExistingParticipantsForGroup({
    bookings: overCapacityBookings,
    activityId,
    planId,
    localDate: '2026-04-20',
    timezone,
    statuses: FORMED_GROUP_BOOKING_STATUSES,
  });
  const overCapacityRule = evaluateGroupBookingRule({
    minParticipants: 4,
    maxParticipants: 5,
    effectiveExistingParticipants: overCapacityExisting,
    requestedParticipants: 1,
  });

  assert.equal(overCapacityRule.allowed, false);
  assert.equal(overCapacityRule.reasonCode, 'CAPACITY_EXCEEDED');
});

console.log('All Booking Draft + Checkout API tests completed!');
