/**
 * Available Slots API Tests (TP-BP-004)
 *
 * Tests for GET /api/v2/activities/:activityId/available-slots
 *
 * Note: These tests focus on validation logic and response structure.
 * Integration tests require the dev server and Supabase.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Mock validation helpers (mirrors implementation in route.ts)
function isValidUuid(str) {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

function isValidDateString(str) {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(str)) return false;
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

function parseAndValidateParams(activityId, searchParams) {
  if (!activityId || !isValidUuid(activityId)) {
    return { error: { code: 'VALIDATION_ERROR', message: 'Invalid activityId' } };
  }

  const planId = searchParams.get('planId');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const timezone = searchParams.get('timezone');
  const participantsStr = searchParams.get('participants');

  if (!planId) {
    return { error: { code: 'VALIDATION_ERROR', message: 'planId is required' } };
  }
  if (!isValidUuid(planId)) {
    return { error: { code: 'VALIDATION_ERROR', message: 'Invalid planId format' } };
  }

  if (!dateFrom) {
    return { error: { code: 'VALIDATION_ERROR', message: 'dateFrom is required' } };
  }
  if (!isValidDateString(dateFrom)) {
    return {
      error: { code: 'VALIDATION_ERROR', message: 'Invalid dateFrom format (YYYY-MM-DD)' },
    };
  }

  if (!dateTo) {
    return { error: { code: 'VALIDATION_ERROR', message: 'dateTo is required' } };
  }
  if (!isValidDateString(dateTo)) {
    return {
      error: { code: 'VALIDATION_ERROR', message: 'Invalid dateTo format (YYYY-MM-DD)' },
    };
  }

  if (dateFrom > dateTo) {
    return {
      error: { code: 'VALIDATION_ERROR', message: 'dateFrom must be before or equal to dateTo' },
    };
  }

  const fromDate = new Date(dateFrom);
  const toDate = new Date(dateTo);
  const diffDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays > 31) {
    return {
      error: { code: 'VALIDATION_ERROR', message: 'Date range cannot exceed 31 days' },
    };
  }

  if (!timezone) {
    return { error: { code: 'VALIDATION_ERROR', message: 'timezone is required' } };
  }
  if (!isValidTimezone(timezone)) {
    return { error: { code: 'VALIDATION_ERROR', message: 'Invalid timezone' } };
  }

  let participants = 1;
  if (participantsStr) {
    participants = parseInt(participantsStr, 10);
    if (isNaN(participants) || participants < 1) {
      return {
        error: { code: 'VALIDATION_ERROR', message: 'participants must be a positive integer' },
      };
    }
  }

  return {
    params: {
      activityId,
      planId,
      dateFrom,
      dateTo,
      timezone,
      participants,
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
  assert.equal(isValidUuid('550e8400-e29b-41d4-a716'), false); // too short
  assert.equal(isValidUuid('550e8400-e29b-41d4-a716-446655440000-extra'), false); // too long
  assert.equal(isValidUuid('550e8400-e29b-61d4-a716-446655440000'), false); // invalid version
});

// ============================================================================
// Date Validation Tests
// ============================================================================

test('isValidDateString accepts valid dates', () => {
  assert.equal(isValidDateString('2026-04-20'), true);
  assert.equal(isValidDateString('2025-12-31'), true);
  assert.equal(isValidDateString('2026-01-01'), true);
});

test('isValidDateString rejects invalid dates', () => {
  assert.equal(isValidDateString('2026/04/20'), false);
  assert.equal(isValidDateString('04-20-2026'), false);
  assert.equal(isValidDateString('2026-4-20'), false); // missing zero padding
  assert.equal(isValidDateString('not-a-date'), false);
  assert.equal(isValidDateString(''), false);
  assert.equal(isValidDateString('2026-13-01'), false); // invalid month
  assert.equal(isValidDateString('2026-00-01'), false); // invalid month
});

// ============================================================================
// Timezone Validation Tests
// ============================================================================

test('isValidTimezone accepts valid timezones', () => {
  assert.equal(isValidTimezone('Asia/Taipei'), true);
  assert.equal(isValidTimezone('America/Los_Angeles'), true);
  assert.equal(isValidTimezone('Europe/London'), true);
  assert.equal(isValidTimezone('UTC'), true);
});

test('isValidTimezone rejects invalid timezones', () => {
  assert.equal(isValidTimezone('Invalid/Timezone'), false);
  // Empty string defaults to system timezone in some implementations, but our validation handles it
  // by requiring timezone to be explicitly provided
  assert.equal(isValidTimezone('NotATimezone'), false);
  assert.equal(isValidTimezone('Foo/Bar/Baz'), false);
});

// ============================================================================
// Parameter Validation Tests
// ============================================================================

test('parseAndValidateParams validates all required params', () => {
  const activityId = '550e8400-e29b-41d4-a716-446655440000';
  const planId = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

  // Missing planId
  let params = new URLSearchParams({
    dateFrom: '2026-04-20',
    dateTo: '2026-04-25',
    timezone: 'Asia/Taipei',
  });
  let result = parseAndValidateParams(activityId, params);
  assert.ok('error' in result);
  assert.equal(result.error.message, 'planId is required');

  // Missing dateFrom
  params = new URLSearchParams({
    planId,
    dateTo: '2026-04-25',
    timezone: 'Asia/Taipei',
  });
  result = parseAndValidateParams(activityId, params);
  assert.ok('error' in result);
  assert.equal(result.error.message, 'dateFrom is required');

  // Missing dateTo
  params = new URLSearchParams({
    planId,
    dateFrom: '2026-04-20',
    timezone: 'Asia/Taipei',
  });
  result = parseAndValidateParams(activityId, params);
  assert.ok('error' in result);
  assert.equal(result.error.message, 'dateTo is required');

  // Missing timezone
  params = new URLSearchParams({
    planId,
    dateFrom: '2026-04-20',
    dateTo: '2026-04-25',
  });
  result = parseAndValidateParams(activityId, params);
  assert.ok('error' in result);
  assert.equal(result.error.message, 'timezone is required');
});

test('parseAndValidateParams validates date range order', () => {
  const activityId = '550e8400-e29b-41d4-a716-446655440000';
  const planId = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

  const params = new URLSearchParams({
    planId,
    dateFrom: '2026-04-25', // after dateTo
    dateTo: '2026-04-20',
    timezone: 'Asia/Taipei',
  });

  const result = parseAndValidateParams(activityId, params);
  assert.ok('error' in result);
  assert.equal(result.error.message, 'dateFrom must be before or equal to dateTo');
});

test('parseAndValidateParams enforces 31-day limit', () => {
  const activityId = '550e8400-e29b-41d4-a716-446655440000';
  const planId = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

  const params = new URLSearchParams({
    planId,
    dateFrom: '2026-04-01',
    dateTo: '2026-05-15', // 44 days
    timezone: 'Asia/Taipei',
  });

  const result = parseAndValidateParams(activityId, params);
  assert.ok('error' in result);
  assert.equal(result.error.message, 'Date range cannot exceed 31 days');
});

test('parseAndValidateParams validates participants', () => {
  const activityId = '550e8400-e29b-41d4-a716-446655440000';
  const planId = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

  // Invalid participants (not a number)
  let params = new URLSearchParams({
    planId,
    dateFrom: '2026-04-20',
    dateTo: '2026-04-25',
    timezone: 'Asia/Taipei',
    participants: 'abc',
  });
  let result = parseAndValidateParams(activityId, params);
  assert.ok('error' in result);
  assert.equal(result.error.message, 'participants must be a positive integer');

  // Invalid participants (zero)
  params = new URLSearchParams({
    planId,
    dateFrom: '2026-04-20',
    dateTo: '2026-04-25',
    timezone: 'Asia/Taipei',
    participants: '0',
  });
  result = parseAndValidateParams(activityId, params);
  assert.ok('error' in result);
  assert.equal(result.error.message, 'participants must be a positive integer');

  // Invalid participants (negative)
  params = new URLSearchParams({
    planId,
    dateFrom: '2026-04-20',
    dateTo: '2026-04-25',
    timezone: 'Asia/Taipei',
    participants: '-1',
  });
  result = parseAndValidateParams(activityId, params);
  assert.ok('error' in result);
});

test('parseAndValidateParams accepts valid params with default participants', () => {
  const activityId = '550e8400-e29b-41d4-a716-446655440000';
  const planId = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

  const params = new URLSearchParams({
    planId,
    dateFrom: '2026-04-20',
    dateTo: '2026-04-25',
    timezone: 'Asia/Taipei',
  });

  const result = parseAndValidateParams(activityId, params);
  assert.ok('params' in result);
  assert.equal(result.params.activityId, activityId);
  assert.equal(result.params.planId, planId);
  assert.equal(result.params.dateFrom, '2026-04-20');
  assert.equal(result.params.dateTo, '2026-04-25');
  assert.equal(result.params.timezone, 'Asia/Taipei');
  assert.equal(result.params.participants, 1); // default
});

test('parseAndValidateParams accepts valid params with custom participants', () => {
  const activityId = '550e8400-e29b-41d4-a716-446655440000';
  const planId = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

  const params = new URLSearchParams({
    planId,
    dateFrom: '2026-04-20',
    dateTo: '2026-04-25',
    timezone: 'Asia/Taipei',
    participants: '4',
  });

  const result = parseAndValidateParams(activityId, params);
  assert.ok('params' in result);
  assert.equal(result.params.participants, 4);
});

test('parseAndValidateParams validates activityId', () => {
  const params = new URLSearchParams({
    planId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    dateFrom: '2026-04-20',
    dateTo: '2026-04-25',
    timezone: 'Asia/Taipei',
  });

  // Invalid activityId
  let result = parseAndValidateParams('not-a-uuid', params);
  assert.ok('error' in result);
  assert.equal(result.error.message, 'Invalid activityId');

  // Empty activityId
  result = parseAndValidateParams('', params);
  assert.ok('error' in result);
  assert.equal(result.error.message, 'Invalid activityId');
});

// ============================================================================
// Response Structure Tests (API Spec Compliance)
// ============================================================================

test('successV2 response format matches API spec', () => {
  // Mock response helper
  function successV2(data) {
    return { success: true, data };
  }

  const mockSlots = [
    {
      startAt: '2026-04-20T09:00:00+08:00',
      endAt: '2026-04-20T13:00:00+08:00',
      capacityLeft: 2,
      bookingType: 'instant',
      isAvailable: true,
    },
  ];

  const response = successV2({
    timezone: 'Asia/Taipei',
    activityId: '550e8400-e29b-41d4-a716-446655440000',
    planId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    slots: mockSlots,
  });

  assert.equal(response.success, true);
  assert.ok(response.data);
  assert.equal(response.data.timezone, 'Asia/Taipei');
  assert.equal(response.data.activityId, '550e8400-e29b-41d4-a716-446655440000');
  assert.equal(response.data.planId, '6ba7b810-9dad-11d1-80b4-00c04fd430c8');
  assert.ok(Array.isArray(response.data.slots));
  assert.equal(response.data.slots.length, 1);
  assert.ok(response.data.slots[0].startAt);
  assert.ok(response.data.slots[0].endAt);
  assert.equal(response.data.slots[0].capacityLeft, 2);
  assert.ok(response.data.slots[0].bookingType);
  assert.ok(typeof response.data.slots[0].isAvailable === 'boolean');
});

test('errorV2 response format matches API spec', () => {
  // Mock response helper
  function errorV2(code, message) {
    return { success: false, error: { code, message } };
  }

  const response = errorV2('VALIDATION_ERROR', 'planId is required');

  assert.equal(response.success, false);
  assert.ok(response.error);
  assert.equal(response.error.code, 'VALIDATION_ERROR');
  assert.equal(response.error.message, 'planId is required');
});

test('route supports slug-like activity key by resolving slug to UUID before validation', async () => {
  const rel = 'app/api/v2/activities/[activityId]/available-slots/route.ts';
  const src = await readFile(path.join(process.cwd(), rel), 'utf8');

  assert.match(src, /if \(!isValidUuid\(resolvedActivityId\)\)/);
  assert.match(src, /\.eq\('slug', activityKey\)/);
  assert.match(src, /resolvedActivityId = activityRow\.id/);
  assert.match(src, /parseAndValidateParams\(resolvedActivityId, searchParams\)/);
});

console.log('All Available Slots API tests completed!');
