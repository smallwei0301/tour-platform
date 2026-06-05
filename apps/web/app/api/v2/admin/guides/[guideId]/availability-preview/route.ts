/**
 * Guide Availability Preview API (TP-BP-007)
 * GET - Preview generated slots for a guide (for admin dashboard)
 */

import { NextRequest } from 'next/server';
import { successV2, errorV2 } from '../../../../../../../src/lib/api';
import { createClient } from '../../../../../../../src/lib/supabase/server';
import {
  resolvePreviewCanonicalReason,
  summarizeActivePlanSeasons,
  type PreviewActivityPlanSeason,
} from '../../../../../../../src/lib/availability-v2/preview-canonical-reasons.ts';
import {
  generateAvailableSlots,
  type AvailabilityRule,
  type BlackoutWindow,
  type ExistingBooking,
  type ActivityPlan,
  type SlotGeneratorInput,
  type SlotGeneratorDeps,
} from '../../../../../../../src/lib/slot-generator';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidDateString(str: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(str) && !isNaN(new Date(str).getTime());
}

function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ guideId: string }> }
) {
  const { guideId } = await context.params;
  const searchParams = request.nextUrl.searchParams;

  if (!UUID_REGEX.test(guideId)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid guideId'), { status: 400 });
  }

  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const timezone = searchParams.get('timezone') || 'Asia/Taipei';
  const activityPlanId = searchParams.get('activityPlanId');

  if (!dateFrom || !isValidDateString(dateFrom)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid dateFrom (YYYY-MM-DD)'), { status: 400 });
  }
  if (!dateTo || !isValidDateString(dateTo)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid dateTo (YYYY-MM-DD)'), { status: 400 });
  }
  if (!isValidTimezone(timezone)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid timezone'), { status: 400 });
  }

  // Limit to 14 days for preview
  const fromDate = new Date(dateFrom);
  const toDate = new Date(dateTo);
  const diffDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays > 14) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Preview limited to 14 days'), { status: 400 });
  }

  try {
    const supabase = await createClient();

    // Verify guide exists
    const { data: guide, error: guideError } = await supabase
      .from('guide_profiles')
      .select('id, display_name')
      .eq('id', guideId)
      .single();

    if (guideError || !guide) {
      return Response.json(errorV2('NOT_FOUND', 'Guide not found'), { status: 404 });
    }

    // Fetch availability rules
    const { data: rulesData } = await supabase
      .from('guide_availability_rules')
      .select('*')
      .eq('guide_id', guideId)
      .eq('is_active', true);

    // Fetch blackout dates
    const { data: blackoutsData } = await supabase
      .from('guide_blackout_dates')
      .select('*')
      .eq('guide_id', guideId);

    // Fetch existing bookings
    const activeStatuses = ['draft', 'pending_confirmation', 'confirmed', 'reschedule_requested'];
    const { data: bookingsData } = await supabase
      .from('bookings')
      .select('id, guide_id, start_at, end_at, status')
      .eq('guide_id', guideId)
      .in('status', activeStatuses);

    // Transform data
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
      source: row.source as 'manual' | 'system',
    }));

    const bookings: ExistingBooking[] = (bookingsData || []).map((row) => ({
      id: row.id,
      guide_id: row.guide_id,
      start_at: row.start_at,
      end_at: row.end_at,
      status: row.status,
    }));

    // Use real plan if activityPlanId provided, otherwise use mock plan for preview
    let plan: ActivityPlan;
    let resolvedPlanId: string;
    let previewPlanSeasons: PreviewActivityPlanSeason[] = [];
    let previewIsYearRound = false;

    if (activityPlanId && UUID_REGEX.test(activityPlanId)) {
      const { data: planData, error: planError } = await supabase
        .from('activity_plans')
        .select('id, activity_id, duration_minutes, max_participants, booking_type, is_year_round')
        .eq('id', activityPlanId)
        .single();

      if (planError || !planData) {
        return Response.json(errorV2('NOT_FOUND', 'Plan not found'), { status: 422 });
      }

      const { data: seasonsData } = await supabase
        .from('activity_plan_seasons')
        .select('id, activity_plan_id, start_month, start_day, end_month, end_day, timezone, is_active')
        .eq('activity_plan_id', activityPlanId);

      previewPlanSeasons = (seasonsData || []) as PreviewActivityPlanSeason[];
      previewIsYearRound = Boolean(planData.is_year_round);

      plan = {
        id: planData.id,
        activity_id: planData.activity_id,
        duration_minutes: planData.duration_minutes,
        max_participants: planData.max_participants,
        booking_type: planData.booking_type,
        is_year_round: planData.is_year_round,
      };
      resolvedPlanId = planData.id;
    } else {
      // Mock activity plan for preview (60 min duration)
      plan = {
        id: 'preview',
        activity_id: 'preview',
        duration_minutes: 60,
        max_participants: 10,
        booking_type: 'scheduled',
      };
      resolvedPlanId = 'preview';
    }

    const previewCanonical = resolvePreviewCanonicalReason({
      requestedDate: dateFrom,
      timezone,
      isYearRound: previewIsYearRound,
      seasons: previewPlanSeasons,
    });
    const activeSeasonSummaries = summarizeActivePlanSeasons(previewPlanSeasons);

    const input: SlotGeneratorInput = {
      guideId,
      activityPlanId: resolvedPlanId,
      dateFrom,
      dateTo,
      timezone,
      participants: 1,
    };

    const deps: SlotGeneratorDeps = {
      rules,
      blackouts,
      bookings,
      plan,
    };

    const result = generateAvailableSlots(input, deps);

    return Response.json(successV2({
      guide: { id: guide.id, display_name: guide.display_name },
      timezone: result.timezone,
      dateFrom,
      dateTo,
      activityPlanId: activityPlanId || null,
      previewCanonicalState: previewCanonical.canonicalState,
      previewSeasonGate: previewCanonical.seasonGate,
      isYearRound: previewIsYearRound,
      activeSeasonSummaries,
      rulesCount: rules.length,
      blackoutsCount: blackouts.length,
      activeBookingsCount: bookings.length,
      slots: result.slots,
    }));
  } catch (err) {
    console.error('Availability preview API error:', err);
    return Response.json(errorV2('INTERNAL_ERROR', 'Server error'), { status: 500 });
  }
}
