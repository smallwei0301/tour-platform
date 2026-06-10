/**
 * Guide Availability Preview API (TP-BP-007)
 * GET - Preview own generated slots for a date range
 *
 * Strict ownership: Guide can only preview their own availability
 *
 * GH-1289: slot generation now goes through the canonical slot-generator.ts
 * so duration (slot length) and interval (cadence) are correctly distinct.
 * The hand-rolled divergent loop has been removed.
 */

import { NextRequest } from 'next/server';
import { ok, fail } from '../../../../src/lib/api';
import { verifyGuideSession } from '../../../../src/lib/guide-auth';
import {
  resolvePreviewCanonicalReason,
  summarizeActivePlanSeasons,
  type PreviewActivityPlanSeason,
} from '../../../../src/lib/availability-v2/preview-canonical-reasons.ts';
import {
  generateAvailableSlots,
  type SerializedSlot,
  type AvailabilityRule,
  type BlackoutWindow,
  type ExistingBooking,
  type ActivityPlan,
} from '../../../../src/lib/slot-generator.ts';
import { aggregateFallbackSeasonGate } from '../../../../src/lib/availability-v2/aggregate-fallback-season-gate.mjs';
import {
  generateFallbackPreviewSlots,
  type FallbackPlanMeta,
} from '../../../../src/lib/availability-v2/fallback-preview-slots.ts';

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const session = verifyGuideSession(request);
  if (!session) {
    return Response.json(fail('UNAUTHORIZED', 'Guide session required'), { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const timezone = searchParams.get('timezone') || 'Asia/Taipei';
  const activityPlanId = searchParams.get('activityPlanId');

  if (!dateFrom || !dateTo) {
    return Response.json(fail('VALIDATION_ERROR', 'dateFrom and dateTo are required'), { status: 400 });
  }

  if (!isValidTimezone(timezone)) {
    return Response.json(fail('VALIDATION_ERROR', 'Invalid timezone'), { status: 400 });
  }

  // Validate date format (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateFrom) || !dateRegex.test(dateTo)) {
    return Response.json(fail('VALIDATION_ERROR', 'Invalid date format (use YYYY-MM-DD)'), { status: 400 });
  }

  // Validate activityPlanId format if provided
  if (activityPlanId && !UUID_REGEX.test(activityPlanId)) {
    return Response.json(fail('VALIDATION_ERROR', 'Invalid activityPlanId format'), { status: 400 });
  }

  // Limit preview range to 14 days
  const fromDate = new Date(dateFrom);
  const toDate = new Date(dateTo);
  const daysDiff = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));

  if (daysDiff > 14) {
    return Response.json(fail('VALIDATION_ERROR', 'Preview range limited to 14 days'), { status: 400 });
  }
  if (daysDiff < 0) {
    return Response.json(fail('VALIDATION_ERROR', 'dateFrom must be before dateTo'), { status: 400 });
  }

  if (!process.env.SUPABASE_URL) {
    return Response.json(ok({
      guide: { id: session.guideId, display_name: session.guideName },
      timezone,
      dateFrom,
      dateTo,
      activityPlanId: activityPlanId || null,
      availabilitySource: 'canonical_slot_generator',
      previewReasonCode: 'SUPABASE_UNAVAILABLE',
      previewCanonicalState: 'outside_season',
      previewSeasonGate: 'no_active_season',
      isYearRound: false,
      activeSeasonSummaries: [],
      rulesCount: 0,
      blackoutsCount: 0,
      activeBookingsCount: 0,
      slots: [],
    }));
  }

  try {
    const supabase = await getSupabase();
    let previewPlanSeasons: PreviewActivityPlanSeason[] = [];
    let previewIsYearRound = false;

    // The resolved ActivityPlan for canonical slot generation (GH-1289)
    let canonicalPlan: ActivityPlan | null = null;

    // Validate activityPlanId ownership: must belong to this guide's activity
    if (activityPlanId) {
      const { data: planData, error: planError } = await supabase
        .from('activity_plans')
        .select(`
          id,
          status,
          is_year_round,
          duration_minutes,
          max_participants,
          booking_type,
          price_type,
          base_price,
          min_participants,
          activities!inner (
            id,
            guide_id
          )
        `)
        .eq('id', activityPlanId)
        .single();

      if (planError || !planData) {
        return Response.json(fail('VALIDATION_ERROR', 'activityPlanId not found'), { status: 400 });
      }

      // Check ownership: plan must belong to this guide
      const planActivities = planData.activities as { id: string; guide_id: string } | { id: string; guide_id: string }[] | null;
      const activityGuideId = Array.isArray(planActivities)
        ? planActivities[0]?.guide_id
        : planActivities?.guide_id;
      const activityId = Array.isArray(planActivities)
        ? planActivities[0]?.id
        : planActivities?.id;

      if (activityGuideId !== session.guideId) {
        return Response.json(fail('FORBIDDEN', 'activityPlanId belongs to another guide'), { status: 403 });
      }

      // Plan must be bookable (active) for preview
      if (planData.status !== 'active') {
        return Response.json(
          fail('VALIDATION_ERROR', 'activityPlanId refers to a non-bookable plan'),
          { status: 400 }
        );
      }

      // Build canonical ActivityPlan for slot generation (GH-1289)
      canonicalPlan = {
        id: planData.id,
        activity_id: activityId || '',
        duration_minutes: planData.duration_minutes ?? 60,
        max_participants: planData.max_participants ?? 10,
        booking_type: (planData.booking_type ?? 'scheduled') as 'scheduled' | 'request' | 'instant',
        price_type: planData.price_type as 'per_person' | 'per_group' | null,
        base_price: planData.base_price,
        min_participants: planData.min_participants,
        is_year_round: planData.is_year_round,
      };

      const { data: seasonsData } = await supabase
        .from('activity_plan_seasons')
        .select('id, activity_plan_id, start_month, start_day, end_month, end_day, timezone, is_active')
        .eq('activity_plan_id', activityPlanId);

      previewPlanSeasons = (seasonsData || []) as PreviewActivityPlanSeason[];
      previewIsYearRound = Boolean(planData.is_year_round);
    }

    // Fetch guide info
    const { data: guide } = await supabase
      .from('guide_profiles')
      .select('id, display_name')
      .eq('id', session.guideId)
      .single();

    // Fetch rules — filter by activityPlanId when provided (plan-scoped preview)
    let rulesQuery = supabase
      .from('guide_availability_rules')
      .select('*')
      .eq('guide_id', session.guideId)
      .eq('is_active', true);

    if (activityPlanId) {
      rulesQuery = rulesQuery.or(`activity_plan_id.is.null,activity_plan_id.eq.${activityPlanId}`);
    }

    const { data: rulesRaw } = await rulesQuery;
    const rules = (rulesRaw || []) as AvailabilityRule[];

    const planIds = Array.from(
      new Set(
        rules
          .map((rule) => (rule as { activity_plan_id?: string | null }).activity_plan_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      )
    );

    const planMetaByPlanId: Record<string, FallbackPlanMeta> = {};
    const isYearRoundByPlanId: Record<string, boolean> = {};
    if (planIds.length > 0) {
      const { data: plansData } = await supabase
        .from('activity_plans')
        .select('id, min_participants, is_year_round, duration_minutes, max_participants, booking_type')
        .in('id', planIds as string[]);
      for (const plan of plansData || []) {
        isYearRoundByPlanId[plan.id] = Boolean(plan.is_year_round);
        planMetaByPlanId[plan.id] = {
          duration_minutes: plan.duration_minutes ?? null,
          max_participants: plan.max_participants ?? null,
          booking_type: plan.booking_type ?? null,
          min_participants: plan.min_participants ?? null,
        };
      }
    }

    // #1307: when the guide opens the preview without selecting a
    // specific plan, the route used to skip the season query entirely
    // and resolvePreviewCanonicalReason then collapsed to
    // outside_season. Aggregate seasons across every plan referenced
    // by the guide's active rules instead, so a year-round (or
    // season-covered) plan opens the gate.
    if (!activityPlanId && planIds.length > 0) {
      const { data: aggregatedSeasonsData } = await supabase
        .from('activity_plan_seasons')
        .select('id, activity_plan_id, start_month, start_day, end_month, end_day, timezone, is_active')
        .in('activity_plan_id', planIds as string[]);
      const aggregated = aggregateFallbackSeasonGate({
        plansById: Object.fromEntries(
          Object.entries(isYearRoundByPlanId).map(([id, isYearRound]) => [id, { is_year_round: isYearRound }]),
        ),
        seasons: aggregatedSeasonsData ?? [],
      });
      previewPlanSeasons = aggregated.seasons as PreviewActivityPlanSeason[];
      previewIsYearRound = aggregated.isYearRound;
    }

    // Fetch blackouts in range
    const { data: blackoutsRaw } = await supabase
      .from('guide_blackout_dates')
      .select('*')
      .eq('guide_id', session.guideId)
      .lte('starts_at', dateTo + 'T23:59:59Z')
      .gte('ends_at', dateFrom + 'T00:00:00Z');
    const blackouts = (blackoutsRaw || []) as BlackoutWindow[];

    // Fetch active bookings in range (exclude cancelled/no_show).
    // GH-1301: include guide_id so slot-generator.getExistingBookings() can
    // filter by guide_id (it filters out rows where booking.guide_id !== guideId).
    // Without guide_id, all bookings were silently invisible to the generator,
    // causing dynamic re-emit to never trigger even when use_dynamic_reemit=true.
    // GH-1290 (v2): filter by activity_plan_id when previewing a specific plan
    // to avoid cross-plan booking contamination (e.g., Plan B's bookings should not
    // affect Plan A's slot generation).
    let bookingsQuery = supabase
      .from('bookings')
      .select('id, guide_id, start_at, end_at, status')
      .eq('guide_id', session.guideId)
      .not('status', 'in', '("cancelled","no_show")')
      .lte('start_at', dateTo + 'T23:59:59Z')
      .gte('end_at', dateFrom + 'T00:00:00Z');

    // GH-1290: filter by activity_plan_id when previewing a specific plan
    if (activityPlanId) {
      bookingsQuery = bookingsQuery.or(`activity_plan_id.is.null,activity_plan_id.eq.${activityPlanId}`);
    }

    const { data: bookingsRaw, error: bookingsError } = await bookingsQuery;

    // GH-1290: capture and report Supabase query errors instead of silently treating as zero bookings
    if (bookingsError) {
      console.error('Guide availability preview: bookings query error:', bookingsError);
      return Response.json(fail('BOOKING_QUERY_ERROR', `Bookings query failed: ${bookingsError.message}`), { status: 500 });
    }

    const bookings = (bookingsRaw || []) as ExistingBooking[];

    const previewCanonical = resolvePreviewCanonicalReason({
      requestedDate: dateFrom,
      timezone,
      isYearRound: previewIsYearRound,
      seasons: previewPlanSeasons,
    });
    const activeSeasonSummaries = summarizeActivePlanSeasons(previewPlanSeasons);

    // GH-1289: generate slots using the canonical slot-generator.
    // When activityPlanId is provided, we have the full plan and use generateAvailableSlots.
    // When no activityPlanId, the shared fallback helper threads each rule's own
    // activity_plan_id through the generator — plan-bound rules used to be silently
    // dropped here (#1307 follow-up), leaving the default preview permanently empty.
    let slots: Array<SerializedSlot & { minParticipants?: number | null; activityPlanId?: string | null }> = [];

    if (canonicalPlan && activityPlanId) {
      // Primary path (GH-1289 fix): use canonical generator with correct duration
      const result = generateAvailableSlots(
        {
          guideId: session.guideId,
          activityPlanId,
          dateFrom,
          dateTo,
          timezone,
          participants: 1,
        },
        {
          rules,
          blackouts,
          bookings,
          plan: canonicalPlan,
        }
      );
      slots = result.slots.map((slot) => ({
        ...slot,
        minParticipants: canonicalPlan!.min_participants ?? null,
        activityPlanId,
      }));
    } else {
      slots = generateFallbackPreviewSlots({
        guideId: session.guideId,
        rules,
        blackouts,
        bookings,
        dateFrom,
        dateTo,
        timezone,
        planMetaById: planMetaByPlanId,
      });
    }

    return Response.json(ok({
      guide: guide || { id: session.guideId, display_name: session.guideName },
      timezone,
      dateFrom,
      dateTo,
      activityPlanId: activityPlanId || null,
      availabilitySource: 'canonical_slot_generator',
      previewReasonCode: activityPlanId ? 'CANONICAL_GENERATOR' : 'LEGACY_FALLBACK_NO_PLAN',
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
    console.error('Availability preview API error:', err);
    return Response.json(fail('SERVER_ERROR', 'Server error'), { status: 500 });
  }
}

