import type { ExistingBooking } from '../slot-generator';

export const FORMED_GROUP_BOOKING_STATUSES = [
  'pending_confirmation',
  'confirmed',
  'reschedule_requested',
] as const;

export const CAPACITY_HOLD_BOOKING_STATUSES = [
  'draft',
  ...FORMED_GROUP_BOOKING_STATUSES,
] as const;

export type GroupRuleReasonCode =
  | 'MIN_PARTICIPANTS_NOT_MET'
  | 'GROUP_NOT_FORMED_NEEDS_MORE_PARTICIPANTS'
  | 'CAPACITY_EXCEEDED';

export interface GroupBookingRuleInput {
  minParticipants: number;
  maxParticipants: number;
  effectiveExistingParticipants: number;
  requestedParticipants: number;
}

export interface GroupBookingRuleResult {
  allowed: boolean;
  formed: boolean;
  remainingCapacity: number;
  minParticipantsNeeded: number;
  reasonCode?: GroupRuleReasonCode;
  messageZh?: string;
}

export interface ExistingParticipantsInput {
  bookings: ExistingBooking[];
  activityId: string;
  planId: string;
  localDate: string;
  timezone: string;
  statuses: readonly string[];
}

export interface GroupDateBookingFilterInput {
  bookings: ExistingBooking[];
  activityId: string;
  planId: string;
  localDate: string;
  timezone: string;
}

export interface GroupDateRangeBookingFilterInput {
  bookings: ExistingBooking[];
  activityId: string;
  planId: string;
  dateFrom: string;
  dateTo: string;
  timezone: string;
}

export function normalizeBookingParticipants(value: unknown): number {
  if (value === null || value === undefined) {
    return 1;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return Math.floor(parsed);
}

export function getLocalDateInTimezone(dateTime: string, timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: timezone,
  });
  return formatter.format(new Date(dateTime));
}

export function calculateExistingParticipantsForGroup({
  bookings,
  activityId,
  planId,
  localDate,
  timezone,
  statuses,
}: ExistingParticipantsInput): number {
  const statusSet = new Set(statuses);

  return bookings.reduce((sum, booking) => {
    if (!statusSet.has(booking.status)) return sum;
    if (booking.activity_id !== activityId) return sum;
    if (booking.activity_plan_id !== planId) return sum;

    const bookingDate = getLocalDateInTimezone(booking.start_at, timezone);
    if (bookingDate !== localDate) return sum;

    return sum + normalizeBookingParticipants(booking.participants);
  }, 0);
}

export function excludeSameActivityPlanDateBookings({
  bookings,
  activityId,
  planId,
  localDate,
  timezone,
}: GroupDateBookingFilterInput): ExistingBooking[] {
  return bookings.filter((booking) => {
    if (booking.activity_id !== activityId) return true;
    if (booking.activity_plan_id !== planId) return true;
    return getLocalDateInTimezone(booking.start_at, timezone) !== localDate;
  });
}

export function excludeSameActivityPlanDateRangeBookings({
  bookings,
  activityId,
  planId,
  dateFrom,
  dateTo,
  timezone,
}: GroupDateRangeBookingFilterInput): ExistingBooking[] {
  return bookings.filter((booking) => {
    if (booking.activity_id !== activityId) return true;
    if (booking.activity_plan_id !== planId) return true;

    const bookingLocalDate = getLocalDateInTimezone(booking.start_at, timezone);
    return bookingLocalDate < dateFrom || bookingLocalDate > dateTo;
  });
}

export function evaluateGroupBookingRule({
  minParticipants,
  maxParticipants,
  effectiveExistingParticipants,
  requestedParticipants,
}: GroupBookingRuleInput): GroupBookingRuleResult {
  const safeMin = Number.isFinite(minParticipants) && minParticipants > 0 ? Math.floor(minParticipants) : 1;
  const safeMax = Number.isFinite(maxParticipants) && maxParticipants > 0 ? Math.floor(maxParticipants) : safeMin;
  const safeExisting = Number.isFinite(effectiveExistingParticipants) && effectiveExistingParticipants > 0
    ? Math.floor(effectiveExistingParticipants)
    : 0;
  const safeRequested = Number.isFinite(requestedParticipants) && requestedParticipants > 0
    ? Math.floor(requestedParticipants)
    : 0;

  const formed = safeExisting >= safeMin;
  const totalAfterRequest = safeExisting + safeRequested;
  const remainingCapacity = Math.max(0, safeMax - safeExisting);

  if (totalAfterRequest > safeMax) {
    return {
      allowed: false,
      formed,
      remainingCapacity,
      minParticipantsNeeded: 0,
      reasonCode: 'CAPACITY_EXCEEDED',
      messageZh: `此行程最多 ${safeMax} 人，當前時段剩餘 ${remainingCapacity} 人可預訂`,
    };
  }

  if (!formed && totalAfterRequest < safeMin) {
    const needed = safeMin - totalAfterRequest;

    return {
      allowed: false,
      formed: false,
      remainingCapacity,
      minParticipantsNeeded: needed,
      reasonCode: safeExisting === 0 ? 'MIN_PARTICIPANTS_NOT_MET' : 'GROUP_NOT_FORMED_NEEDS_MORE_PARTICIPANTS',
      messageZh:
        safeExisting === 0
          ? `此行程最少 ${safeMin} 人成團，請至少選擇 ${safeMin} 人`
          : `此行程尚未成團，需補足至少 ${needed} 人`,
    };
  }

  return {
    allowed: true,
    formed,
    remainingCapacity,
    minParticipantsNeeded: 0,
  };
}
