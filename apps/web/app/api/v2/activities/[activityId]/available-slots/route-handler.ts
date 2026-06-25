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
import { getSupabase, hasSupabaseEnv } from '../../../../../../src/lib/db.mjs';
import type { createClient as CreateClientFn } from '../../../../../../src/lib/supabase/server.ts';
import {
  getDateStringInTimezone,
  type AvailabilityRule,
  type BlackoutWindow,
  type ExistingBooking,
  type ActivityPlan,
} from '../../../../../../src/lib/slot-generator.ts';
import { evaluateBookingAvailability, type EvaluatorSchedule } from '../../../../../../src/lib/availability-v2/booking-availability-evaluator.ts';
import { evaluateScheduledPlanSlots } from '../../../../../../src/lib/availability-v2/scheduled-plan-slots.ts';
import { evaluateOverrideDynamicSlots } from '../../../../../../src/lib/availability-v2/override-dynamic-slots.ts';
import { buildActivityPlanNotFoundResponse } from '../../../../../../src/lib/availability-v2/activity-plan-not-found-copy.mjs';
import { getCanonicalReasonCopy } from '../../../../../../src/lib/availability-v2/canonical-reason-copy.ts';
import type { GuideSlotConflictOverride } from '../../../../../../src/lib/availability-v2/conflict-override.ts';
import { serializeConflictOverrideForPublic } from '../../../../../../src/lib/availability-v2/conflict-override.ts';
import { loadConflictOverridesWithSchemaFallback } from '../../../../../../src/lib/conflict-override-schema-compat.mjs';
import type { ActivityPlanSeason } from '../../../../../../src/lib/availability-v2/effective-availability-resolver.ts';
import { buildDateAvailabilitySummary } from '../../../../../../src/lib/availability-v2/date-availability-summary.ts';
import { loadActivityPlanWithMissingIsYearRoundFallback } from '../../../../../../src/lib/activity-plan-is-year-round-fallback.mjs';
import {
  CAPACITY_HOLD_BOOKING_STATUSES,
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
      if (resolved.code === 'AMBIGUOUS_PLAN') {
        return Response.json(
          successV2({
            timezone: searchParams.get('timezone') ?? 'Asia/Taipei',
            activityId: resolvedActivityId,
            planId: planKey,
            slots: [],
            reason: resolved.code,
            messageZh: resolved.messageZh,
          }),
        );
      }

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
        { status: 404 },
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

    // Fetch activity plan with activity details (to get guide_id).
    // Production/prelaunch may lag the is_year_round migration, so tolerate that
    // single-column schema drift and default to false rather than surfacing a
    // misleading NOT_FOUND contract break for otherwise valid public plans.
    const { data: planData, error: planError, schemaFallback: planSchemaFallback } = await loadActivityPlanWithMissingIsYearRoundFallback(
      async ({ includeIsYearRound }: { includeIsYearRound: boolean }) =>
        supabase
          .from('activity_plans')
          .select(
            `
            id,
            activity_id,
            duration_minutes,
            min_participants,
            max_participants,
            booking_type,
            ${includeIsYearRound ? 'is_year_round,' : ''}
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
          .single()
    );

    if (planSchemaFallback) {
      console.warn('Activity plan schema fallback during available-slots', {
        activityId: params.activityId,
        planId: params.planId,
        schemaFallback: planSchemaFallback,
      });
    }

    if (planError || !planData) {
      const r = buildActivityPlanNotFoundResponse('PLAN_NOT_FOUND');
      return Response.json(r.body, { status: r.status });
    }

    const normalizedPlanStatus =
      typeof planData.status === 'string' ? planData.status.trim().toLowerCase() : null;
    if (normalizedPlanStatus && normalizedPlanStatus !== 'active') {
      const r = buildActivityPlanNotFoundResponse('PLAN_NOT_ACTIVE');
      return Response.json(r.body, { status: r.status });
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

    const { data: seasonsData, error: seasonsError } = await supabase
      .from('activity_plan_seasons')
      .select('id, activity_plan_id, start_month, start_day, end_month, end_day, timezone, is_active')
      .eq('activity_plan_id', params.planId);

    if (seasonsError) {
      console.error('Error fetching activity plan seasons:', seasonsError);
      return Response.json(errorV2('INTERNAL_ERROR', 'Failed to fetch activity plan seasons'), {
        status: 500,
      });
    }

    const conflictOverrideSupabase = hasSupabaseEnv() ? await getSupabase() : supabase;
    const {
      data: conflictOverridesData,
      error: conflictOverridesError,
      schemaFallback: conflictOverridesSchemaFallback,
    } = await loadConflictOverridesWithSchemaFallback(async () =>
      conflictOverrideSupabase
        .from('guide_slot_conflict_overrides')
        .select(
          'id, guide_id, activity_id, activity_plan_id, start_at, end_at, reason, requires_helper, helper_status, guide_note, admin_note, status, created_at, created_by_admin_email'
        )
        .eq('guide_id', guideId)
        .eq('activity_id', params.activityId)
        .eq('activity_plan_id', params.planId)
        .eq('status', 'active')
    );

    if (conflictOverridesError) {
      console.error('Error fetching guide_slot_conflict_overrides:', conflictOverridesError);
      return Response.json(errorV2('INTERNAL_ERROR', 'Failed to fetch guide slot conflict overrides'), {
        status: 500,
      });
    }

    if (conflictOverridesSchemaFallback) {
      console.warn('Conflict override schema fallback during available-slots', {
        guideId,
        activityId: params.activityId,
        planId: params.planId,
        fallback: conflictOverridesSchemaFallback,
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
      // GH-1301: propagate use_dynamic_reemit so the slot generator can
      // emit post-buffer re-start candidates when the flag is true.
      use_dynamic_reemit: row.use_dynamic_reemit ?? false,
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

    const seasons: ActivityPlanSeason[] = (seasonsData || []).map((row) => ({
      id: row.id,
      activity_plan_id: row.activity_plan_id,
      start_month: Number(row.start_month),
      start_day: Number(row.start_day),
      end_month: Number(row.end_month),
      end_day: Number(row.end_day),
      timezone: row.timezone,
      is_active: Boolean(row.is_active),
    }));

    const conflictOverrides: GuideSlotConflictOverride[] = (conflictOverridesData || []).map((row: any) => ({
      id: row.id,
      guide_id: row.guide_id,
      activity_id: row.activity_id,
      activity_plan_id: row.activity_plan_id,
      start_at: row.start_at,
      end_at: row.end_at,
      reason: row.reason,
      requires_helper: Boolean(row.requires_helper),
      helper_status: row.helper_status,
      guide_note: row.guide_note ?? null,
      admin_note: row.admin_note ?? null,
      status: row.status,
      created_at: row.created_at ?? null,
      created_by_admin_email: row.created_by_admin_email ?? null,
    }));

    const plan: ActivityPlan = {
      id: planData.id,
      activity_id: planData.activity_id,
      duration_minutes: planData.duration_minutes,
      max_participants: planData.max_participants,
      booking_type: planData.booking_type as 'scheduled' | 'request' | 'instant',
      is_year_round: Boolean(planData.is_year_round),
    };

    const minParticipants =
      Number.isFinite(Number((planData as { min_participants?: unknown }).min_participants)) &&
      Number((planData as { min_participants?: unknown }).min_participants) > 0
        ? Number((planData as { min_participants?: unknown }).min_participants)
        : 1;

    // scheduled（排程預約）方案：固定場次是唯一可預約來源，動態規則不適用，
    // 因此一律不把 availability rules 餵進 evaluator。instant/request 維持原本行為。
    const effectiveRules = plan.booking_type === 'scheduled' ? [] : rules;
    const isScheduledListing = plan.booking_type === 'scheduled' && !selectedSchedule;

    // Preserve canonical slot states from evaluator, including allowed_with_admin_override
    // when a guide_slot_conflict_overrides record explicitly re-opens a conflicting slot.
    let availability;
    if (isScheduledListing) {
      // 列出該方案在查詢區間內的所有開放固定場次，逐一驗證收集為可預約 slots。
      const { data: planSchedules, error: planSchedulesError } = await supabase
        .from('activity_schedules')
        .select('id, activity_id, plan_id, start_at, end_at, capacity, booked_count, status')
        .eq('activity_id', params.activityId)
        .or(`plan_id.is.null,plan_id.eq.${params.planId}`);

      if (planSchedulesError) {
        console.error('Error fetching activity schedules:', planSchedulesError);
        return Response.json(errorV2('INTERNAL_ERROR', 'Failed to fetch activity schedules'), {
          status: 500,
        });
      }

      const openSchedules: EvaluatorSchedule[] = (planSchedules || [])
        .filter((s) => s.status === 'open')
        .filter((s) => {
          const localDate = getDateStringInTimezone(new Date(s.start_at), params.timezone);
          return localDate >= params.dateFrom && localDate <= params.dateTo;
        })
        .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

      const scheduledResult = evaluateScheduledPlanSlots(
        {
          guideId,
          activityId: params.activityId,
          planId: params.planId,
          timezone: params.timezone,
          participants: params.participants,
          dateFrom: params.dateFrom,
          dateTo: params.dateTo,
          minParticipants,
          blackouts,
          bookings,
          plan,
          seasons,
          conflictOverrides,
          planStatus: planData.status,
        },
        openSchedules,
      );

      availability = {
        available: scheduledResult.slots.length > 0,
        reasonCode: scheduledResult.reasonCode,
        messageZh: scheduledResult.messageZh,
        canonicalReasonState: undefined,
        capacityLeft: undefined,
        selectedScheduleAuthority: 'authoritative' as const,
        slots: scheduledResult.slots,
        diagnostics: {
          generatedSlotCount: scheduledResult.slots.length,
          filteredSlotCount: scheduledResult.slots.length,
          schedulePresentInGeneratedSlots: scheduledResult.slots.length > 0,
          hasRules: false,
          groupedRuleFailuresByDate: {},
          rules: [],
          blackouts,
          bookings,
          seasons,
          seasonGateEnabled: seasons !== undefined,
          isYearRound: Boolean(plan.is_year_round),
          planStatus: planData.status ?? 'active',
        },
      };
    } else {
      availability = evaluateBookingAvailability({
        guideId,
        activityId: params.activityId,
        planId: params.planId,
        timezone: params.timezone,
        participants: params.participants,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        minParticipants,
        rules: effectiveRules,
        blackouts,
        bookings,
        plan,
        seasons,
        conflictOverrides,
        planStatus: planData.status,
        selectedSchedule,
        selectedScheduleAuthority: params.scheduleId ? (selectedSchedule ? 'authoritative' : 'fallback') : undefined,
      });
    }

    // instant／request 動態方案:把管理者加開的 conflict override 時段(被既有預約
    // 擋住、admin 例外開放者)併入動態結果,讓旅客也能預約。scheduled 走固定場次
    // 路徑、scheduleId 直連走 evaluator selectedSchedule 分支,兩者已各自處理 override。
    if (!selectedSchedule && plan.booking_type !== 'scheduled' && conflictOverrides.length > 0) {
      const overrideSlots = evaluateOverrideDynamicSlots(
        {
          guideId,
          activityId: params.activityId,
          planId: params.planId,
          timezone: params.timezone,
          participants: params.participants,
          dateFrom: params.dateFrom,
          dateTo: params.dateTo,
          minParticipants,
          blackouts,
          bookings,
          plan,
          seasons,
          conflictOverrides,
          planStatus: planData.status,
        },
        conflictOverrides,
      );
      if (overrideSlots.length > 0) {
        const existingStarts = new Set(availability.slots.map((s) => s.startAt));
        const mergedSlots = [
          ...availability.slots,
          ...overrideSlots.filter((s) => !existingStarts.has(s.startAt)),
        ].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
        availability = {
          ...availability,
          slots: mergedSlots,
          available: mergedSlots.length > 0,
          reasonCode: mergedSlots.length > 0 ? undefined : availability.reasonCode,
          messageZh: mergedSlots.length > 0 ? undefined : availability.messageZh,
        };
      }
    }

    const dateAvailability = buildDateAvailabilitySummary({
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      timezone: params.timezone,
      slots: availability.slots,
      fallbackReason: availability.reasonCode,
      fallbackMessageZh: availability.messageZh,
      groupedRuleFailuresByDate: availability.diagnostics.groupedRuleFailuresByDate,
    });

    // Strip admin-only conflict override fields at the PUBLIC API boundary.
    // The evaluator core returns the full internal snapshot (needed for draft/audit paths);
    // we strip here so travelers never see adminNote / createdByAdminEmail.
    const publicSlots = availability.slots.map((slot) =>
      slot.conflictOverride != null
        ? { ...slot, conflictOverride: serializeConflictOverrideForPublic(slot.conflictOverride as any) }
        : slot
    );

    // #1212 — for canonical states where the helper's copy is strictly
    // better (matches Admin + Guide, no informational loss vs the
    // evaluator's generic string), render via getCanonicalReasonCopy at
    // the boundary. For states where the evaluator embeds richer detail
    // (e.g. CAPACITY_EXCEEDED with seat counts, MIN_PARTICIPANTS_NOT_MET
    // with the required group size), fall back to the evaluator's
    // legacy messageZh — preserves AC #5 ("no copy weakening").
    const CANONICAL_STATES_WITH_HELPER_OVERRIDE = new Set([
      'outside_season',
      'blackout',
      'blocked_by_conflict',
    ]);
    const canonicalReasonCopy =
      availability.canonicalReasonState &&
      CANONICAL_STATES_WITH_HELPER_OVERRIDE.has(availability.canonicalReasonState)
        ? getCanonicalReasonCopy(availability.canonicalReasonState)
        : null;
    const responseMessageZh = canonicalReasonCopy?.bodyZh ?? availability.messageZh;

    // Return response per API spec
    return Response.json(
      successV2({
        timezone: params.timezone,
        activityId: params.activityId,
        planId: params.planId,
        selectedPlan: {
          id: planData.id,
          name: planData.name,
          label: planData.name,
          displayName: planData.name,
          priceType: planData.price_type,
          basePrice: planData.base_price,
          minParticipants: planData.min_participants,
          maxParticipants: planData.max_participants,
          // 三種預約模式：供前端依此切換預約流程文案（即時/排程/申請）。
          bookingType: planData.booking_type,
        },
        slots: publicSlots,
        dateAvailability,
        dates: dateAvailability,
        reason: availability.reasonCode,
        messageZh: responseMessageZh,
        canonicalReasonState: availability.canonicalReasonState ?? null,
      })
    );
  } catch (err) {
    console.error('Available slots API error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json(errorV2('INTERNAL_ERROR', message), { status: 500 });
  }
}
