/**
 * POST /api/v2/bookings/draft
 *
 * Booking Draft API (TP-BP-005)
 * Creates a draft booking with server-side slot validation.
 *
 * Request body:
 *   - activityId (required): Activity UUID
 *   - planId (required): Activity plan UUID
 *   - startAt (required): ISO 8601 datetime with timezone
 *   - timezone (required): IANA timezone
 *   - participants (required): Number of participants
 *   - sourceChannel (optional): 'web' | 'line' | 'admin_pos' (default: 'web')
 *   - contactName (required): Customer contact name
 *   - contactPhone (required): Customer contact phone
 *   - contactEmail (required): Customer contact email
 *   - customerNote (optional): Customer note
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { successV2, errorV2 } from '../../../../../src/lib/api';
import { handleRouteError } from '../../../../../src/lib/route-error';
import { getSupabase, hasSupabaseEnv } from '../../../../../src/lib/db.mjs';
import { createClient } from '../../../../../src/lib/supabase/server';
import { resolveBookingPlan } from '../../../../../src/lib/booking-plan-resolver';
import {
  validateSlotAvailability,
  addMinutes,
  getDateStringInTimezone,
  type ActivityPlan,
  type AvailabilityRule,
  type BlackoutWindow,
  type ExistingBooking,
  type SerializedSlot,
} from '../../../../../src/lib/slot-generator';
import {
  evaluateEffectiveBookingAvailability,
  shouldRejectDraftByEffectiveAvailability,
  shouldRejectDraftByLegacySlotAvailability,
} from '../../../../../src/lib/availability-v2/effective-booking-availability';
import type { GuideSlotConflictOverride } from '../../../../../src/lib/availability-v2/conflict-override';
import { evaluateOverrideDynamicSlots } from '../../../../../src/lib/availability-v2/override-dynamic-slots';
import {
  applyBookingConflictOverrideColumnFallback,
  loadConflictOverridesWithSchemaFallback,
} from '../../../../../src/lib/conflict-override-schema-compat.mjs';
import {
  initialApprovalStatusForBookingType,
  normalizeBookingType,
  requiresGuideApproval,
} from '../../../../../src/lib/booking-type-flow.mjs';
import { initialPaymentDeadlineForBookingType } from '../../../../../src/lib/payment-deadline.mjs';
import { dropExpiredUnpaidHolds } from '../../../../../src/lib/expired-hold-filter.mjs';
import { applyWithOptionalColumnFallback } from '../../../../../src/lib/optional-column-fallback.mjs';
import { applyOrderExtras } from '../../../../../src/lib/checkout/order-extras.mjs';
import type { ActivityPlanSeason } from '../../../../../src/lib/availability-v2/effective-availability-resolver';
import {
  validateDraftSlotAgainstSelectedSchedule,
  shouldRejectDraftWhenSelectedScheduleInvalid,
  shouldAttemptDraftSelectedScheduleFallback,
  pickFallbackDraftSelectedSchedule,
} from '../../../../../src/lib/booking-v2-selected-schedule';
import { loadActivityPlanWithMissingIsYearRoundFallback } from '../../../../../src/lib/activity-plan-is-year-round-fallback.mjs';
import {
  CAPACITY_HOLD_BOOKING_STATUSES,
  FORMED_GROUP_BOOKING_STATUSES,
  calculateExistingParticipantsForGroup,
  evaluateGroupBookingRule,
  excludeSameActivityPlanDateBookings,
  normalizeBookingParticipants,
} from '../../../../../src/lib/availability-v2/group-booking-rule';
import { checkPlanScheduleDurationMismatch } from '../../../../../src/lib/availability-v2/plan-schedule-mismatch.mjs';
import { buildActivityPlanNotFoundResponse } from '../../../../../src/lib/availability-v2/activity-plan-not-found-copy.mjs';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../../../../src/config/supabase-service-env.mjs';

// Validation helpers
function isUuidLike(str: string): boolean {
  const uuidLikeRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidLikeRegex.test(str);
}

function isValidISODateTime(str: string): boolean {
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

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone: string): boolean {
  // Allow various phone formats
  return /^[\d\s\-+()]{7,20}$/.test(phone);
}

const VALID_CHANNELS = ['web', 'line', 'admin_pos'] as const;
type SourceChannel = (typeof VALID_CHANNELS)[number];
type PlanActivityRelation = { id: string; guide_id: string; title: string };

function isSourceChannel(value: unknown): value is SourceChannel {
  return typeof value === 'string' && VALID_CHANNELS.includes(value as SourceChannel);
}

function pickPlanActivityRelation(
  value: PlanActivityRelation | PlanActivityRelation[] | null
): PlanActivityRelation | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function isManualOrSystemSource(value: unknown): value is 'manual' | 'system' {
  return value === 'manual' || value === 'system';
}

async function isSlotInGeneratedV2Availability(
  supabase: SupabaseClient,
  payload: {
    guideId: string;
    planId: string;
    activityId: string;
    timezone: string;
    participants: number;
    planDurationMinutes: number;
    planMaxParticipants: number;
    planBookingType: 'scheduled' | 'request' | 'instant';
    planIsYearRound: boolean;
    slotDate: string;
    startAt: string;
    minParticipants: number;
  selectedSchedule?: {
    id: string;
    activity_id: string;
    plan_id: string | null;
    start_at: string;
    end_at: string;
    capacity: number;
    booked_count: number;
    status: string;
  } | null;
  selectedScheduleAuthority?: 'authoritative' | 'fallback';
}): Promise<{
  available: boolean;
  reasonCode?: string;
  messageZh?: string;
  conflictOverride?: {
    id: string;
    reason: string;
    requiresHelper: boolean;
    helperStatus: string;
    guideNote?: string | null;
    adminNote?: string | null;
    createdAt?: string | null;
    createdByAdminEmail?: string | null;
  };
}>{
  // Fetch availability rules for this guide and plan
  const { data: rulesData, error: rulesError } = await supabase
    .from('guide_availability_rules')
    .select('*')
    .eq('guide_id', payload.guideId)
    .eq('is_active', true)
    .or(`activity_plan_id.is.null,activity_plan_id.eq.${payload.planId}`);

  if (rulesError) {
    throw new Error('Failed to fetch availability rules');
  }

  // Fetch blackout dates
  const { data: blackoutsData, error: blackoutsError } = await supabase
    .from('guide_blackout_dates')
    .select('*')
    .eq('guide_id', payload.guideId);
  if (blackoutsError) {
    throw new Error('Failed to fetch blackout dates');
  }

  // Fetch existing bookings (active statuses)
  const activeStatuses = [...CAPACITY_HOLD_BOOKING_STATUSES];
  const { data: bookingsData, error: bookingsError } = await supabase
    .from('bookings')
    .select('id, guide_id, start_at, end_at, status, participants, activity_id, activity_plan_id, order_id')
    .eq('guide_id', payload.guideId)
    .in('status', activeStatuses);

  if (bookingsError) {
    throw new Error('Failed to fetch bookings');
  }

  // #1493 讀取時過濾：逾時未付款 draft 佔位即時釋放（不必等排程取消）。
  const liveBookings = await dropExpiredUnpaidHolds(supabase, bookingsData || [], new Date().toISOString());

  const { data: seasonsData, error: seasonsError } = await supabase
    .from('activity_plan_seasons')
    .select('id, activity_plan_id, start_month, start_day, end_month, end_day, timezone, is_active')
    .eq('activity_plan_id', payload.planId);

  if (seasonsError) {
    throw new Error('Failed to fetch activity plan seasons');
  }

  const conflictOverrideSupabase = hasSupabaseEnv() ? await getSupabase() : supabase;
  const {
    data: conflictOverridesData,
    error: conflictOverridesError,
    schemaFallback: conflictOverridesSchemaFallback,
  } = await loadConflictOverridesWithSchemaFallback(() =>
    conflictOverrideSupabase
      .from('guide_slot_conflict_overrides')
      .select(
        'id, guide_id, activity_id, activity_plan_id, start_at, end_at, reason, requires_helper, helper_status, guide_note, admin_note, status, created_at, created_by_admin_email'
      )
      .eq('guide_id', payload.guideId)
      .eq('activity_id', payload.activityId)
      .eq('activity_plan_id', payload.planId)
      .eq('status', 'active')
  );

  if (conflictOverridesError) {
    throw new Error('Failed to fetch guide_slot_conflict_overrides');
  }

  if (conflictOverridesSchemaFallback) {
    console.warn('Conflict override schema fallback during draft availability precheck', {
      guideId: payload.guideId,
      activityId: payload.activityId,
      planId: payload.planId,
      fallback: conflictOverridesSchemaFallback,
    });
  }

  const rules: AvailabilityRule[] = (rulesData || []).map((row: any) => ({
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

  const blackouts: BlackoutWindow[] = (blackoutsData || []).map((row: any) => ({
    id: row.id,
    guide_id: row.guide_id,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    reason: row.reason,
    source: isManualOrSystemSource(row.source) ? row.source : 'manual',
  }));

  const bookings: ExistingBooking[] = (liveBookings as any[]).map((row: any) => ({
    id: row.id,
    guide_id: row.guide_id,
    start_at: row.start_at,
    end_at: row.end_at,
    status: row.status,
    participants: normalizeBookingParticipants(row.participants),
    activity_id: row.activity_id ?? null,
    activity_plan_id: row.activity_plan_id ?? null,
    buffer_before_minutes: row.buffer_before_minutes,
    buffer_after_minutes: row.buffer_after_minutes,
  }));

  const seasons: ActivityPlanSeason[] = (seasonsData || []).map((row: any) => ({
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
    id: payload.planId,
    activity_id: payload.activityId,
    duration_minutes: payload.planDurationMinutes,
    max_participants: payload.planMaxParticipants,
    booking_type: payload.planBookingType,
    is_year_round: payload.planIsYearRound,
  };

  // scheduled（排程預約）：固定場次是唯一可預約來源，動態規則不適用，因此不把
  // availability rules 餵進 evaluator —— 與 available-slots 列表行為一致，避免
  // 「方案同時有規則但場次時間不在規則內」時把合法固定場次誤判為不可預約。
  const effectiveRules = payload.planBookingType === 'scheduled' ? [] : rules;

  const availability = evaluateEffectiveBookingAvailability({
    guideId: payload.guideId,
    activityId: payload.activityId,
    planId: payload.planId,
    timezone: payload.timezone,
    participants: payload.participants,
    dateFrom: payload.slotDate,
    dateTo: payload.slotDate,
    requestedStartAt: payload.startAt,
    minParticipants: payload.minParticipants,
    rules: effectiveRules,
    blackouts,
    bookings,
    plan,
    seasons,
    planStatus: 'active',
    selectedSchedule: payload.selectedSchedule ?? null,
    selectedScheduleAuthority: payload.selectedScheduleAuthority,
    conflictOverrides,
  });

  if (!availability.available) {
    // instant／request 動態方案:該時段被既有預約擋住,但若管理者已對此時段加開
    // conflict override,則放行並帶回 override 快照供寫入 booking。scheduled 與
    // scheduleId 直連已於 evaluator selectedSchedule 分支處理,不走這裡。
    if (
      payload.planBookingType !== 'scheduled' &&
      !payload.selectedSchedule &&
      conflictOverrides.length > 0
    ) {
      const overrideSlots = evaluateOverrideDynamicSlots(
        {
          guideId: payload.guideId,
          activityId: payload.activityId,
          planId: payload.planId,
          timezone: payload.timezone,
          participants: payload.participants,
          dateFrom: payload.slotDate,
          dateTo: payload.slotDate,
          minParticipants: payload.minParticipants,
          blackouts,
          bookings,
          plan,
          seasons,
          planStatus: 'active',
        },
        conflictOverrides,
      );
      const requestedMs = new Date(payload.startAt).getTime();
      const overrideMatch = overrideSlots.find(
        (slot) => new Date(slot.startAt).getTime() === requestedMs,
      );
      if (overrideMatch) {
        return { available: true, conflictOverride: overrideMatch.conflictOverride };
      }
    }
    return {
      available: false,
      reasonCode: availability.reasonCode,
      messageZh: availability.messageZh,
      conflictOverride: availability.matchedSlot?.conflictOverride,
    };
  }

  return {
    available: true,
    conflictOverride: availability.matchedSlot?.conflictOverride,
  };
}

interface DraftBookingRequest {
  activityId: string;
  planId: string;
  scheduleId?: string;
  startAt: string;
  timezone: string;
  participants: number;
  sourceChannel: SourceChannel;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  customerNote?: string;
}

type ActivitySchedule = {
  id: string;
  activity_id: string;
  plan_id: string | null;
  start_at: string;
  end_at: string;
  status: string;
  capacity: number;
  booked_count: number;
};

function parseAndValidateBody(
  body: unknown
): { data: DraftBookingRequest } | { error: { code: string; message: string } } {
  if (!body || typeof body !== 'object') {
    return { error: { code: 'VALIDATION_ERROR', message: 'Request body is required' } };
  }

  const b = body as Record<string, unknown>;

  // activityId
  if (!b.activityId || typeof b.activityId !== 'string') {
    return { error: { code: 'VALIDATION_ERROR', message: 'activityId is required' } };
  }
  if (!isUuidLike(b.activityId)) {
    return { error: { code: 'VALIDATION_ERROR', message: 'Invalid activityId format' } };
  }

  // planId
  if (!b.planId || typeof b.planId !== 'string') {
    return { error: { code: 'VALIDATION_ERROR', message: 'planId is required' } };
  }
  if (!isUuidLike(b.planId)) {
    return { error: { code: 'VALIDATION_ERROR', message: 'Invalid planId format' } };
  }

  if (b.scheduleId !== undefined) {
    if (typeof b.scheduleId !== 'string' || !isUuidLike(b.scheduleId)) {
      return { error: { code: 'VALIDATION_ERROR', message: 'Invalid scheduleId format' } };
    }
  }

  // startAt
  if (!b.startAt || typeof b.startAt !== 'string') {
    return { error: { code: 'VALIDATION_ERROR', message: 'startAt is required' } };
  }
  if (!isValidISODateTime(b.startAt)) {
    return { error: { code: 'VALIDATION_ERROR', message: 'Invalid startAt format (ISO 8601)' } };
  }

  // timezone
  if (!b.timezone || typeof b.timezone !== 'string') {
    return { error: { code: 'VALIDATION_ERROR', message: 'timezone is required' } };
  }
  if (!isValidTimezone(b.timezone)) {
    return { error: { code: 'VALIDATION_ERROR', message: 'Invalid timezone' } };
  }

  // participants
  if (typeof b.participants !== 'number' || !Number.isInteger(b.participants)) {
    return { error: { code: 'VALIDATION_ERROR', message: 'participants must be an integer' } };
  }
  if (b.participants < 1) {
    return { error: { code: 'VALIDATION_ERROR', message: 'participants must be at least 1' } };
  }

  // sourceChannel (optional, default to 'web')
  let sourceChannel: SourceChannel = 'web';
  if (b.sourceChannel !== undefined) {
    if (!isSourceChannel(b.sourceChannel)) {
      return {
        error: {
          code: 'VALIDATION_ERROR',
          message: `sourceChannel must be one of: ${VALID_CHANNELS.join(', ')}`,
        },
      };
    }
    sourceChannel = b.sourceChannel;
  }

  // contactName
  if (!b.contactName || typeof b.contactName !== 'string') {
    return { error: { code: 'VALIDATION_ERROR', message: 'contactName is required' } };
  }
  const contactName = b.contactName.trim();
  if (contactName.length < 1) {
    return { error: { code: 'VALIDATION_ERROR', message: 'contactName cannot be empty' } };
  }

  // contactPhone
  if (!b.contactPhone || typeof b.contactPhone !== 'string') {
    return { error: { code: 'VALIDATION_ERROR', message: 'contactPhone is required' } };
  }
  const contactPhone = b.contactPhone.trim();
  if (!isValidPhone(contactPhone)) {
    return { error: { code: 'VALIDATION_ERROR', message: 'Invalid contactPhone format' } };
  }

  // contactEmail
  if (!b.contactEmail || typeof b.contactEmail !== 'string') {
    return { error: { code: 'VALIDATION_ERROR', message: 'contactEmail is required' } };
  }
  const contactEmail = b.contactEmail.trim().toLowerCase();
  if (!isValidEmail(contactEmail)) {
    return { error: { code: 'VALIDATION_ERROR', message: 'Invalid contactEmail format' } };
  }

  // customerNote (optional)
  const customerNote =
    b.customerNote && typeof b.customerNote === 'string' ? b.customerNote.trim() : undefined;

  return {
    data: {
      activityId: b.activityId,
      planId: b.planId,
      scheduleId: b.scheduleId,
      startAt: b.startAt,
      timezone: b.timezone,
      participants: b.participants,
      sourceChannel,
      contactName,
      contactPhone,
      contactEmail,
      customerNote,
    },
  };
}

export async function POST(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id')?.trim() || crypto.randomUUID();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid JSON body'), { status: 400 });
  }

  // Validate request body
  const validation = parseAndValidateBody(body);
  if ('error' in validation) {
    return Response.json(errorV2(validation.error.code, validation.error.message), {
      status: 400,
    });
  }

  const { data } = validation;

  try {
    const supabase = await createClient();

    const resolvedPlan = await resolveBookingPlan(supabase, {
      activityId: data.activityId,
      planKey: data.planId,
      scheduleId: data.scheduleId ?? null,
    });

    if (!resolvedPlan.ok) {
      const status = resolvedPlan.code === 'AMBIGUOUS_PLAN' ? 409 : 404;
      return Response.json(
        {
          success: false,
          error: {
            code: resolvedPlan.code,
            message: resolvedPlan.messageEn,
            messageZh: resolvedPlan.messageZh,
            details: resolvedPlan.details,
          },
        },
        { status }
      );
    }

    const resolvedPlanId = resolvedPlan.planId;

    // 1. Fetch activity plan and verify it exists and is active
    const { data: planData, error: planError, schemaFallback: planSchemaFallback } =
      await loadActivityPlanWithMissingIsYearRoundFallback(async ({ includeIsYearRound }: { includeIsYearRound: boolean }) =>
        supabase
          .from('activity_plans')
          .select(
            `
        id,
        activity_id,
        name,
        duration_minutes,
        price_type,
        base_price,
        min_participants,
        max_participants,
        booking_type,
        ${includeIsYearRound ? 'is_year_round,' : ''}
        status,
        activities!inner (
          id,
          guide_id,
          title
        )
      `
          )
          .eq('id', resolvedPlanId)
          .eq('activity_id', data.activityId)
          .single()
      );

    if (planSchemaFallback) {
      console.warn('Activity plan schema fallback during booking draft', {
        activityId: data.activityId,
        planId: resolvedPlanId,
        schemaFallback: planSchemaFallback,
      });
    }

    if (planError || !planData) {
      const r = buildActivityPlanNotFoundResponse('PLAN_NOT_FOUND');
      return Response.json(r.body, { status: r.status });
    }

    if (planData.status !== 'active') {
      const r = buildActivityPlanNotFoundResponse('PLAN_NOT_ACTIVE');
      return Response.json(r.body, { status: r.status });
    }

    // Extract guide_id and activity info
    const activities = pickPlanActivityRelation(
      planData.activities as PlanActivityRelation | PlanActivityRelation[] | null
    );
    const guideId = activities?.guide_id;

    if (!guideId) {
      return Response.json(errorV2('INTERNAL_ERROR', 'Activity has no assigned guide'), {
        status: 500,
      });
    }

    // 2. Calculate slot end time
    const slotStartAt = new Date(data.startAt);
    const slotEndAt = addMinutes(slotStartAt, planData.duration_minutes);

    // 3. Server-side slot validation
    // Validate with legacy checks (past/blackout/booking overlap)
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

    const activeStatuses = [...CAPACITY_HOLD_BOOKING_STATUSES];
    const { data: bookingsData, error: bookingsError } = await supabase
      .from('bookings')
      .select('id, guide_id, start_at, end_at, status, participants, activity_id, activity_plan_id, order_id')
      .eq('guide_id', guideId)
      .in('status', activeStatuses);

    if (bookingsError) {
      console.error('Error fetching bookings:', bookingsError);
      return Response.json(errorV2('INTERNAL_ERROR', 'Failed to fetch bookings'), {
        status: 500,
      });
    }

    // #1493 讀取時過濾：逾時未付款 draft 佔位即時釋放（不必等排程取消）。
    const liveBookings = await dropExpiredUnpaidHolds(supabase, bookingsData || [], new Date().toISOString());

    // Fetch availability rules for buffer info
    const { data: rulesData } = await supabase
      .from('guide_availability_rules')
      .select('buffer_before_minutes, buffer_after_minutes')
      .eq('guide_id', guideId)
      .eq('is_active', true)
      .or(`activity_plan_id.is.null,activity_plan_id.eq.${resolvedPlanId}`)
      .limit(1);
    const bufferBefore = rulesData?.[0]?.buffer_before_minutes ?? 0;
    const bufferAfter = rulesData?.[0]?.buffer_after_minutes ?? 0;

    // Transform data for slot validator
    const blackouts: BlackoutWindow[] = (blackoutsData || []).map((row) => ({
      id: row.id,
      guide_id: row.guide_id,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      reason: row.reason,
      source: isManualOrSystemSource(row.source) ? row.source : 'manual',
    }));

    const bookings: ExistingBooking[] = liveBookings.map((row) => ({
      id: row.id,
      guide_id: row.guide_id,
      start_at: row.start_at,
      end_at: row.end_at,
      status: row.status,
      participants: normalizeBookingParticipants(row.participants),
      activity_id: row.activity_id ?? null,
      activity_plan_id: row.activity_plan_id ?? null,
    }));

    const slotDate = getDateStringInTimezone(slotStartAt, data.timezone);
    const effectiveExistingParticipantsForFormed = calculateExistingParticipantsForGroup({
      bookings,
      activityId: data.activityId,
      planId: resolvedPlanId,
      localDate: slotDate,
      timezone: data.timezone,
      statuses: FORMED_GROUP_BOOKING_STATUSES,
    });

    const effectiveExistingParticipantsForCapacityHold = calculateExistingParticipantsForGroup({
      bookings,
      activityId: data.activityId,
      planId: resolvedPlanId,
      localDate: slotDate,
      timezone: data.timezone,
      statuses: CAPACITY_HOLD_BOOKING_STATUSES,
    });

    const minParticipants =
      Number.isFinite(Number(planData.min_participants)) && Number(planData.min_participants) > 0
        ? Number(planData.min_participants)
        : 1;
    const capacityHoldRule = evaluateGroupBookingRule({
      minParticipants,
      maxParticipants: planData.max_participants,
      effectiveExistingParticipants: effectiveExistingParticipantsForCapacityHold,
      requestedParticipants: data.participants,
    });
    const groupRule = evaluateGroupBookingRule({
      minParticipants,
      maxParticipants: planData.max_participants,
      effectiveExistingParticipants: effectiveExistingParticipantsForFormed,
      requestedParticipants: data.participants,
    });
    const effectiveGroupRule =
      !capacityHoldRule.allowed && capacityHoldRule.reasonCode === 'CAPACITY_EXCEEDED'
        ? capacityHoldRule
        : groupRule;

    if (!effectiveGroupRule.allowed) {
      return Response.json(
        errorV2(
          effectiveGroupRule.reasonCode === 'CAPACITY_EXCEEDED' ? 'CAPACITY_EXCEEDED' : 'VALIDATION_ERROR',
          effectiveGroupRule.messageZh || '此行程目前無法預訂'
        ),
        { status: 400 }
      );
    }

    const nonGroupBookings = excludeSameActivityPlanDateBookings({
      bookings,
      activityId: data.activityId,
      planId: resolvedPlanId,
      localDate: slotDate,
      timezone: data.timezone,
    });

    const slotValidation = validateSlotAvailability(
      slotStartAt.toISOString(),
      slotEndAt.toISOString(),
      guideId,
      {
        blackouts,
        bookings: nonGroupBookings,
        bufferBefore,
        bufferAfter,
      }
    );

    let selectedScheduleValidation: { available: boolean; reason?: string } | null = null;
    let selectedScheduleForAvailability: ActivitySchedule | null = null;
    let selectedScheduleAuthority: 'authoritative' | 'fallback' | undefined;
    // 嚴格區隔（owner 拍板）：即時／申請預約只看導遊可行時間（動態規則），不看固定場次。
    // 因此即使前端帶入 scheduleId，instant／request 一律忽略，不解析固定場次；只有
    // scheduled 方案才以固定場次為唯一可預約來源。下方 SCHEDULE_REQUIRED 仍會擋住
    // scheduled 缺有效場次的情況。
    if (data.scheduleId && planData.booking_type === 'scheduled') {
      const { data: scheduleData, error: scheduleError } = await supabase
        .from('activity_schedules')
        .select('id, activity_id, plan_id, start_at, end_at, status, capacity, booked_count')
        .eq('id', data.scheduleId)
        .eq('activity_id', data.activityId)
        .maybeSingle();

      if (!scheduleError) {
        const selectedSchedule = (scheduleData as ActivitySchedule | null) ?? null;
        selectedScheduleForAvailability = selectedSchedule;
        selectedScheduleAuthority = selectedSchedule ? 'authoritative' : undefined;
        selectedScheduleValidation = validateDraftSlotAgainstSelectedSchedule({
          schedule: selectedSchedule,
          activityId: data.activityId,
          resolvedPlanId,
          requestStartAt: data.startAt,
          slotDate,
          timezone: data.timezone,
          participants: data.participants,
        });
      }

      if (
        shouldRejectDraftWhenSelectedScheduleInvalid({
          hasScheduleId: Boolean(data.scheduleId),
          selectedScheduleValidation,
        })
      ) {
        return Response.json(errorV2('SLOT_UNAVAILABLE', '此時段已無可用名額，請重新選擇時段'), {
          status: 409,
        });
      }

      if (
        shouldAttemptDraftSelectedScheduleFallback({
          hasScheduleId: Boolean(data.scheduleId),
          selectedScheduleValidation,
        })
      ) {
        const { data: fallbackSchedules, error: fallbackScheduleError } = await supabase
          .from('activity_schedules')
          .select('id, activity_id, plan_id, start_at, end_at, status, capacity, booked_count')
          .eq('activity_id', data.activityId)
          .eq('start_at', data.startAt)
          .or(`plan_id.eq.${resolvedPlanId},plan_id.is.null`)
          .order('plan_id', { ascending: false });

        if (!fallbackScheduleError && Array.isArray(fallbackSchedules) && fallbackSchedules.length > 0) {
          const fallbackSelectedSchedule = pickFallbackDraftSelectedSchedule({
            schedules: fallbackSchedules as ActivitySchedule[],
            activityId: data.activityId,
            resolvedPlanId,
            requestStartAt: data.startAt,
            slotDate,
            timezone: data.timezone,
            participants: data.participants,
          });

          if (fallbackSelectedSchedule) {
            selectedScheduleValidation = fallbackSelectedSchedule.validation;
            selectedScheduleForAvailability = fallbackSelectedSchedule.schedule;
            selectedScheduleAuthority = 'fallback';
          }
        }
      }
    }

    // #1110: When schedule.plan_id IS NULL (legacy shared schedule), the existing
    // planMatches check passes any plan UUID. Compare the requested plan's
    // duration_minutes against the DB schedule's real time window before continuing,
    // so a Plan B (7h) + Plan A timing (5.75h) submission gets rejected up front.
    const planScheduleMismatch = checkPlanScheduleDurationMismatch(
      planData,
      selectedScheduleForAvailability,
    );
    if (planScheduleMismatch) {
      return Response.json(
        errorV2(planScheduleMismatch.reasonCode, planScheduleMismatch.messageZh),
        { status: 422 },
      );
    }

    // 排程預約（scheduled）enforcement：固定場次是唯一可預約來源。必須解析到一個
    // 有效的 activity_schedule，否則拒絕 —— 旅客不得以動態規則時段預約此類方案。
    if (planData.booking_type === 'scheduled') {
      if (!selectedScheduleForAvailability) {
        return Response.json(
          errorV2('SCHEDULE_REQUIRED', '此方案僅開放預設場次預約，請選擇可預約的場次'),
          { status: 409 },
        );
      }
      if (selectedScheduleValidation?.available !== true) {
        return Response.json(
          errorV2('SLOT_UNAVAILABLE', '此場次已無可用名額，請重新選擇場次'),
          { status: 409 },
        );
      }
    }

    const scheduleValidatedBySourceOfTruth = selectedScheduleValidation?.available === true;

    // V2 權威驗證(含 admin conflict override 對 instant／request 動態時段的例外開放)
    // 先跑;若它放行(含 override),下方 legacy 與 selectedSchedule-invalid 阻擋就跳過,
    // 避免被既有預約衝突的 legacy 檢查擋掉已被管理者例外開放的時段。
    let generatedSlotValidation: {
      available: boolean;
      reasonCode?: string;
      messageZh?: string;
      conflictOverride?: SerializedSlot['conflictOverride'] | null;
    };
    try {
      generatedSlotValidation = await isSlotInGeneratedV2Availability(supabase, {
        guideId,
        planId: resolvedPlanId,
        activityId: data.activityId,
        timezone: data.timezone,
        participants: data.participants,
        planDurationMinutes: planData.duration_minutes,
        planMaxParticipants: planData.max_participants,
        planBookingType: planData.booking_type,
        planIsYearRound: Boolean(planData.is_year_round),
        slotDate,
        startAt: data.startAt,
        minParticipants,
            selectedSchedule: selectedScheduleForAvailability
          ? {
              id: selectedScheduleForAvailability.id,
              activity_id: selectedScheduleForAvailability.activity_id,
              plan_id: selectedScheduleForAvailability.plan_id,
              start_at: selectedScheduleForAvailability.start_at,
              end_at: addMinutes(new Date(selectedScheduleForAvailability.start_at), planData.duration_minutes).toISOString(),
              capacity: selectedScheduleForAvailability.capacity,
              booked_count: selectedScheduleForAvailability.booked_count,
              status: selectedScheduleForAvailability.status,
            }
          : null,
        selectedScheduleAuthority,
      });
    } catch (error) {
      console.error('Error generating slot availability', error);
      return Response.json(errorV2('INTERNAL_ERROR', 'Failed to validate slot availability'), {
        status: 500,
      });
    }

    if (
      !generatedSlotValidation.available &&
      shouldRejectDraftByLegacySlotAvailability({
        hasActiveAvailabilityRules: (rulesData?.length ?? 0) > 0,
        scheduleValidatedBySourceOfTruth,
        slotValidation,
      })
    ) {
      const errorMessages: Record<string, string> = {
        SLOT_IN_PAST: '所選時段已過期，請重新選擇時段',
        BLACKOUT_CONFLICT: '該時段暫停開放預約，請選擇其他時段',
        BOOKING_CONFLICT: '該時段已無可用名額，請選擇其他時段',
      };
      return Response.json(
        errorV2('SLOT_UNAVAILABLE', errorMessages[slotValidation.reason!] || '此時段已無可用名額，請重新選擇時段'),
        { status: 409 }
      );
    }

    if (
      !generatedSlotValidation.available &&
      shouldRejectDraftWhenSelectedScheduleInvalid({
        hasScheduleId: Boolean(data.scheduleId),
        selectedScheduleValidation,
      })
    ) {
      return Response.json(errorV2('SLOT_UNAVAILABLE', '此時段已無可用名額，請重新選擇時段'), {
        status: 409,
      });
    }

    if (
      shouldRejectDraftByEffectiveAvailability({
        scheduleValidatedBySourceOfTruth,
        generatedSlotValidation,
      })
    ) {
      const generatedReasonCode = generatedSlotValidation.reasonCode;
      const generatedMessageZh = generatedSlotValidation.messageZh;
      const generatedErrorCode =
        generatedReasonCode === 'CAPACITY_EXCEEDED'
          ? 'CAPACITY_EXCEEDED'
          : generatedReasonCode === 'MIN_PARTICIPANTS_NOT_MET'
            ? 'VALIDATION_ERROR'
            : 'SLOT_UNAVAILABLE';

      return Response.json(
        errorV2(generatedErrorCode, generatedMessageZh || '此時段已無可用名額，請重新選擇時段'),
        {
          status: generatedErrorCode === 'VALIDATION_ERROR' ? 400 : 409,
        }
      );
    }

    const conflictOverride = generatedSlotValidation.conflictOverride ?? null;
    const conflictOverrideId = conflictOverride?.id ?? null;
    const conflictOverrideState = conflictOverride ? 'allowed_with_admin_override' : null;
    const conflictOverrideSnapshot = conflictOverride
      ? {
          id: conflictOverride.id,
          reason: conflictOverride.reason,
          requiresHelper: conflictOverride.requiresHelper,
          helperStatus: conflictOverride.helperStatus,
          guideNote: conflictOverride.guideNote ?? null,
          adminNote: conflictOverride.adminNote ?? null,
          createdAt: conflictOverride.createdAt ?? null,
          createdByAdminEmail: conflictOverride.createdByAdminEmail ?? null,
          canonicalState: conflictOverrideState,
        }
      : null;

    // 4. Get or find traveler_id from auth (optional)
    let travelerId: string | null = null;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      travelerId = user?.id ?? null;
    } catch {
      // Not logged in, continue without traveler_id
    }

    // Soft-launch guard
    {
      const { createClient: createServiceClient } = await import('@supabase/supabase-js');
      const { getControls, isWhitelisted } = await import('../../../../../src/lib/soft-launch.mjs');
      const svc = createServiceClient(getSupabaseUrl()!, getSupabaseServiceRoleKey()!);
      const controls = await getControls(svc);
      if (controls.new_booking_paused) {
        const allowed = controls.whitelist_enabled ? await isWhitelisted(svc, { userId: travelerId ?? undefined, activityId: undefined, guideId: undefined }) : false;
        if (!allowed) {
          return Response.json(errorV2('BOOKING_PAUSED', '目前暫停接受新訂單，請稍後再試'), { status: 423 });
        }
      }
    }

    // 5. Calculate total amount
    let totalAmount: number;
    if (planData.price_type === 'per_person') {
      totalAmount = planData.base_price * data.participants;
    } else {
      // per_group
      totalAmount = planData.base_price;
    }

    // 6. Create booking (draft status)
    const bookingInsertPayload = {
      traveler_id: travelerId,
      guide_id: guideId,
      activity_id: data.activityId,
      activity_plan_id: resolvedPlanId,
      source_channel: data.sourceChannel,
      start_at: slotStartAt.toISOString(),
      end_at: slotEndAt.toISOString(),
      timezone: data.timezone,
      participants: data.participants,
      status: 'draft',
      // request plan → 'pending'（先審核後付款）；instant/scheduled → 'not_required'.
      guide_approval_status: initialApprovalStatusForBookingType(planData.booking_type),
      customer_note: data.customerNote || null,
      conflict_override_id: conflictOverrideId,
      conflict_override_snapshot: conflictOverrideSnapshot,
    };

    const {
      data: bookingInsert,
      error: bookingError,
      droppedColumns: droppedConflictOverrideColumns,
    } = await applyBookingConflictOverrideColumnFallback(
      async (payload: typeof bookingInsertPayload) =>
        supabase
          .from('bookings')
          .insert(payload)
          .select('id, booking_no, status')
          .single(),
      bookingInsertPayload,
    );

    if (droppedConflictOverrideColumns.length > 0) {
      console.warn('Conflict override booking-column schema fallback during draft create', {
        guideId,
        activityId: data.activityId,
        planId: resolvedPlanId,
        droppedColumns: droppedConflictOverrideColumns,
      });
    }

    if (bookingError || !bookingInsert) {
      console.error('Error creating booking:', bookingError);
      return Response.json(errorV2('INTERNAL_ERROR', 'Failed to create booking'), {
        status: 500,
      });
    }

    // 7. Create order (pending_payment status)
    // #1493 付款期限：instant/scheduled 自建立起算 24h；request 待審核 → null，
    // 審核通過時才於 approval gateway 起算。
    const paymentDeadlineAt = initialPaymentDeadlineForBookingType(
      planData.booking_type,
      new Date().toISOString(),
    );
    // #1493 部署順序安全：payment_deadline_at 萬一還沒套到正式 DB，剝除該欄位仍能建單
    // （退化為無期限，等同 legacy；不致整個下單流程 500）。
    const { data: orderInsert, error: orderError } = await applyWithOptionalColumnFallback(
      (p: any) => supabase.from('orders').insert(p).select('id, status').single(),
      {
        booking_id: bookingInsert.id,
        activity_id: data.activityId,
        user_id: travelerId,
        people_count: data.participants,
        contact_name: data.contactName,
        contact_phone: data.contactPhone,
        contact_email: data.contactEmail,
        status: 'pending_payment',
        payment_status: 'pending',
        total_twd: totalAmount,
        source_channel: data.sourceChannel,
        discount_amount: 0,
        payment_deadline_at: paymentDeadlineAt,
      },
      ['payment_deadline_at'],
    );

    if (orderError || !orderInsert) {
      console.error('Error creating order:', orderError);
      // Rollback booking
      await supabase.from('bookings').delete().eq('id', bookingInsert.id);
      return Response.json(errorV2('INTERNAL_ERROR', 'Failed to create order'), {
        status: 500,
      });
    }

    // 8. Update booking with order_id
    await supabase.from('bookings').update({ order_id: orderInsert.id }).eq('id', bookingInsert.id);

    // #1591 加購＋#1594 點數折抵：server 以 DB 快照重算、fail-soft 回寫金額（見 checkout/order-extras.mjs）。
    ({ totalAmount } = await applyOrderExtras({
      supabase, orderId: orderInsert.id, activityId: data.activityId, participants: data.participants,
      travelerId, totalAmount,
      addonSelections: (body as any)?.addonSelections, redeemPoints: (body as any)?.redeemPoints,
    }));

    // #1493 instant/scheduled：建立即起算付款期限 → 主動寄付款連結+截止時間（best-effort）。
    if (paymentDeadlineAt) {
      void import('../../../../../src/lib/payment-deadline-notify')
        .then(({ notifyPaymentDeadlineSet }) =>
          notifyPaymentDeadlineSet({ orderId: orderInsert.id, paymentDeadlineAt }))
        .catch((err) => {
          console.error('[payment-deadline-notify] draft fire-and-forget failed:', err);
        });
    }

    // 9. Create order_item
    const activityTitle = activities?.title ?? '行程預訂';
    const itemTitle = `${activityTitle} - ${planData.name}`;
    const { error: itemError } = await supabase.from('order_items').insert({
      order_id: orderInsert.id,
      item_type: 'activity_booking',
      ref_id: bookingInsert.id,
      booking_id: bookingInsert.id,
      title: itemTitle,
      quantity: planData.price_type === 'per_person' ? data.participants : 1,
      unit_price: planData.base_price,
      subtotal_amount: totalAmount,
      metadata: {
        planId: resolvedPlanId,
        activityId: data.activityId,
        startAt: slotStartAt.toISOString(),
        endAt: slotEndAt.toISOString(),
        participants: data.participants,
      },
    });

    if (itemError) {
      console.error('Error creating order item:', itemError);
      // Non-fatal, continue
    }

    // 10. Create booking_status_log
    await supabase.from('booking_status_logs').insert({
      booking_id: bookingInsert.id,
      from_status: null,
      to_status: 'draft',
      actor_user_id: travelerId,
      actor_role: travelerId ? 'traveler' : 'system',
      reason: 'Booking draft created',
      metadata: {
        sourceChannel: data.sourceChannel,
        correlationId,
        contactEmail: data.contactEmail,
        auditSignal: 'line_liff_draft_entry',
        conflictOverride: conflictOverrideSnapshot,
        overrideId: conflictOverrideId,
      },
    });

    // 三種預約模式：request 申請建立後主動通知導遊（email＋LINE、best-effort）——
    // 導遊審核制的入口通知；沒有這步導遊只能自己登入後台才會發現有申請。
    if (requiresGuideApproval(planData.booking_type)) {
      void import('../../../../../src/lib/booking-approval-notify')
        .then(({ notifyBookingApprovalRequested }) =>
          notifyBookingApprovalRequested({
            orderId: orderInsert.id,
            activityId: data.activityId,
            activityTitle,
            startAt: slotStartAt.toISOString(),
            peopleCount: data.participants,
            totalTwd: totalAmount,
          }))
        .catch((err) => {
          console.error('[booking-approval-notify] draft fire-and-forget failed:', err);
        });
    }

    // Return response per API spec
    return Response.json(
      successV2({
        bookingId: bookingInsert.id,
        bookingNo: bookingInsert.booking_no,
        bookingStatus: 'draft',
        orderId: orderInsert.id,
        orderStatus: 'pending_payment',
        amount: totalAmount,
        currency: 'TWD',
        // 三種預約模式：前端依此分流（request → 顯示「送出申請」、不進付款）。
        bookingType: normalizeBookingType(planData.booking_type),
        requiresApproval: requiresGuideApproval(planData.booking_type),
      })
    );
  } catch (err) {
    return handleRouteError(err, { route: 'v2/bookings/draft' });
  }
}
