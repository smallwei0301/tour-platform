import { getDateStringInTimezone, rangesOverlap, type AvailabilityRule, type BlackoutWindow, type ExistingBooking } from '../slot-generator.ts';
import { findMatchingConflictOverride, type GuideSlotConflictOverride } from './conflict-override.ts';

export type CanonicalAvailabilityState =
  | 'available'
  | 'full'
  | 'closed'
  | 'blackout'
  | 'inactive_plan'
  | 'outside_rule'
  | 'outside_season'
  | 'blocked_by_conflict'
  | 'allowed_with_admin_override';

export interface ActivityPlanSeason {
  id: string;
  activity_plan_id: string;
  start_month: number;
  start_day: number;
  end_month: number;
  end_day: number;
  timezone?: string | null;
  is_active: boolean;
}

const NON_BLOCKING_BOOKING_STATUSES = new Set(['cancelled', 'failed', 'expired']);

function monthDayToNumber(month: number, day: number): number {
  return month * 100 + day;
}

function isWithinSeason(dateMonth: number, dateDay: number, season: ActivityPlanSeason): boolean {
  const dateValue = monthDayToNumber(dateMonth, dateDay);
  const start = monthDayToNumber(season.start_month, season.start_day);
  const end = monthDayToNumber(season.end_month, season.end_day);

  if (start <= end) {
    return dateValue >= start && dateValue <= end;
  }

  return dateValue >= start || dateValue <= end;
}

function isInAnyActiveSeason(params: {
  requestedStartAt: string;
  timezone: string;
  seasons: ActivityPlanSeason[];
  isYearRound?: boolean;
}): { inSeason: boolean; reason: 'no_active_season' | 'outside_season' | 'inside_season' | 'explicit_year_round' } {
  const activeSeasons = params.seasons.filter((season) => season.is_active);
  // Issue #1239 product decision: when no active season rows exist, the plan
  // is 全部開放 / all-year open. Explicit active season windows still restrict
  // outside dates. We still surface a distinct reason so the caller can
  // tell:
  //   - `'explicit_year_round'` — admin actively flipped the year-round flag
  //     (PR #1230's contract: surface the marker so the UI can show 「全年
  //     開放」). Both inSeason and reason carry through.
  //   - `'no_active_season'`  — no season rows / all paused; same effective
  //     behaviour as year-round (inSeason: true), distinct reason so the UI
  //     can hint "請設定季節限制" if it wants. Per #1239 this stays
  //     fail-open — admins should not have to set a year-round flag to make
  //     a brand-new plan bookable.
  if (activeSeasons.length === 0) {
    if (params.isYearRound) {
      return { inSeason: true, reason: 'explicit_year_round' };
    }
    return { inSeason: true, reason: 'no_active_season' };
  }

  const localDate = getDateStringInTimezone(new Date(params.requestedStartAt), params.timezone);
  const [year, month, day] = localDate.split('-').map(Number);
  void year;

  const inSeason = activeSeasons.some((season) => isWithinSeason(month, day, season));
  return { inSeason, reason: inSeason ? 'inside_season' : 'outside_season' };
}

function hasBlockingBookingConflict(params: {
  requestedStartAt: string;
  requestedEndAt?: string;
  bookings: ExistingBooking[];
}): boolean {
  if (!params.requestedEndAt) return false;

  const requestedStart = new Date(params.requestedStartAt);
  const requestedEnd = new Date(params.requestedEndAt);

  return params.bookings.some((booking) => {
    if (NON_BLOCKING_BOOKING_STATUSES.has(String(booking.status || '').toLowerCase())) {
      return false;
    }

    return rangesOverlap(requestedStart, requestedEnd, new Date(booking.start_at), new Date(booking.end_at));
  });
}

export function resolveCanonicalAvailabilityState(params: {
  guideId?: string;
  activityId?: string;
  planId?: string;
  requestedStartAt: string;
  requestedEndAt?: string;
  timezone: string;
  rules: AvailabilityRule[];
  blackouts: BlackoutWindow[];
  bookings: ExistingBooking[];
  seasons: ActivityPlanSeason[];
  seasonGateEnabled?: boolean;
  isYearRound?: boolean;
  planStatus: string;
  slotAvailable: boolean;
  slotUnavailableReason?: string;
  capacityAvailable: boolean;
  conflictOverrides?: GuideSlotConflictOverride[];
}): { state: CanonicalAvailabilityState; metadata?: Record<string, string> } {
  const normalizedPlanStatus = String(params.planStatus || '').trim().toLowerCase();
  if (normalizedPlanStatus && normalizedPlanStatus !== 'active') {
    return { state: 'inactive_plan' };
  }

  let seasonGateMetadata: Record<string, string> | undefined;
  if (params.seasonGateEnabled) {
    const seasonGate = isInAnyActiveSeason({
      requestedStartAt: params.requestedStartAt,
      timezone: params.timezone,
      seasons: params.seasons,
      isYearRound: params.isYearRound,
    });
    if (!seasonGate.inSeason) {
      return {
        state: 'outside_season',
        metadata: { seasonGate: seasonGate.reason },
      };
    }
    if (seasonGate.reason === 'explicit_year_round') {
      seasonGateMetadata = { seasonGate: seasonGate.reason };
    }
  }

  if (params.rules.length === 0) {
    return { state: 'outside_rule' };
  }

  if (params.slotUnavailableReason === 'BLACKOUT_CONFLICT') {
    return { state: 'blackout' };
  }

  if (params.slotUnavailableReason === 'BOOKING_CONFLICT' || hasBlockingBookingConflict(params)) {
    const matchedOverride =
      params.guideId && params.activityId && params.planId
        ? findMatchingConflictOverride({
            guideId: params.guideId,
            activityId: params.activityId,
            planId: params.planId,
            requestedStartAt: params.requestedStartAt,
            requestedEndAt: params.requestedEndAt,
            overrides: params.conflictOverrides,
          })
        : null;

    if (matchedOverride) {
      return {
        state: 'allowed_with_admin_override',
        metadata: {
          overrideId: matchedOverride.id,
          overrideReason: matchedOverride.reason,
          helperStatus: matchedOverride.helper_status,
          requiresHelper: matchedOverride.requires_helper ? 'true' : 'false',
          createdByAdminEmail: matchedOverride.created_by_admin_email ?? '',
        },
      };
    }

    return { state: 'blocked_by_conflict' };
  }

  if (params.slotAvailable) {
    return seasonGateMetadata ? { state: 'available', metadata: seasonGateMetadata } : { state: 'available' };
  }

  if (!params.capacityAvailable) {
    return { state: 'full' };
  }

  return { state: 'closed' };
}
