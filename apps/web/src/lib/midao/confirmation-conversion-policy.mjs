/** Shared pure conversion policy; no mutable runtime or gateway dependency. */
import { validateInquiryConversion } from './inquiry-conversion.ts';
import { UUID_PATTERN } from './confirmation-values.mjs';
import { MidaoRouteError } from './route-errors.ts';

const SAFE_MESSAGES = {
  NOT_FOUND: 'Resource not found',
  INQUIRY_ALREADY_CONVERTED: 'Inquiry was already converted',
  INQUIRY_STATE_NOT_CONVERTIBLE: 'Inquiry state does not allow conversion',
  PLAN_INACTIVE: 'Activity plan is not active',
  PLAN_BOOKING_TYPE_NOT_REQUEST: 'Activity plan does not accept inquiry conversion',
  PARTICIPANTS_BELOW_PLAN_MIN: 'Participants are below the plan minimum',
  PARTICIPANTS_ABOVE_PLAN_MAX: 'Participants exceed the plan maximum',
  CAPACITY_EXCEEDED: 'Requested date is fully booked',
  IDEMPOTENCY_CONFLICT: 'Idempotency key was already used for a different request',
  IDEMPOTENCY_IN_PROGRESS: 'A request with this Idempotency-Key is already processing',
  INVALID_INQUIRY_ID: 'Invalid inquiry id',
  INVALID_PLAN_ID: 'Invalid activity plan id',
};

export const ERROR_STATUS = {
  NOT_FOUND: 404,
  INQUIRY_ALREADY_CONVERTED: 409,
  INQUIRY_STATE_NOT_CONVERTIBLE: 409,
  PLAN_INACTIVE: 409,
  PLAN_BOOKING_TYPE_NOT_REQUEST: 409,
  PARTICIPANTS_BELOW_PLAN_MIN: 409,
  PARTICIPANTS_ABOVE_PLAN_MAX: 409,
  CAPACITY_EXCEEDED: 409,
  IDEMPOTENCY_CONFLICT: 409,
  IDEMPOTENCY_IN_PROGRESS: 409,
  INVALID_INQUIRY_ID: 422,
  INVALID_PLAN_ID: 422,
};

const VIOLATION_COLLAPSE_TO_NOT_FOUND = new Set([
  'INQUIRY_GUIDE_MISMATCH',
  'PLAN_GUIDE_MISMATCH',
  'PLAN_ACTIVITY_MISMATCH',
  'PLAN_NOT_FOUND_IN_INPUT',
]);
const VIOLATION_CONFLICT_CODES = new Set([
  'PLAN_BOOKING_TYPE_NOT_REQUEST',
  'PLAN_INACTIVE',
  'INQUIRY_STATE_NOT_CONVERTIBLE',
  'INQUIRY_ALREADY_CONVERTED',
]);

export function routeError(code) {
  return new MidaoRouteError(code, SAFE_MESSAGES[code] ?? 'Request rejected', ERROR_STATUS[code] ?? 422);
}

export function notFound() {
  return routeError('NOT_FOUND');
}

export function unexpected(message = 'Midao inquiry conversion backend failure') {
  const error = new Error(message);
  error.name = 'MidaoInquiryConversionBackendError';
  return error;
}

function commandProjection(command) {
  return {
    activityPlanId: command.activityPlanId,
    startAt: command.startAt,
    endAt: command.endAt,
    participants: command.participants,
    quotedTotalTwd: command.quotedTotalTwd,
    guideNote: typeof command.guideNote === 'string' ? command.guideNote : (command.guideNote ?? null),
    confirmationTtlHours: command.confirmationTtlHours,
  };
}

/** §4.5 A 類：把 Task 37 的第一個 violation 轉成公開錯誤。 */
export function violationToRouteError(violation) {
  if (!violation) return unexpected('Midao inquiry conversion validation returned no violation');
  if (VIOLATION_COLLAPSE_TO_NOT_FOUND.has(violation.code)) return notFound();
  const status = VIOLATION_CONFLICT_CODES.has(violation.code) ? 409 : 422;
  return new MidaoRouteError(violation.code, violation.messageZh, status);
}

export function assertConversionAllowed({ inquiry, plan, command, actorGuideId }) {
  const result = validateInquiryConversion({ inquiry, plan, command: commandProjection(command), actorGuideId });
  if (result.valid) return;
  throw violationToRouteError(result.violations[0]);
}


export function normalizeUuid(value, code) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value.trim())) throw routeError(code);
  return value.trim().toLowerCase();
}
