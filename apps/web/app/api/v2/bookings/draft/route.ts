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

import { NextRequest } from 'next/server';
import { successV2, errorV2 } from '../../../../../src/lib/api';
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
} from '../../../../../src/lib/slot-generator';
import { evaluateBookingAvailability } from '../../../../../src/lib/availability-v2/booking-availability-evaluator';
import {
  validateDraftSlotAgainstSelectedSchedule,
  shouldRejectDraftWhenSelectedScheduleInvalid,
  shouldAttemptDraftSelectedScheduleFallback,
  pickFallbackDraftSelectedSchedule,
} from '../../../../../src/lib/booking-v2-selected-schedule';
import {
  CAPACITY_HOLD_BOOKING_STATUSES,
  FORMED_GROUP_BOOKING_STATUSES,
  calculateExistingParticipantsForGroup,
  evaluateGroupBookingRule,
  excludeSameActivityPlanDateBookings,
  normalizeBookingParticipants,
} from '../../../../../src/lib/availability-v2/group-booking-rule';

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
  supabase: any,
  payload: {
    guideId: string;
    planId: string;
    activityId: string;
    timezone: string;
    participants: number;
    planDurationMinutes: number;
    planMaxParticipants: number;
    planBookingType: 'scheduled' | 'request' | 'instant';
    slotDate: string;
    startAt: string;
  }
): Promise<{ available: boolean; reason?: string }> {
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
    .select('id, guide_id, start_at, end_at, status, participants, activity_id, activity_plan_id')
    .eq('guide_id', payload.guideId)
    .in('status', activeStatuses);

  if (bookingsError) {
    throw new Error('Failed to fetch bookings');
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

  const bookings: ExistingBooking[] = (bookingsData || []).map((row: any) => ({
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

  const plan: ActivityPlan = {
    id: payload.planId,
    activity_id: payload.activityId,
    duration_minutes: payload.planDurationMinutes,
    max_participants: payload.planMaxParticipants,
    booking_type: payload.planBookingType,
  };

  const minParticipants = 1;
  const availability = evaluateBookingAvailability({
    guideId: payload.guideId,
    activityId: payload.activityId,
    planId: payload.planId,
    timezone: payload.timezone,
    participants: payload.participants,
    dateFrom: payload.slotDate,
    dateTo: payload.slotDate,
    minParticipants,
    rules,
    blackouts,
    bookings,
    plan,
  });

  const targetStart = new Date(payload.startAt).getTime();
  const isAvailable = availability.slots.some((slot) => new Date(slot.startAt).getTime() === targetStart);

  if (!isAvailable) {
    return { available: false, reason: availability.reasonCode ?? 'NOT_IN_GENERATED_SLOT_LIST' };
  }

  return { available: true };
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
    const { data: planData, error: planError } = await supabase
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
      .select('id, guide_id, start_at, end_at, status, participants, activity_id, activity_plan_id')
      .eq('guide_id', guideId)
      .in('status', activeStatuses);

    if (bookingsError) {
      console.error('Error fetching bookings:', bookingsError);
      return Response.json(errorV2('INTERNAL_ERROR', 'Failed to fetch bookings'), {
        status: 500,
      });
    }

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

    if (!slotValidation.available) {
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

    let selectedScheduleValidation: { available: boolean; reason?: string } | null = null;
    if (data.scheduleId) {
      const { data: scheduleData, error: scheduleError } = await supabase
        .from('activity_schedules')
        .select('id, activity_id, plan_id, start_at, status, capacity, booked_count')
        .eq('id', data.scheduleId)
        .eq('activity_id', data.activityId)
        .maybeSingle();

      if (!scheduleError) {
        selectedScheduleValidation = validateDraftSlotAgainstSelectedSchedule({
          schedule: (scheduleData as ActivitySchedule | null) ?? null,
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
          .select('id, activity_id, plan_id, start_at, status, capacity, booked_count')
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
          }
        }
      }
    }

    const scheduleValidatedBySourceOfTruth = selectedScheduleValidation?.available === true;
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

    let generatedSlotValidation: { available: boolean; reason?: string };
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
        slotDate,
        startAt: data.startAt,
      });
    } catch (error) {
      console.error('Error generating slot availability', error);
      return Response.json(errorV2('INTERNAL_ERROR', 'Failed to validate slot availability'), {
        status: 500,
      });
    }

    if (!scheduleValidatedBySourceOfTruth && !generatedSlotValidation.available) {
      return Response.json(errorV2('SLOT_UNAVAILABLE', '此時段已無可用名額，請重新選擇時段'), {
        status: 409,
      });
    }

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
      const svc = createServiceClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
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
    const { data: bookingInsert, error: bookingError } = await supabase
      .from('bookings')
      .insert({
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
        customer_note: data.customerNote || null,
      })
      .select('id, booking_no, status')
      .single();

    if (bookingError || !bookingInsert) {
      console.error('Error creating booking:', bookingError);
      return Response.json(errorV2('INTERNAL_ERROR', 'Failed to create booking'), {
        status: 500,
      });
    }

    // 7. Create order (pending_payment status)
    const { data: orderInsert, error: orderError } = await supabase
      .from('orders')
      .insert({
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
      })
      .select('id, status')
      .single();

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
      },
    });

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
      })
    );
  } catch (err) {
    console.error('Booking draft API error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json(errorV2('INTERNAL_ERROR', message), { status: 500 });
  }
}
