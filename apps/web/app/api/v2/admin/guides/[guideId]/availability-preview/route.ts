/**
 * Guide Availability Preview API (TP-BP-007)
 * GET - Preview generated slots for a guide (for admin dashboard)
 */

import { NextRequest } from 'next/server';
import { successV2, errorV2 } from '../../../../../../../src/lib/api';
import { handleRouteError } from '../../../../../../../src/lib/route-error';
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
  type SerializedSlot,
} from '../../../../../../../src/lib/slot-generator';
import { aggregateFallbackSeasonGate } from '../../../../../../../src/lib/availability-v2/aggregate-fallback-season-gate.mjs';
import {
  generateFallbackPreviewSlots,
  type FallbackPlanMeta,
} from '../../../../../../../src/lib/availability-v2/fallback-preview-slots.ts';
import { isDynamicAvailabilityApplicable } from '../../../../../../../src/lib/booking-type-flow.mjs';

// 排程方案的預覽提示：只看固定場次，動態規則不適用，引導去場次管理。
const SCHEDULED_PREVIEW_NOTICE =
  '此方案為排程預約，僅使用固定場次，請至「場次管理」檢視固定場次；此處不套用動態可預約時段規則。';

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

    // Use real plan if activityPlanId provided, otherwise aggregate across
    // the plans referenced by the guide's rules (#1307 follow-up parity with
    // the guide-side preview: plan-bound rules must not be dropped, and the
    // season gate must aggregate instead of false-reporting outside_season).
    let previewPlanSeasons: PreviewActivityPlanSeason[] = [];
    let previewIsYearRound = false;
    let slots: SerializedSlot[] = [];

    if (activityPlanId && UUID_REGEX.test(activityPlanId)) {
      const { data: planData, error: planError } = await supabase
        .from('activity_plans')
        .select('id, activity_id, duration_minutes, max_participants, booking_type, is_year_round')
        .eq('id', activityPlanId)
        .single();

      if (planError || !planData) {
        return Response.json(errorV2('NOT_FOUND', 'Plan not found'), { status: 422 });
      }

      // 排程方案只看固定場次：不跑動態規則預覽，直接回提示與空時段，避免誤導。
      if (!isDynamicAvailabilityApplicable(planData.booking_type)) {
        return Response.json(successV2({
          guide: { id: guide.id, display_name: guide.display_name },
          timezone,
          dateFrom,
          dateTo,
          activityPlanId,
          previewBookingType: 'scheduled',
          previewNotice: SCHEDULED_PREVIEW_NOTICE,
          previewCanonicalState: null,
          previewSeasonGate: null,
          isYearRound: Boolean(planData.is_year_round),
          activeSeasonSummaries: [],
          rulesCount: rules.length,
          blackoutsCount: blackouts.length,
          activeBookingsCount: bookings.length,
          slots: [],
        }));
      }

      const { data: seasonsData } = await supabase
        .from('activity_plan_seasons')
        .select('id, activity_plan_id, start_month, start_day, end_month, end_day, timezone, is_active')
        .eq('activity_plan_id', activityPlanId);

      previewPlanSeasons = (seasonsData || []) as PreviewActivityPlanSeason[];
      previewIsYearRound = Boolean(planData.is_year_round);

      const plan: ActivityPlan = {
        id: planData.id,
        activity_id: planData.activity_id,
        duration_minutes: planData.duration_minutes,
        max_participants: planData.max_participants,
        booking_type: planData.booking_type,
        is_year_round: planData.is_year_round,
      };

      const result = generateAvailableSlots(
        { guideId, activityPlanId: planData.id, dateFrom, dateTo, timezone, participants: 1 },
        { rules, blackouts, bookings, plan },
      );
      slots = result.slots;
    } else {
      // No plan selected: thread each rule's own activity_plan_id through the
      // generator (the old mock 'preview' plan id dropped every plan-bound rule).
      const planIds = Array.from(
        new Set(rules.map((rule) => rule.activity_plan_id).filter((id): id is string => Boolean(id)))
      );

      const planMetaByPlanId: Record<string, FallbackPlanMeta> = {};
      const isYearRoundByPlanId: Record<string, boolean> = {};
      if (planIds.length > 0) {
        const { data: plansData } = await supabase
          .from('activity_plans')
          .select('id, min_participants, is_year_round, duration_minutes, max_participants, booking_type')
          .in('id', planIds);
        for (const plan of plansData || []) {
          isYearRoundByPlanId[plan.id] = Boolean(plan.is_year_round);
          planMetaByPlanId[plan.id] = {
            duration_minutes: plan.duration_minutes ?? null,
            max_participants: plan.max_participants ?? null,
            booking_type: plan.booking_type ?? null,
            min_participants: plan.min_participants ?? null,
          };
        }

        const { data: aggregatedSeasonsData } = await supabase
          .from('activity_plan_seasons')
          .select('id, activity_plan_id, start_month, start_day, end_month, end_day, timezone, is_active')
          .in('activity_plan_id', planIds);
        const aggregated = aggregateFallbackSeasonGate({
          plansById: Object.fromEntries(
            Object.entries(isYearRoundByPlanId).map(([id, isYearRound]) => [id, { is_year_round: isYearRound }]),
          ),
          seasons: aggregatedSeasonsData ?? [],
        });
        previewPlanSeasons = aggregated.seasons as PreviewActivityPlanSeason[];
        previewIsYearRound = aggregated.isYearRound;
      }

      slots = generateFallbackPreviewSlots({
        guideId,
        rules,
        blackouts,
        bookings,
        dateFrom,
        dateTo,
        timezone,
        planMetaById: planMetaByPlanId,
      });
    }

    const previewCanonical = resolvePreviewCanonicalReason({
      requestedDate: dateFrom,
      timezone,
      isYearRound: previewIsYearRound,
      seasons: previewPlanSeasons,
    });
    const activeSeasonSummaries = summarizeActivePlanSeasons(previewPlanSeasons);

    return Response.json(successV2({
      guide: { id: guide.id, display_name: guide.display_name },
      timezone,
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
      slots,
    }));
  } catch (err) {
    return handleRouteError(err, { route: 'v2/admin/guides/guide/availability-preview' });
  }
}
