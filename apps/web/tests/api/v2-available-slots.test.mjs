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
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  CAPACITY_HOLD_BOOKING_STATUSES,
  FORMED_GROUP_BOOKING_STATUSES,
  calculateExistingParticipantsForGroup,
  evaluateGroupBookingRule,
  excludeSameActivityPlanDateRangeBookings,
} from '../../src/lib/availability-v2/group-booking-rule.ts';
import { buildDateAvailabilitySummary } from '../../src/lib/availability-v2/date-availability-summary.ts';
import { getAvailableSlots } from '../../app/api/v2/activities/[activityId]/available-slots/route-handler.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

// Mock validation helpers (mirrors implementation in route.ts)
function isUuidLike(str) {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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

function parseAndValidateParams(activityId, planId, searchParams) {
  if (!activityId || !isUuidLike(activityId)) {
    return { error: { code: 'VALIDATION_ERROR', message: 'Invalid activityId' } };
  }
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const timezone = searchParams.get('timezone');
  const scheduleId = searchParams.get('scheduleId');
  const participantsStr = searchParams.get('participants');

  if (!planId) {
    return { error: { code: 'VALIDATION_ERROR', message: 'planId is required' } };
  }
  if (!isUuidLike(planId)) {
    return { error: { code: 'VALIDATION_ERROR', message: 'Invalid planId format' } };
  }

  if (scheduleId && !isUuidLike(scheduleId)) {
    return { error: { code: 'VALIDATION_ERROR', message: 'Invalid scheduleId format' } };
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
      scheduleId,
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

test('isUuidLike accepts UUID and UUID-like IDs', () => {
  assert.equal(isUuidLike('550e8400-e29b-41d4-a716-446655440000'), true);
  assert.equal(isUuidLike('6ba7b810-9dad-11d1-80b4-00c04fd430c8'), true);
  assert.equal(isUuidLike('f47ac10b-58cc-4372-a567-0e02b2c3d479'), true);
  assert.equal(isUuidLike('c0000003-0000-0000-0000-000000000001'), true);
});

test('isUuidLike rejects invalid IDs', () => {
  assert.equal(isUuidLike('not-a-uuid'), false);
  assert.equal(isUuidLike(''), false);
  assert.equal(isUuidLike('550e8400-e29b-41d4-a716'), false); // too short
  assert.equal(isUuidLike('550e8400-e29b-41d4-a716-446655440000-extra'), false); // too long
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
  let result = parseAndValidateParams(activityId, '', params);
  assert.ok('error' in result);
  assert.equal(result.error.message, 'planId is required');

  // Missing dateFrom
  params = new URLSearchParams({
    planId,
    dateTo: '2026-04-25',
    timezone: 'Asia/Taipei',
  });
  result = parseAndValidateParams(activityId, planId, params);
  assert.ok('error' in result);
  assert.equal(result.error.message, 'dateFrom is required');

  // Missing dateTo
  params = new URLSearchParams({
    planId,
    dateFrom: '2026-04-20',
    timezone: 'Asia/Taipei',
  });
  result = parseAndValidateParams(activityId, planId, params);
  assert.ok('error' in result);
  assert.equal(result.error.message, 'dateTo is required');

  // Missing timezone
  params = new URLSearchParams({
    planId,
    dateFrom: '2026-04-20',
    dateTo: '2026-04-25',
  });
  result = parseAndValidateParams(activityId, planId, params);
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

  const result = parseAndValidateParams(activityId, planId, params);
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

  const result = parseAndValidateParams(activityId, planId, params);
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
  let result = parseAndValidateParams(activityId, planId, params);
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
  result = parseAndValidateParams(activityId, planId, params);
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
  result = parseAndValidateParams(activityId, planId, params);
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

  const result = parseAndValidateParams(activityId, planId, params);
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

  const result = parseAndValidateParams(activityId, planId, params);
  assert.ok('params' in result);
  assert.equal(result.params.participants, 4);
});

test('parseAndValidateParams validates activityId', () => {
  const planId = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
  const params = new URLSearchParams({
    planId,
    dateFrom: '2026-04-20',
    dateTo: '2026-04-25',
    timezone: 'Asia/Taipei',
  });

  // Invalid activityId
  let result = parseAndValidateParams('not-a-uuid', planId, params);
  assert.ok('error' in result);
  assert.equal(result.error.message, 'Invalid activityId');

  // Empty activityId
  result = parseAndValidateParams('', planId, params);
  assert.ok('error' in result);
  assert.equal(result.error.message, 'Invalid activityId');

  // UUID-like fixture activityId should pass validation
  result = parseAndValidateParams('c0000003-0000-0000-0000-000000000001', planId, params);
  assert.ok('params' in result);
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

test('GH-1069: dateAvailability selected slot payload keeps displayed capacity aligned with submitted slot startAt', () => {
  const dateAvailability = buildDateAvailabilitySummary({
    dateFrom: '2026-06-01',
    dateTo: '2026-06-01',
    timezone: 'Asia/Taipei',
    slots: [
      {
        startAt: '2026-06-01T09:00:00+08:00',
        endAt: '2026-06-01T12:00:00+08:00',
        capacityLeft: 2,
        bookingType: 'instant',
        isAvailable: true,
      },
      {
        startAt: '2026-06-01T13:00:00+08:00',
        endAt: '2026-06-01T16:00:00+08:00',
        capacityLeft: 5,
        bookingType: 'instant',
        isAvailable: true,
      },
    ],
  });

  assert.equal(dateAvailability.length, 1);
  const [entry] = dateAvailability;
  assert.equal(entry.state, 'available');
  assert.equal(entry.firstAvailableStartAt, '2026-06-01T09:00:00+08:00');
  assert.equal(entry.capacityLeft, 2);
  assert.deepEqual(entry.selectedSlot, {
    startAt: '2026-06-01T09:00:00+08:00',
    endAt: '2026-06-01T12:00:00+08:00',
    capacityLeft: 2,
    bookingType: 'instant',
    isAvailable: true,
  });
});

test('route resolves slug activity key and delegates plan resolution to canonical resolver (#882)', async () => {
  const rel = 'app/api/v2/activities/[activityId]/available-slots/route-handler.ts';
  const src = await readFile(path.join(ROOT, rel), 'utf8');

  // Activity slug → UUID resolution stays inline (legacy contract).
  assert.match(src, /const activityIdLookupColumn = isUuidLike\(activityKey\) \? 'id' : 'slug'/);
  assert.match(src, /\.eq\(activityIdLookupColumn, activityKey\)/);
  assert.match(src, /resolvedActivityId = activityRow\.id/);

  // Plan resolution is now delegated to the canonical resolver (#882) instead
  // of an inline `if (!isUuidLike(resolvedPlanId))` block; this guards against
  // future regressions where someone might add a route-local fallback.
  assert.match(src, /const planKey = searchParams\.get\('planId'\)/);
  assert.match(src, /resolveBookingPlan\(supabase, \{/);
  assert.match(src, /const resolvedPlanId = resolved\.planId/);

  assert.match(src, /parseAndValidateParams\(resolvedActivityId, resolvedPlanId, searchParams\)/);
});

test('route supports optional scheduleId mapping + validation for legacy public URL flow', async () => {
  const rel = 'app/api/v2/activities/[activityId]/available-slots/route-handler.ts';
  const src = await readFile(path.join(ROOT, rel), 'utf8');

  assert.match(src, /const scheduleId = searchParams\.get\('scheduleId'\)/);
  assert.match(src, /if \(scheduleId && !isUuidLike\(scheduleId\)\)/);
  assert.match(src, /\.from\('activity_schedules'\)/);
  assert.match(src, /\.eq\('id', params\.scheduleId\)/);
  assert.match(src, /\.eq\('activity_id', params\.activityId\)/);
  assert.match(src, /inDateRange\s*=\s*scheduleLocalDate\s*>=\s*params\.dateFrom\s*&&\s*scheduleLocalDate\s*<=\s*params\.dateTo/);
  assert.match(src, /planMatches\s*=\s*!scheduleData\.plan_id\s*\|\|\s*scheduleData\.plan_id\s*===\s*params\.planId/);
  // #910: selectedPlan metadata for Booking V2 UI must come from planData,
  assert.match(src, /slots:\s*availability\.slots/);
  assert.match(src, /dateAvailability/);
  assert.match(src, /dates:\s*dateAvailability/);
  assert.match(src, /buildDateAvailabilitySummary\(/);
  assert.match(src, /selectedPlan:\s*\{/);
  assert.match(src, /id:\s*planData\.id/);
  assert.match(src, /name:\s*planData\.name/);
  assert.match(src, /priceType:\s*planData\.price_type/);
  assert.match(src, /basePrice:\s*planData\.base_price/);
  assert.match(src, /minParticipants:\s*planData\.min_participants/);
  assert.match(src, /maxParticipants:\s*planData\.max_participants/);
});

test('issue838: legacy_plan_id lookup must not hard-require status=active (status-null formal rows are valid)', async () => {
  const rel = 'src/lib/booking-plan-resolver.ts';
  const src = await readFile(path.join(ROOT, rel), 'utf8');

  const legacyLookupStart = src.indexOf(".eq('legacy_plan_id', legacyPlanId)");
  assert.ok(legacyLookupStart >= 0, 'must keep legacy_plan_id fallback lookup');

  const legacyLookupWindow = src.slice(legacyLookupStart, legacyLookupStart + 320);
  assert.equal(
    legacyLookupWindow.includes(".eq('status', 'active')"),
    false,
    'legacy_plan_id lookup must not exclude status-null formal rows by forcing status=active'
  );
  assert.match(src, /function isResolvablePlanStatus\(status: string \| null \| undefined\): boolean/);
});

test('parseAndValidateParams rejects invalid scheduleId format', () => {
  const activityId = '550e8400-e29b-41d4-a716-446655440000';
  const planId = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

  const params = new URLSearchParams({
    planId,
    scheduleId: 'legacy-schedule-slug',
    dateFrom: '2026-04-20',
    dateTo: '2026-04-25',
    timezone: 'Asia/Taipei',
  });

  const result = parseAndValidateParams(activityId, planId, params);
  assert.ok('error' in result);
  assert.equal(result.error.message, 'Invalid scheduleId format');
});

test('group rule enforces unformed-group min participants and Chinese copy contract', () => {
  const out = evaluateGroupBookingRule({
    minParticipants: 4,
    maxParticipants: 8,
    effectiveExistingParticipants: 0,
    requestedParticipants: 2,
  });

  assert.equal(out.allowed, false);
  assert.equal(out.reasonCode, 'MIN_PARTICIPANTS_NOT_MET');
  assert.match(out.messageZh ?? '', /最少\s*4\s*人成團/);
});

test('behavior: available-slots filters out slots when capacity-hold bookings would exceed plan max', () => {
  const guideId = 'guide_001';
  const activityId = 'activity_001';
  const planId = 'plan_001';
  const timezone = 'Asia/Taipei';

  const bookings = [
    {
      id: 'existing_formed_group',
      guide_id: guideId,
      start_at: '2026-04-20T01:00:00Z',
      end_at: '2026-04-20T05:00:00Z',
      status: 'confirmed',
      participants: 4,
      activity_id: activityId,
      activity_plan_id: planId,
    },
    {
      id: 'existing_draft_hold',
      guide_id: guideId,
      start_at: '2026-04-20T01:00:00Z',
      end_at: '2026-04-20T05:00:00Z',
      status: 'draft',
      participants: 3,
      activity_id: activityId,
      activity_plan_id: planId,
    },
  ];

  const effectiveExistingForFormed = calculateExistingParticipantsForGroup({
    bookings,
    activityId,
    planId,
    localDate: '2026-04-20',
    timezone,
    statuses: FORMED_GROUP_BOOKING_STATUSES,
  });

  const effectiveExistingForCapacityHold = calculateExistingParticipantsForGroup({
    bookings,
    activityId,
    planId,
    localDate: '2026-04-20',
    timezone,
    statuses: CAPACITY_HOLD_BOOKING_STATUSES,
  });

  const formedRule = evaluateGroupBookingRule({
    minParticipants: 4,
    maxParticipants: 5,
    effectiveExistingParticipants: effectiveExistingForFormed,
    requestedParticipants: 1,
  });
  const capacityHoldRule = evaluateGroupBookingRule({
    minParticipants: 4,
    maxParticipants: 5,
    effectiveExistingParticipants: effectiveExistingForCapacityHold,
    requestedParticipants: 1,
  });

  assert.equal(effectiveExistingForFormed, 4);
  assert.equal(effectiveExistingForCapacityHold, 7);
  assert.equal(formedRule.allowed, true);
  assert.equal(capacityHoldRule.allowed, false);
  assert.equal(capacityHoldRule.reasonCode, 'CAPACITY_EXCEEDED');
});

function createMockQueryBuilder(rows) {
  let data = rows;

  return {
    eq(column, value) {
      data = data.filter((row) => row[column] === value);
      return this;
    },

    or(expression) {
      if (expression.includes('plan_id.is.null,plan_id.eq.')) {
        const [, targetPlanId] = expression.split('plan_id.eq.');
        data = data.filter(
          (row) => row.plan_id == null || row.plan_id === targetPlanId,
        );
        return this;
      }

      if (expression.includes('activity_plan_id.is.null,activity_plan_id.eq.')) {
        const [, targetPlanId] = expression.split('activity_plan_id.eq.');
        data = data.filter(
          (row) => row.activity_plan_id == null || row.activity_plan_id === targetPlanId,
        );
        return this;
      }

      return this;
    },

    in(column, values) {
      const normalized = new Set(values);
      data = data.filter((row) => normalized.has(row[column]));
      return this;
    },

    select() {
      return this;
    },

    then(resolve, reject) {
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    },

    maybeSingle() {
      const first = data[0] ?? null;
      return Promise.resolve({ data: first, error: null });
    },

    single() {
      const first = data[0] ?? null;
      return Promise.resolve({
        data: first,
        error: first ? null : { message: 'not found' },
      });
    },
  };
}

function createMockSupabaseClient(seed) {
  return {
    from(tableName) {
      const rows = seed[tableName] ?? [];
      return createMockQueryBuilder(rows);
    },
  };
}

test('behavior: available-slots keeps same-plan/date slot for formed-group 1-person add-on', () => {
  const guideId = 'guide_001';
  const activityId = 'activity_001';
  const planId = 'plan_001';
  const timezone = 'Asia/Taipei';

  const bookings = [
    {
      id: 'existing_formed_group',
      guide_id: guideId,
      start_at: '2026-04-20T01:00:00Z',
      end_at: '2026-04-20T05:00:00Z',
      status: 'confirmed',
      participants: 4,
      activity_id: activityId,
      activity_plan_id: planId,
    },
  ];

  const filtered = excludeSameActivityPlanDateRangeBookings({
    bookings,
    activityId,
    planId,
    dateFrom: '2026-04-20',
    dateTo: '2026-04-20',
    timezone,
  });
  assert.equal(filtered.length, 0);

  const effectiveExistingParticipants = calculateExistingParticipantsForGroup({
    bookings,
    activityId,
    planId,
    localDate: '2026-04-20',
    timezone,
    statuses: FORMED_GROUP_BOOKING_STATUSES,
  });

  const groupRule = evaluateGroupBookingRule({
    minParticipants: 4,
    maxParticipants: 6,
    effectiveExistingParticipants,
    requestedParticipants: 1,
  });

  const slot = {
    startAt: new Date('2026-04-20T01:00:00Z'),
    endAt: new Date('2026-04-20T05:00:00Z'),
  };

  const hasConflict = filtered.some((booking) => {
    const bookingStart = new Date(booking.start_at);
    const bookingEnd = new Date(booking.end_at);
    return slot.startAt < bookingEnd && slot.endAt > bookingStart;
  });

  assert.equal(groupRule.allowed, true);
  assert.equal(hasConflict, false);
});

test('selected-plan metadata from issue-910 fixture appears in successful response', async () => {
  const activityId = '57ad7d45-4fb1-4ed5-b860-72330b9afd1b';
  const planId = '57ad7d45-4fb1-4ed5-b860-72330b9afd1b';
  const timezone = 'Asia/Taipei';

  const mockDb = {
    activities: [
      {
        id: activityId,
        guide_id: 'guide_910',
        activities: {
          id: activityId,
          guide_id: 'guide_910',
        },
      },
    ],
    activity_plans: [
      {
        id: planId,
        activity_id: activityId,
        duration_minutes: 60,
        min_participants: 1,
        max_participants: 99,
        booking_type: 'scheduled',
        status: 'active',
        name: 'Test',
        price_type: 'per_person',
        base_price: 20,
        activities: {
          id: activityId,
          guide_id: 'guide_910',
        },
      },
    ],
    guide_availability_rules: [],
    guide_blackout_dates: [],
    bookings: [],
  };

  const response = await getAvailableSlots(
    {
      nextUrl: new URL(
        `https://example.com/api/v2/activities/${activityId}/available-slots?planId=${planId}&dateFrom=2026-05-01&dateTo=2026-05-01&timezone=${encodeURIComponent(
          timezone,
        )}&participants=1`,
      ),
    },
    { params: Promise.resolve({ activityId }) },
    {
      createClient: async () => createMockSupabaseClient(mockDb),
    },
  );

  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.success, true);

  const selectedPlan = json?.data?.selectedPlan;
  assert.equal(selectedPlan?.name, 'Test');
  assert.equal(selectedPlan?.label, 'Test');
  assert.equal(selectedPlan?.displayName, 'Test');
  assert.equal(selectedPlan?.basePrice, 20);
  assert.notEqual(selectedPlan?.basePrice, 1800);
  assert.equal(selectedPlan?.bookingType, 'scheduled');
  assert.deepStrictEqual(Object.keys(selectedPlan).sort(), [
    'basePrice',
    'bookingType',
    'displayName',
    'id',
    'label',
    'maxParticipants',
    'minParticipants',
    'name',
    'priceType',
  ]);
});

test('available-slots: resolved active formal plan without guide returns safe NOT_BOOKABLE contract', async () => {
  const activityId = '57ad7d45-4fb1-4ed5-b860-72330b9afd1b';
  const planId = '57ad7d45-4fb1-4ed5-b860-72330b9afd1b';
  const mockDb = {
    activities: [{ id: activityId }],
    activity_plans: [
      {
        id: planId,
        activity_id: activityId,
        duration_minutes: 60,
        min_participants: 1,
        max_participants: 8,
        booking_type: 'instant',
        status: 'active',
        name: 'Unassigned guide plan',
        price_type: 'per_person',
        base_price: 20,
        activities: { id: activityId, guide_id: null },
      },
    ],
  };

  const response = await getAvailableSlots(
    {
      nextUrl: new URL(
        `https://example.com/api/v2/activities/${activityId}/available-slots?planId=${planId}&dateFrom=2026-05-01&dateTo=2026-05-01&timezone=Asia%2FTaipei&participants=1`,
      ),
    },
    { params: Promise.resolve({ activityId }) },
    { createClient: async () => createMockSupabaseClient(mockDb) },
  );

  assert.equal(response.status, 409);
  const json = await response.json();
  assert.equal(json.success, false);
  assert.equal(json.error?.code, 'NOT_BOOKABLE');
  assert.match(json.error?.message ?? '', /not currently available for booking/i);
  assert.equal(json.data, undefined);
  assert.equal(JSON.stringify(json).includes('slots'), false);
  assert.doesNotMatch(JSON.stringify(json), /guide_id|token|secret|supabase|postgres|database/i);
});

test('GH-923 RED: selectedSchedule must not bypass overlap hold conflict from other activity/plan', async () => {
  const activityId = '57ad7d45-4fb1-4ed5-b860-72330b9afd1b';
  const planId = 'f50048b1-a10f-4539-85b1-77ca1b3d8094';
  const scheduleId = 'd7096f9b-6162-4b6e-b50e-6c23bd2ce627';
  const timezone = 'Asia/Taipei';
  const slotStart = '2026-06-01T01:00:00.000Z';
  const slotEnd = '2026-06-01T02:00:00.000Z';

  const mockDb = {
    activities: [{ id: activityId, guide_id: 'guide_923' }],
    activity_schedules: [
      {
        id: scheduleId,
        activity_id: activityId,
        plan_id: null,
        start_at: slotStart,
        end_at: slotEnd,
        capacity: 10,
        booked_count: 0,
        status: 'open',
      },
    ],
    activity_plans: [
      {
        id: planId,
        activity_id: activityId,
        duration_minutes: 60,
        min_participants: 1,
        max_participants: 10,
        booking_type: 'scheduled',
        status: 'active',
        name: 'GH923 Plan',
        price_type: 'per_person',
        base_price: 1000,
        activities: { id: activityId, guide_id: 'guide_923' },
      },
    ],
    guide_availability_rules: [
      {
        id: 'rule_923',
        guide_id: 'guide_923',
        activity_plan_id: null,
        weekday: 1,
        start_time_local: '09:00',
        end_time_local: '18:00',
        timezone,
        slot_interval_minutes: 60,
        buffer_before_minutes: 0,
        buffer_after_minutes: 0,
        effective_from: null,
        effective_to: null,
        is_active: true,
      },
    ],
    guide_blackout_dates: [],
    bookings: [
      {
        id: 'overlap_hold_other_plan',
        guide_id: 'guide_923',
        start_at: slotStart,
        end_at: slotEnd,
        status: 'draft',
        participants: 2,
        activity_id: 'other-activity',
        activity_plan_id: 'other-plan',
      },
    ],
  };

  const response = await getAvailableSlots(
    {
      nextUrl: new URL(
        `https://example.com/api/v2/activities/${activityId}/available-slots?planId=${planId}&scheduleId=${scheduleId}&dateFrom=2026-06-01&dateTo=2026-06-01&timezone=${encodeURIComponent(
          timezone,
        )}&participants=4`,
      ),
    },
    { params: Promise.resolve({ activityId }) },
    {
      createClient: async () => createMockSupabaseClient(mockDb),
    },
  );

  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.success, true);
  assert.deepEqual(
    json.data.slots,
    [],
    'overlapping draft hold should suppress selectedSchedule slot in available-slots response',
  );
});

console.log('All Available Slots API tests completed!');
