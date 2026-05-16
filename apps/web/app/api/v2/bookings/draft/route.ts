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
import {
  validateSlotAvailability,
  addMinutes,
  type BlackoutWindow,
  type ExistingBooking,
} from '../../../../../src/lib/slot-generator';

// Validation helpers
function isValidUuid(str: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
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

interface DraftBookingRequest {
  activityId: string;
  planId: string;
  startAt: string;
  timezone: string;
  participants: number;
  sourceChannel: SourceChannel;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  customerNote?: string;
}

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
  if (!isValidUuid(b.activityId)) {
    return { error: { code: 'VALIDATION_ERROR', message: 'Invalid activityId format' } };
  }

  // planId
  if (!b.planId || typeof b.planId !== 'string') {
    return { error: { code: 'VALIDATION_ERROR', message: 'planId is required' } };
  }
  if (!isValidUuid(b.planId)) {
    return { error: { code: 'VALIDATION_ERROR', message: 'Invalid planId format' } };
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
      .eq('id', data.planId)
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

    // Validate participants against plan limits
    if (data.participants < planData.min_participants) {
      return Response.json(
        errorV2(
          'VALIDATION_ERROR',
          `Minimum participants required: ${planData.min_participants}`
        ),
        { status: 400 }
      );
    }
    if (data.participants > planData.max_participants) {
      return Response.json(
        errorV2('CAPACITY_EXCEEDED', `Maximum participants allowed: ${planData.max_participants}`),
        { status: 400 }
      );
    }

    // 2. Calculate slot end time
    const slotStartAt = new Date(data.startAt);
    const slotEndAt = addMinutes(slotStartAt, planData.duration_minutes);

    // 3. Server-side slot validation
    // Fetch blackouts
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

    // Fetch existing bookings (active statuses)
    const activeStatuses = ['draft', 'pending_confirmation', 'confirmed', 'reschedule_requested'];
    const { data: bookingsData, error: bookingsError } = await supabase
      .from('bookings')
      .select('id, guide_id, start_at, end_at, status')
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
      .or(`activity_plan_id.is.null,activity_plan_id.eq.${data.planId}`)
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
    }));

    // Validate slot availability
    const slotValidation = validateSlotAvailability(
      slotStartAt.toISOString(),
      slotEndAt.toISOString(),
      guideId,
      {
        blackouts,
        bookings,
        bufferBefore,
        bufferAfter,
      }
    );

    if (!slotValidation.available) {
      const errorMessages: Record<string, string> = {
        SLOT_IN_PAST: 'The selected time slot is in the past',
        BLACKOUT_CONFLICT: 'The guide is not available at the selected time',
        BOOKING_CONFLICT: 'The selected time slot is already booked',
      };
      return Response.json(
        errorV2('SLOT_UNAVAILABLE', errorMessages[slotValidation.reason!] || 'Slot not available'),
        { status: 409 }
      );
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
        activity_plan_id: data.planId,
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
        planId: data.planId,
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
