/**
 * GET /api/v2/activities/:activityId/available-slots
 *
 * Available Slots API (TP-BP-004)
 * Returns available booking slots for an activity plan.
 *
 * Query params:
 *   - planId (required): Activity plan UUID or plan slug
 *   - dateFrom (required): Start date YYYY-MM-DD
 *   - dateTo (required): End date YYYY-MM-DD
 *   - timezone (required): IANA timezone (e.g., Asia/Taipei)
 *   - participants (optional): Number of participants (default: 1)
 */

import type { NextRequest } from 'next/server';
import { successV2, errorV2 } from '../../../../../../src/lib/api.ts';
import { resolveBookingPlan } from '../../../../../../src/lib/booking-plan-resolver.ts';
import type { createClient as CreateClientFn } from '../../../../../../src/lib/supabase/server.ts';
import {
  generateAvailableSlots,
  getDateStringInTimezone,
  formatDateWithTimezone,
  type AvailabilityRule,
  type BlackoutWindow,
  type ExistingBooking,
  type ActivityPlan,
  type SlotGeneratorInput,
  type SlotGeneratorDeps,
  type SerializedSlot,
} from '../../../../../../src/lib/slot-generator.ts';
import {
  CAPACITY_HOLD_BOOKING_STATUSES,
  FORMED_GROUP_BOOKING_STATUSES,
  calculateExistingParticipantsForGroup,
  evaluateGroupBookingRule,
  excludeSameActivityPlanDateRangeBookings,
  normalizeBookingParticipants,
} from '../../../../../../src/lib/availability-v2/group-booking-rule.ts';

// Validation helpers
function isUuidLike(str: string): boolean {
  const uuidLikeRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidLikeRegex.test(str);
}

function isValidDateString(str: string): boolean {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(str)) return false;
  const date = new Date(str);
  return !isNaN(date.getTime());
}

function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

type ActivityRelation = { id: string; guide_id: string };

function pickActivityRelation(
  value: ActivityRelation | ActivityRelation[] | null
): ActivityRelation | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function isManualOrSystemSource(value: unknown): value is 'manual' | 'system' {
  return value === 'manual' || value === 'system';
}

function deriveLegacyPlanSlugCandidates(planKey: string): string[] {
  const normalized = planKey.trim().toLowerCase();
  if (!normalized) return [];

  const candidates = new Set<string>();
  if (normalized.endsWith('-complete')) {
    candidates.add(normalized.replace(/-complete$/, ''));
  }

  return Array.from(candidates).filter((candidate) => candidate && candidate !== normalized);
}

interface QueryParams {
  activityId: string;
  planId: string;
  scheduleId: string | null;
  dateFrom: string;
  dateTo: string;
  timezone: string;
  participants: number;
}

