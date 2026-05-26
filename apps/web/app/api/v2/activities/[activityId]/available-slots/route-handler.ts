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

    let resolvedPlanId = planKey;
    if (!isUuidLike(resolvedPlanId)) {
      const scheduleKey = searchParams.get('scheduleId');
      const { data: planRow, error: planResolveError } = await supabase
        .from('activity_plans')
        .select('id')
        .eq('activity_id', resolvedActivityId)
        .eq('slug', planKey)
        .maybeSingle();

      if (planResolveError || !planRow?.id || !isUuidLike(planRow.id)) {
        if (scheduleKey && isUuidLike(scheduleKey)) {
          const { data: legacyScheduleRow, error: legacyScheduleError } = await supabase
            .from('activity_schedules')
            .select('id, plan_id')
            .eq('id', scheduleKey)
            .eq('activity_id', resolvedActivityId)
            .maybeSingle();

          if (legacyScheduleError || !legacyScheduleRow?.id) {
            return Response.json(errorV2('VALIDATION_ERROR', 'Invalid planId format'), {
              status: 400,
            });
          }

          if (legacyScheduleRow.plan_id && isUuidLike(legacyScheduleRow.plan_id)) {
            resolvedPlanId = legacyScheduleRow.plan_id;
          } else {
            const { data: activePlans, error: activePlansError } = await supabase
              .from('activity_plans')
              .select('id')
              .eq('activity_id', resolvedActivityId)
              .eq('status', 'active')
              .limit(2);

            if (activePlansError || !activePlans || activePlans.length !== 1 || !isUuidLike(activePlans[0].id)) {
              return Response.json(errorV2('VALIDATION_ERROR', 'Invalid planId format'), {
                status: 400,
              });
            }

            resolvedPlanId = activePlans[0].id;
          }
        } else {
          return Response.json(errorV2('VALIDATION_ERROR', 'Invalid planId format'), {
            status: 400,
          });
        }
      } else {
        resolvedPlanId = planRow.id;
      }
    }

    // Validate request params
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

      if (scheduleError || !scheduleData) {
        return Response.json(errorV2('NOT_FOUND', 'Schedule not found for this activity'), {
          status: 404,
        });
      }

      const scheduleLocalDate = getDateStringInTimezone(new Date(scheduleData.start_at), params.timezone);
      if (scheduleLocalDate < params.dateFrom || scheduleLocalDate > params.dateTo) {
        return Response.json(errorV2('NOT_FOUND', 'Schedule not found for requested date range'), {
          status: 404,
        });
      }

      if (scheduleData.plan_id && scheduleData.plan_id !== params.planId) {
        return Response.json(errorV2('NOT_FOUND', 'Schedule not found for requested plan'), {
          status: 404,
        });
      }

      selectedSchedule = scheduleData;
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

    if (planData.status !== 'active') {
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

    let slotsToReturn = filteredSlots;
    if (selectedSchedule) {
      const remaining = Math.max(0, selectedSchedule.capacity - selectedSchedule.booked_count);
      if (selectedSchedule.status !== 'open' || remaining < params.participants) {
        slotsToReturn = [];
      } else {
        const scheduleSlot: SerializedSlot = {
          startAt: formatDateWithTimezone(new Date(selectedSchedule.start_at), params.timezone),
          endAt: formatDateWithTimezone(new Date(selectedSchedule.end_at), params.timezone),
          capacityLeft: remaining,
          bookingType: plan.booking_type,
          isAvailable: true,
        };
        slotsToReturn = [scheduleSlot];
      }
    }

    // Return response per API spec
    return Response.json(
      successV2({
        timezone: result.timezone,
        activityId: params.activityId,
        planId: params.planId,
        slots: slotsToReturn,
        reason: slotsToReturn.length === 0 ? firstRuleFailure?.reasonCode : undefined,
        messageZh: slotsToReturn.length === 0 ? firstRuleFailure?.messageZh : undefined,
      })
    );
  } catch (err) {
    console.error('Available slots API error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json(errorV2('INTERNAL_ERROR', message), { status: 500 });
  }
}
