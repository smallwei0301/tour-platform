/**
 * Canonical Booking Plan Resolver — Issue #882
 *
 * Single source of truth for Booking V2 plan resolution: takes (activityId,
 * planKey, scheduleId?) and returns either a resolved formal plan or a
 * controlled failure with stable error code + localized message.
 *
 * Resolution order (mirrors the inline fallback that used to live in
 * available-slots/route-handler.ts:215-266, now centralized):
 *
 *   1. planKey is UUID → activity_plans.id lookup
 *   2. planKey is slug → activity_plans.slug lookup
 *   3. scheduleId provided → activity_schedules.plan_id (recurse to step 1)
 *      - schedule.plan_id null + exactly one active plan → use it
 *      - schedule.plan_id null + multiple active plans → AMBIGUOUS_PLAN
 *   4. otherwise → PLAN_NOT_FOUND
 *
 * Downstream consumers planned: #881 publish gate, #883 data audit,
 * #884 capacity validator, #885 full-site crawl regression.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuidLike(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export type BookingPlanResolveErrorCode =
  | 'ACTIVITY_NOT_FOUND'
  | 'PLAN_NOT_FOUND'
  | 'PLAN_INACTIVE'
  | 'AMBIGUOUS_PLAN';

export type BookingPlanResolution =
  | 'uuid'
  | 'slug'
  | 'schedule_plan_id'
  | 'single_active_fallback';

export type ResolvedBookingPlan = {
  ok: true;
  activityId: string;
  planId: string;
  planSlug: string | null;
  scheduleId: string | null;
  planStatus: 'active';
  bookingType: string | null;
  resolution: BookingPlanResolution;
};

export type BookingPlanResolveFailure = {
  ok: false;
  code: BookingPlanResolveErrorCode;
  messageEn: string;
  messageZh: string;
  details: {
    planKey: string;
    activityId: string;
    scheduleId?: string | null;
  };
};

export type BookingPlanResolveResult =
  | ResolvedBookingPlan
  | BookingPlanResolveFailure;

export type ResolveBookingPlanArgs = {
  activityId: string;
  planKey: string;
  scheduleId?: string | null;
};

type ActivityPlanRow = {
  id: string;
  slug: string | null;
  status: string | null;
  booking_type?: string | null;
};

const MESSAGES: Record<BookingPlanResolveErrorCode, { en: string; zh: string }> = {
  ACTIVITY_NOT_FOUND: {
    en: 'Activity not found',
    zh: '找不到此活動,請從活動列表重新進入',
  },
  PLAN_NOT_FOUND: {
    en: 'Activity plan not found or no longer bookable',
    zh: '找不到此方案,可能已下架,請從活動頁重新選擇',
  },
  PLAN_INACTIVE: {
    en: 'Activity plan is not active',
    zh: '此方案目前未開放預約,請從活動頁選擇其他方案',
  },
  AMBIGUOUS_PLAN: {
    en: 'Multiple active plans match the requested schedule; cannot resolve unambiguously',
    zh: '此活動有多個方案,無法自動判斷,請從活動頁重新選擇明確方案',
  },
};

function fail(
  code: BookingPlanResolveErrorCode,
  args: ResolveBookingPlanArgs,
): BookingPlanResolveFailure {
  const out: BookingPlanResolveFailure = {
    ok: false,
    code,
    messageEn: MESSAGES[code].en,
    messageZh: MESSAGES[code].zh,
    details: { planKey: args.planKey, activityId: args.activityId },
  };
  if (args.scheduleId) out.details.scheduleId = args.scheduleId;
  return out;
}

function ok(
  args: ResolveBookingPlanArgs,
  plan: ActivityPlanRow,
  resolution: BookingPlanResolution,
): ResolvedBookingPlan {
  return {
    ok: true,
    activityId: args.activityId,
    planId: plan.id,
    planSlug: plan.slug ?? null,
    scheduleId: args.scheduleId ?? null,
    planStatus: 'active',
    bookingType: plan.booking_type ?? null,
    resolution,
  };
}

async function fetchPlanById(
  supabase: any,
  activityId: string,
  planId: string,
): Promise<ActivityPlanRow | null> {
  // Filter order matches the legacy inline lookups in available-slots route
  // (id then activity_id) so existing test mocks continue to assert the same
  // call signature without churn.
  const { data } = await supabase
    .from('activity_plans')
    .select('id, slug, status, booking_type')
    .eq('id', planId)
    .eq('activity_id', activityId)
    .maybeSingle();
  return data ?? null;
}

async function fetchPlanBySlug(
  supabase: any,
  activityId: string,
  slug: string,
): Promise<ActivityPlanRow | null> {
  const { data } = await supabase
    .from('activity_plans')
    .select('id, slug, status, booking_type')
    .eq('activity_id', activityId)
    .eq('slug', slug)
    .maybeSingle();
  return data ?? null;
}

async function fetchPlanByLegacyPlanId(
  supabase: any,
  activityId: string,
  legacyPlanId: string,
): Promise<ActivityPlanRow | null> {
  const { data } = await supabase
    .from('activity_plans')
    .select('id, slug, status, booking_type')
    .eq('activity_id', activityId)
    .eq('legacy_plan_id', legacyPlanId)
    .maybeSingle();
  return data ?? null;
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

function isResolvablePlanStatus(status: string | null | undefined): boolean {
  if (status == null) return true;
  return status === 'active';
}

export async function resolveBookingPlan(
  supabase: any,
  args: ResolveBookingPlanArgs,
): Promise<BookingPlanResolveResult> {
  if (!isUuidLike(args.activityId)) {
    return fail('ACTIVITY_NOT_FOUND', args);
  }

  // Step 1: UUID planKey passes through. Downstream plan-detail fetch in the
  // route handler already validates existence + active status (returns 404
  // NOT_FOUND for missing / inactive UUIDs), so we keep that contract intact
  // and avoid an extra round-trip on the common hot path.
  if (isUuidLike(args.planKey)) {
    return {
      ok: true,
      activityId: args.activityId,
      planId: args.planKey,
      planSlug: null,
      scheduleId: args.scheduleId ?? null,
      planStatus: 'active',
      bookingType: null,
      resolution: 'uuid',
    };
  }

  // Step 2: slug lookup in current activity scope.
  const slugLookup = await fetchPlanBySlug(supabase, args.activityId, args.planKey);
  if (slugLookup) {
    if (!isResolvablePlanStatus(slugLookup.status)) {
      return fail('PLAN_INACTIVE', args);
    }
    return ok(args, slugLookup, 'slug');
  }

  // Step 2.5: legacy_plan_id fallback (Issue #838 / post-rebase parity)
  const legacyLookup = await fetchPlanByLegacyPlanId(supabase, args.activityId, args.planKey);
  if (legacyLookup) {
    if (!isResolvablePlanStatus(legacyLookup.status)) {
      return fail('PLAN_INACTIVE', args);
    }
    return ok(args, legacyLookup, 'slug');
  }

  // Step 2.6: derived slug fallback (e.g. full-day-complete -> full-day)
  const derivedSlugCandidates = deriveLegacyPlanSlugCandidates(args.planKey);
  for (const candidate of derivedSlugCandidates) {
    const derivedSlugLookup = await fetchPlanBySlug(supabase, args.activityId, candidate);
    if (!derivedSlugLookup) continue;
    if (!isResolvablePlanStatus(derivedSlugLookup.status)) {
      return fail('PLAN_INACTIVE', args);
    }
    return ok(args, derivedSlugLookup, 'slug');
  }

  // Step 3: scheduleId fallback.
  const scheduleKey = args.scheduleId ?? null;
  if (!scheduleKey || !isUuidLike(scheduleKey)) {
    return fail('PLAN_NOT_FOUND', args);
  }

  const { data: scheduleRow } = await supabase
    .from('activity_schedules')
    .select('id, plan_id')
    .eq('id', scheduleKey)
    .eq('activity_id', args.activityId)
    .maybeSingle();

  if (!scheduleRow) {
    return fail('PLAN_NOT_FOUND', args);
  }

  if (scheduleRow.plan_id && isUuidLike(scheduleRow.plan_id)) {
    const planFromSchedule = await fetchPlanById(supabase, args.activityId, scheduleRow.plan_id);
    if (!planFromSchedule) {
      return fail('PLAN_NOT_FOUND', args);
    }
    if (planFromSchedule.status !== 'active') {
      return fail('PLAN_INACTIVE', args);
    }
    return ok(args, planFromSchedule, 'schedule_plan_id');
  }

  // schedule.plan_id is null → single-active-plan inference (sustained from #787)
  const { data: activePlans } = await supabase
    .from('activity_plans')
    .select('id, slug, status, booking_type')
    .eq('activity_id', args.activityId)
    .eq('status', 'active')
    .limit(2);

  if (!activePlans || activePlans.length === 0) {
    return fail('PLAN_NOT_FOUND', args);
  }
  if (activePlans.length === 1) {
    return ok(args, activePlans[0] as ActivityPlanRow, 'single_active_fallback');
  }
  return fail('AMBIGUOUS_PLAN', args);
}