function parseAndValidateParams(
  activityId: string,
  planId: string,
  searchParams: URLSearchParams
): { params: QueryParams } | { error: { code: string; message: string } } {
  // Validate resolved IDs (support UUID-like fixture IDs in public booking flow)
  if (!activityId || !isUuidLike(activityId)) {
    return { error: { code: 'VALIDATION_ERROR', message: 'Invalid activityId' } };
  }

  // Required params
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

  // Limit date range to 31 days to prevent abuse
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

export async function getAvailableSlots(
  request: NextRequest,
  context: { params: Promise<{ activityId: string }> },
  routeDeps?: { createClient?: typeof CreateClientFn }
) {
  const { activityId: activityKey } = await context.params;
  const searchParams = request.nextUrl.searchParams;

  try {
    const resolvedCreateClient = routeDeps?.createClient
      ? routeDeps.createClient
      : (await import('../../../../../../src/lib/supabase/server.ts')).createClient;
    const supabase = await resolvedCreateClient();

    let resolvedActivityId = activityKey;

    const activityIdLookupColumn = isUuidLike(activityKey) ? 'id' : 'slug';
    const { data: activityRow, error: activityResolveError } = await supabase
      .from('activities')
      .select('id')
      .eq(activityIdLookupColumn, activityKey)
      .maybeSingle();

    if (activityResolveError || !activityRow?.id || !isUuidLike(activityRow.id)) {
      return Response.json(errorV2('VALIDATION_ERROR', 'Invalid activityId'), {
        status: 400,
      });
    }

    resolvedActivityId = activityRow.id;

    const planKey = searchParams.get('planId');
    if (!planKey) {
      return Response.json(errorV2('VALIDATION_ERROR', 'planId is required'), {
        status: 400,
      });
    }

    // Issue #882: delegate the slug → schedule → ambiguous fallback chain to
    // the canonical resolver so all Booking V2 callers share one contract.
    // Failure shape (PLAN_NOT_FOUND 404 + details.planKey) is preserved from
    // #880 / PR #886; PLAN_INACTIVE and AMBIGUOUS_PLAN are additive — existing
    // clients see 404 PLAN_NOT_FOUND exactly as before.
    const resolved = await resolveBookingPlan(supabase, {
      activityId: resolvedActivityId,
      planKey,
      scheduleId: searchParams.get('scheduleId'),
    });

    if (!resolved.ok) {
      const status = resolved.code === 'AMBIGUOUS_PLAN' ? 409 : 404;
      return Response.json(
        {
          success: false,
          error: {
            code: resolved.code,
            message: resolved.messageEn,
            messageZh: resolved.messageZh,
            details: resolved.details,
          },
        },
        { status },
      );
    }

    const resolvedPlanId = resolved.planId;
    const validation = parseAndValidateParams(resolvedActivityId, resolvedPlanId, searchParams);
    if ('error' in validation) {
      return Response.json(errorV2(validation.error.code, validation.error.message), {
        status: 400,
      });
    }

    const { params } = validation;

    type ActivitySchedule = {
      id: string;
      activity_id: string;
      plan_id: string | null;
      start_at: string;
      end_at: string;
      capacity: number;
      booked_count: number;
      status: string;
    };

    let selectedSchedule: ActivitySchedule | null = null;
    if (params.scheduleId) {
      const { data: scheduleData, error: scheduleError } = await supabase
        .from('activity_schedules')
        .select('id, activity_id, plan_id, start_at, end_at, capacity, booked_count, status')
        .eq('id', params.scheduleId)
        .eq('activity_id', params.activityId)
        .maybeSingle();

      // scheduleId in traveler booking links is treated as a hint only.
      // If stale/mismatched, gracefully fall back instead of hard-failing with 404.
      if (!scheduleError && scheduleData) {
        const scheduleLocalDate = getDateStringInTimezone(new Date(scheduleData.start_at), params.timezone);
        const inDateRange = scheduleLocalDate >= params.dateFrom && scheduleLocalDate <= params.dateTo;
        const planMatches = !scheduleData.plan_id || scheduleData.plan_id === params.planId;

        if (inDateRange && planMatches) {
          selectedSchedule = scheduleData;
        }
      }

      // If scheduleId points to a stale/mismatched schedule, try to recover by
      // selecting a schedule that matches the requested plan/date window.
      if (!selectedSchedule) {
        const { data: fallbackSchedules, error: fallbackSchedulesError } = await supabase
          .from('activity_schedules')
          .select('id, activity_id, plan_id, start_at, end_at, capacity, booked_count, status')
          .eq('activity_id', params.activityId)
          .or(`plan_id.is.null,plan_id.eq.${params.planId}`);

        if (!fallbackSchedulesError && Array.isArray(fallbackSchedules)) {
          selectedSchedule =
            fallbackSchedules
              .filter((candidate) => candidate.status === 'open')
              .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
              .find((candidate) => {
                const localDate = getDateStringInTimezone(new Date(candidate.start_at), params.timezone);
                const inDateRange = localDate >= params.dateFrom && localDate <= params.dateTo;
                return inDateRange;
              }) ?? null;
        }
      }
    }

    // Fetch activity plan with activity details (to get guide_id)
    const { data: planData, error: planError } = await supabase
      .from('activity_plans')
      .select(
        `
        id,
        activity_id,
        duration_minutes,
        min_participants,
        max_participants,
        booking_type,
        status,
        name,
        price_type,
        base_price,
        activities!inner (
          id,
          guide_id
        )
      `
      )
      .eq('id', params.planId)
      .eq('activity_id', params.activityId)
      .single();

    if (planError || !planData) {
      return Response.json(errorV2('NOT_FOUND', 'Activity plan not found'), {
        status: 404,
      });
    }

    const normalizedPlanStatus =
      typeof planData.status === 'string' ? planData.status.trim().toLowerCase() : null;
    if (normalizedPlanStatus && normalizedPlanStatus !== 'active') {
      return Response.json(errorV2('NOT_FOUND', 'Activity plan is not active'), {
        status: 404,
      });
    }

    // Extract guide_id from the nested activities relation
    const activities = pickActivityRelation(planData.activities as ActivityRelation | ActivityRelation[] | null);
    const guideId = activities?.guide_id;

    if (!guideId) {
      return Response.json(errorV2('INTERNAL_ERROR', 'Activity has no assigned guide'), {
        status: 500,
      });
    }

    // Fetch availability rules for this guide (and optionally this plan)
    const { data: rulesData, error: rulesError } = await supabase
      .from('guide_availability_rules')
      .select('*')
      .eq('guide_id', guideId)
      .eq('is_active', true)
      .or(`activity_plan_id.is.null,activity_plan_id.eq.${params.planId}`);

    if (rulesError) {
      console.error('Error fetching availability rules:', rulesError);
      return Response.json(errorV2('INTERNAL_ERROR', 'Failed to fetch availability rules'), {
        status: 500,
      });
    }

    // Fetch blackout dates for this guide
    const { data: blackoutsData, error: blackoutsError } = await supabase
      .from('guide_blackout_dates')
      .select('*')
      .eq('guide_id', guideId);

    if (blackoutsError) {
      console.error('Error fetching blackout dates:', blackoutsError);
      return Response.json(errorV2('INTERNAL_ERROR', 'Failed to fetch blackout dates'), {
        status: 500,
      });
    }

    // Fetch existing bookings for this guide (active statuses only)
    const activeStatuses = [...CAPACITY_HOLD_BOOKING_STATUSES];
    const { data: bookingsData, error: bookingsError } = await supabase
      .from('bookings')
      .select('id, guide_id, start_at, end_at, status, participants, activity_id, activity_plan_id')
      .eq('guide_id', guideId)
      .in('status', activeStatuses);

    if (bookingsError) {
      console.error('Error fetching bookings:', bookingsError);
      return Response.json(errorV2('INTERNAL_ERROR', 'Failed to fetch bookings'), {
        status: 500,
      });
    }

    // Transform database rows to slot generator types
    const rules: AvailabilityRule[] = (rulesData || []).map((row) => ({
      id: row.id,
      guide_id: row.guide_id,
      activity_plan_id: row.activity_plan_id,
      weekday: row.weekday,
      start_time_local: row.start_time_local,
      end_time_local: row.end_time_local,
      timezone: row.timezone,
      slot_interval_minutes: row.slot_interval_minutes,
      buffer_before_minutes: row.buffer_before_minutes,
      buffer_after_minutes: row.buffer_after_minutes,
      effective_from: row.effective_from,
      effective_to: row.effective_to,
      is_active: row.is_active,
    }));

    const blackouts: BlackoutWindow[] = (blackoutsData || []).map((row) => ({
      id: row.id,
      guide_id: row.guide_id,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      reason: row.reason,
      source: isManualOrSystemSource(row.source) ? row.source : 'manual',
    }));

    const bookings: ExistingBooking[] = (bookingsData || []).map((row) => ({
      id: row.id,
      guide_id: row.guide_id,
      start_at: row.start_at,
      end_at: row.end_at,
      status: row.status,
      participants: normalizeBookingParticipants(row.participants),
      activity_id: row.activity_id ?? null,
      activity_plan_id: row.activity_plan_id ?? null,
    }));

    const plan: ActivityPlan = {
      id: planData.id,
      activity_id: planData.activity_id,
      duration_minutes: planData.duration_minutes,
      max_participants: planData.max_participants,
      booking_type: planData.booking_type as 'scheduled' | 'request' | 'instant',
    };

    // Prepare slot generator input
    const input: SlotGeneratorInput = {
      guideId,
      activityPlanId: params.planId,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      timezone: params.timezone,
      participants: params.participants,
    };

    const nonGroupConflictBookings = excludeSameActivityPlanDateRangeBookings({
      bookings,
      activityId: params.activityId,
      planId: params.planId,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      timezone: params.timezone,
    });

    const deps: SlotGeneratorDeps = {
      rules,
      blackouts,
      bookings: nonGroupConflictBookings,
      plan,
    };

    // Generate slots
    const result = generateAvailableSlots(input, deps);

    const minParticipants =
      Number.isFinite(Number((planData as { min_participants?: unknown }).min_participants)) &&
      Number((planData as { min_participants?: unknown }).min_participants) > 0
        ? Number((planData as { min_participants?: unknown }).min_participants)
        : 1;
    const groupedRuleFailuresByDate = new Map<string, { reasonCode?: string; messageZh?: string }>();
    const filteredSlots = result.slots.filter((slot) => {
      const localDate = getDateStringInTimezone(new Date(slot.startAt), params.timezone);
      const effectiveExistingParticipantsForFormed = calculateExistingParticipantsForGroup({
        bookings,
        activityId: params.activityId,
        planId: params.planId,
        localDate,
        timezone: params.timezone,
        statuses: FORMED_GROUP_BOOKING_STATUSES,
      });

      const effectiveExistingParticipantsForCapacityHold = calculateExistingParticipantsForGroup({
        bookings,
        activityId: params.activityId,
        planId: params.planId,
        localDate,
        timezone: params.timezone,
        statuses: CAPACITY_HOLD_BOOKING_STATUSES,
      });

      const capacityHoldRule = evaluateGroupBookingRule({
        minParticipants,
        maxParticipants: plan.max_participants,
        effectiveExistingParticipants: effectiveExistingParticipantsForCapacityHold,
        requestedParticipants: params.participants,
      });
      const groupRule = evaluateGroupBookingRule({
        minParticipants,
        maxParticipants: plan.max_participants,
        effectiveExistingParticipants: effectiveExistingParticipantsForFormed,
        requestedParticipants: params.participants,
      });
      const rule =
        !capacityHoldRule.allowed && capacityHoldRule.reasonCode === 'CAPACITY_EXCEEDED'
          ? capacityHoldRule
          : groupRule;

      if (rule.allowed) {
        return true;
      }

      groupedRuleFailuresByDate.set(localDate, {
        reasonCode: rule.reasonCode,
        messageZh: rule.messageZh,
      });
      return false;
    });

    const firstRuleFailure = groupedRuleFailuresByDate.values().next().value as
      | { reasonCode?: string; messageZh?: string }
      | undefined;

    let selectedScheduleRuleFailure: { reasonCode?: string; messageZh?: string } | undefined =
      undefined;
    let slotsToReturn = filteredSlots;
    if (selectedSchedule) {
      const localDate = getDateStringInTimezone(new Date(selectedSchedule.start_at), params.timezone);
      const effectiveExistingParticipantsForFormed = calculateExistingParticipantsForGroup({
        bookings,
        activityId: params.activityId,
        planId: params.planId,
        localDate,
        timezone: params.timezone,
        statuses: FORMED_GROUP_BOOKING_STATUSES,
      });

      const effectiveExistingParticipantsForCapacityHold = calculateExistingParticipantsForGroup({
        bookings,
        activityId: params.activityId,
        planId: params.planId,
        localDate,
        timezone: params.timezone,
        statuses: CAPACITY_HOLD_BOOKING_STATUSES,
      });

      const capacityHoldRule = evaluateGroupBookingRule({
        minParticipants,
        maxParticipants: plan.max_participants,
        effectiveExistingParticipants: effectiveExistingParticipantsForCapacityHold,
        requestedParticipants: params.participants,
      });
      const groupRule = evaluateGroupBookingRule({
        minParticipants,
        maxParticipants: plan.max_participants,
        effectiveExistingParticipants: effectiveExistingParticipantsForFormed,
        requestedParticipants: params.participants,
      });
      const selectedScheduleRule =
        !capacityHoldRule.allowed && capacityHoldRule.reasonCode === 'CAPACITY_EXCEEDED'
          ? capacityHoldRule
          : groupRule;

      const remaining = Math.max(0, selectedSchedule.capacity - selectedSchedule.booked_count);
      const hasInsufficientCapacityForSelectedSchedule = remaining < params.participants;

      if (
        selectedSchedule.status !== 'open' ||
        !selectedScheduleRule.allowed ||
        hasInsufficientCapacityForSelectedSchedule
      ) {
        slotsToReturn = [];

        if (!selectedScheduleRule.allowed) {
          selectedScheduleRuleFailure = {
            reasonCode: selectedScheduleRule.reasonCode,
            messageZh: selectedScheduleRule.messageZh,
          };
        } else if (hasInsufficientCapacityForSelectedSchedule) {
          selectedScheduleRuleFailure = {
            reasonCode: 'CAPACITY_EXCEEDED',
            messageZh: `此行程最多 ${selectedSchedule.capacity} 人，當前時段剩餘 ${remaining} 人可預訂`,
          };
        }
      } else {
        // Issue #880: clamp at plan.max_participants so the response never
        // advertises more seats than the per-group ceiling, even when
        // schedule.capacity (legacy seed) exceeds plan.max.
        const scheduleSlot: SerializedSlot = {
          startAt: formatDateWithTimezone(new Date(selectedSchedule.start_at), params.timezone),
          endAt: formatDateWithTimezone(new Date(selectedSchedule.end_at), params.timezone),
          capacityLeft: Math.min(remaining, plan.max_participants),
          bookingType: plan.booking_type,
          isAvailable: true,
        };
        slotsToReturn = [scheduleSlot];
      }
    }

    const reasonCode =
      slotsToReturn.length === 0
        ? selectedScheduleRuleFailure?.reasonCode ?? firstRuleFailure?.reasonCode
        : undefined;
    const reasonMessage =
      slotsToReturn.length === 0
        ? selectedScheduleRuleFailure?.messageZh ?? firstRuleFailure?.messageZh
        : undefined;

    // Return response per API spec
    return Response.json(
      successV2({
        timezone: result.timezone,
        activityId: params.activityId,
        planId: params.planId,
        selectedPlan: {
          id: plan.id,
          priceType: plan.price_type,
          basePrice: plan.base_price,
          minParticipants: plan.min_participants,
          maxParticipants: plan.max_participants,
        },
        slots: slotsToReturn,
        reason: reasonCode,
        messageZh: reasonMessage,
      })
    );
  } catch (err) {
    console.error('Available slots API error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json(errorV2('INTERNAL_ERROR', message), { status: 500 });
  }
}
