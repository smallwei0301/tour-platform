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
  type AvailabilityRule,
  type BlackoutWindow,
  type ExistingBooking,
  type ActivityPlan,
} from '../../../../src/lib/slot-generator.ts';

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

    // Fetch blackouts in range
    const { data: blackoutsRaw } = await supabase
      .from('guide_blackout_dates')
      .select('*')
      .eq('guide_id', session.guideId)
      .lte('starts_at', dateTo + 'T23:59:59Z')
      .gte('ends_at', dateFrom + 'T00:00:00Z');
    const blackouts = (blackoutsRaw || []) as BlackoutWindow[];

    // Fetch active bookings in range (exclude cancelled/no_show)
    const { data: bookingsRaw } = await supabase
      .from('bookings')
      .select('id, start_at, end_at, status, buffer_before_minutes, buffer_after_minutes')
      .eq('guide_id', session.guideId)
      .not('status', 'in', '("cancelled","no_show")')
      .lte('start_at', dateTo + 'T23:59:59Z')
      .gte('end_at', dateFrom + 'T00:00:00Z');
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
    // When no activityPlanId, fall back to per-rule generation using slot_interval_minutes as
    // duration approximation (same behavior as before for the generic "all plans" preview).
    let slots: ReturnType<typeof generateAvailableSlots>['slots'] = [];

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
      slots = result.slots;
    } else {
      // Fallback path: no specific plan selected → aggregate preview across all rules
      // Each rule uses its own slot_interval_minutes as a duration approximation
      // (legacy behavior preserved for generic guide availability overview)
      slots = generateFallbackPreviewSlots(rules, blackouts, bookings, dateFrom, dateTo, timezone);
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

/**
 * Fallback slot generation for guide preview when no activityPlanId is specified.
 *
 * This path is only reached when the guide previews their general availability
 * without filtering by a specific activity plan. In this case we don't know the
 * plan duration, so we approximate by using slot_interval_minutes as duration
 * (this preserves the previous contiguous-slot behavior for generic previews).
 *
 * Note: This is intentionally a minimal fallback. The canonical path (with
 * activityPlanId) is the primary use case addressed by GH-1289.
 *
 * Returns SerializedSlot-compatible objects for the response payload.
 */
function generateFallbackPreviewSlots(
  rules: AvailabilityRule[],
  blackouts: BlackoutWindow[],
  bookings: ExistingBooking[],
  dateFrom: string,
  dateTo: string,
  timezone: string
): Array<{
  startAt: string;
  endAt: string;
  isAvailable: boolean;
  minParticipants?: number | null;
  capacityLeft?: number;
  bookingType?: string;
}> {
  // Use canonical generator per rule with duration approximated as slot_interval_minutes
  // Group rules and generate per-rule to respect different intervals
  const allSlots: Array<{
    startAt: string;
    endAt: string;
    isAvailable: boolean;
    capacityLeft: number;
    bookingType: string;
  }> = [];

  // Get unique interval values across rules to build synthetic plans
  const ruleGroups = new Map<number, AvailabilityRule[]>();
  for (const rule of rules) {
    const interval = rule.slot_interval_minutes || 60;
    if (!ruleGroups.has(interval)) {
      ruleGroups.set(interval, []);
    }
    ruleGroups.get(interval)!.push(rule);
  }

  for (const [interval, groupRules] of ruleGroups) {
    // Synthetic plan: duration = interval (contiguous slots, legacy behavior)
    const syntheticPlan: ActivityPlan = {
      id: 'fallback-synthetic',
      activity_id: 'fallback',
      duration_minutes: interval,
      max_participants: 99,
      booking_type: 'scheduled',
    };

    const guideId = groupRules[0]?.guide_id || '';
    const result = generateAvailableSlots(
      {
        guideId,
        activityPlanId: null,
        dateFrom,
        dateTo,
        timezone,
        participants: 1,
      },
      {
        rules: groupRules,
        blackouts,
        bookings,
        plan: syntheticPlan,
      }
    );

    for (const slot of result.slots) {
      allSlots.push({
        startAt: slot.startAt,
        endAt: slot.endAt,
        isAvailable: slot.isAvailable,
        capacityLeft: slot.capacityLeft,
        bookingType: slot.bookingType,
      });
    }
  }

  // Sort and deduplicate by startAt
  allSlots.sort((a, b) => a.startAt.localeCompare(b.startAt));
  const seen = new Set<string>();
  return allSlots.filter(s => {
    if (seen.has(s.startAt)) return false;
    seen.add(s.startAt);
    return true;
  });
}
