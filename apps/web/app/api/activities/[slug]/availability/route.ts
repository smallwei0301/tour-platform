import { ok, fail } from '../../../../../src/lib/api';
import { getV2ActivityAvailability, v2HasGeneratedSlots } from '../../../../../src/lib/availability-v2/activity-day-availability';

export const dynamic = 'force-dynamic';

type AvailabilitySchedule = {
  id: string | null;
  startAt: string;
  capacity: number;
  bookedCount: number;
  status: string;
  planId: string | null;
};

function resolveCacheTierSeconds(schedules: AvailabilitySchedule[]): 15 | 30 | 60 {
  if (schedules.length === 0) return 60;

  const now = Date.now();
  let minDaysUntilStart = Number.POSITIVE_INFINITY;

  for (const s of schedules) {
    const ms = new Date(s.startAt).getTime();
    if (!Number.isFinite(ms)) continue;
    const days = (ms - now) / (1000 * 60 * 60 * 24);
    if (days < minDaysUntilStart) minDaysUntilStart = days;
  }

  if (minDaysUntilStart <= 3) return 15;
  if (minDaysUntilStart <= 14) return 30;
  return 60;
}

async function getSupabaseAdmin() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function isV2AvailabilityMode(url: URL): boolean {
  const explicitSource = url.searchParams.get('source');
  const explicitMode = url.searchParams.get('mode');
  if (explicitSource === 'legacy' || explicitMode === 'legacy') return false;

  // BOOKING_V2=0 or BOOKING_V2=false allows env-level rollback to legacy
  const bookingV2 = process.env.BOOKING_V2;
  if (bookingV2 === '0' || bookingV2 === 'false') return false;

  return true;
}

function requestedAvailabilityMode(url: URL): 'v2' | 'legacy' | 'auto' {
  const explicitSource = url.searchParams.get('source');
  const explicitMode = url.searchParams.get('mode');
  if (explicitSource === 'legacy' || explicitMode === 'legacy') return 'legacy';

  const query = url.searchParams.get('v2');
  if (query === '1' || query === 'true') return 'v2';
  return 'auto';
}

function normalizeParticipants(url: URL): number {
  const raw = url.searchParams.get('participants');
  if (!raw) return 1;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

async function loadLegacySchedules(supabase: any, activityId: string, slug: string): Promise<AvailabilitySchedule[]> {
  const { data: snapshotRows, error: snapshotError } = await supabase
    .from('activity_availability_daily')
    .select('date, plan_id, total_capacity, total_booked, remaining, is_open')
    .eq('activity_id', activityId)
    .gte('date', new Date().toISOString().slice(0, 10))
    .order('date', { ascending: true });

  if (snapshotError) throw new Error(snapshotError.message);

  if (snapshotRows && snapshotRows.length > 0) {
    const hasPlanSpecificByDate = new Set(
      snapshotRows.filter((r: any) => r.plan_id).map((r: any) => String(r.date))
    );

    const normalized = snapshotRows.filter((r: any) => {
      if (!r.plan_id && hasPlanSpecificByDate.has(String(r.date))) return false;
      return true;
    });

    return normalized.map((r: Record<string, unknown>): AvailabilitySchedule => ({
      id: null,
      startAt: `${r.date}T00:00:00+08:00`,
      capacity: Number(r.total_capacity ?? 0),
      bookedCount: Number(r.total_booked ?? 0),
      status: r.is_open ? 'open' : 'full',
      planId: (r.plan_id as string | null) ?? null,
    }));
  }

  const { data, error } = await supabase
    .from('activity_schedules')
    .select('id,start_at,end_at,capacity,booked_count,status,plan_id,min_participants,activities!inner(slug)')
    .eq('activities.slug', slug)
    .order('start_at', { ascending: true });

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error('legacy_schedules_not_found');
  }

  return data.map((s: any) => {
    const capacity = Number(s.capacity ?? 0);
    const bookedCount = Number(s.booked_count ?? 0);
    return {
      id: s.id,
      startAt: s.start_at,
      capacity,
      bookedCount,
      status: s.status || (bookedCount >= capacity ? 'full' : 'open'),
      planId: s.plan_id ?? null,
    };
  });
}

export async function GET(req: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  if (!slug) {
    return Response.json(fail('INVALID_SLUG', 'slug is required'), { status: 400 });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json(fail('SUPABASE_DISABLED', 'availability requires supabase env'), { status: 503 });
  }

  try {
    const supabase = await getSupabaseAdmin();

    const { data: activityRow, error: activityError } = await supabase
      .from('activities')
      .select('id, slug')
      .eq('slug', slug)
      .maybeSingle();

    if (activityError) throw new Error(activityError.message);
    if (!activityRow?.id) {
      return Response.json(fail('NOT_FOUND', 'activity not found'), { status: 404 });
    }

    const requestUrl = new URL(req.url);
    const requestedMode = requestedAvailabilityMode(requestUrl);
    if (isV2AvailabilityMode(requestUrl)) {
      const timezone = requestUrl.searchParams.get('timezone') || 'Asia/Taipei';
      const dateFrom = requestUrl.searchParams.get('dateFrom') || undefined;
      const dateTo = requestUrl.searchParams.get('dateTo') || undefined;
      const participants = normalizeParticipants(requestUrl);

      try {
        const v2 = await getV2ActivityAvailability(supabase, activityRow.id, {
          timezone,
          dateFrom,
          dateTo,
          participants,
        });

        // When planConfigState signals that the plan is explicitly inactive or unconfigured,
        // do NOT fall back to legacy — showing legacy schedules for an inactive plan would
        // mislead travelers into thinking the activity is bookable. Return an explicit
        // unavailability notice instead. This is the fix for issue #1133.
        if (v2.planConfigState === 'no_active_plans' || v2.planConfigState === 'no_plans') {
          const availabilityNotice = v2.planConfigState === 'no_active_plans'
            ? '此活動方案目前未開放預約'
            : '此活動尚未設定方案';
          return Response.json(ok({
            type: 'v2',
            source: 'v2',
            planConfigState: v2.planConfigState,
            availabilityNotice,
            schedules: [],
            days: [],
          }), {
            headers: {
              'cache-control': 'public, s-maxage=60, stale-while-revalidate=120',
              'x-availability-cache-tier': '60',
              'x-availability-source': 'v2',
              'x-availability-requested-mode': requestedMode,
              'x-availability-plan-config-state': v2.planConfigState,
            },
          });
        }

        // When V2 produced zero candidate slots across the entire window, the
        // activity is not yet configured in V2 (no guide_availability_rules) but
        // has active plans. This is distinct from "genuinely full" (slotCount>0,
        // status='full') and distinct from inactive plans (handled above).
        // Fall back to the legacy snapshot so traveler-facing availability is not
        // inadvertently grayed out. v2-no-generated-slots header enables observability.
        if (!v2HasGeneratedSlots(v2.plans)) {
          try {
            const legacySchedules = await loadLegacySchedules(supabase, activityRow.id, slug);
            if (legacySchedules.length > 0) {
              const sMaxAge = resolveCacheTierSeconds(legacySchedules);
              return Response.json(ok({ schedules: legacySchedules, source: 'legacy_fallback' }), {
                headers: {
                  'cache-control': `public, s-maxage=${sMaxAge}, stale-while-revalidate=${Math.max(30, sMaxAge * 2)}`,
                  'x-availability-cache-tier': String(sMaxAge),
                  'x-availability-source': 'legacy-fallback',
                  'x-availability-requested-mode': requestedMode,
                  'x-availability-fallback-reason': 'v2-no-generated-slots',
                },
              });
            }
          } catch {
            // Legacy also unavailable → fall through to return the V2 result as-is
          }
        }

        const schedules: AvailabilitySchedule[] = v2.plans.map((row) => ({
          id: null,
          startAt: row.firstSlotStartAt ?? `${row.date}T00:00:00+08:00`,
          capacity: row.capacity,
          bookedCount: row.bookedCount,
          status: row.status,
          planId: row.planId,
        }));

        const sMaxAge = resolveCacheTierSeconds(schedules);
        return Response.json(ok({ schedules, timezone: v2.timezone, source: 'v2' }), {
          headers: {
            'cache-control': `public, s-maxage=${sMaxAge}, stale-while-revalidate=${Math.max(30, sMaxAge * 2)}`,
            'x-availability-cache-tier': String(sMaxAge),
            'x-availability-source': 'v2',
            'x-availability-requested-mode': requestedMode,
          },
        });
      } catch (_v2Error) {
        const schedules = await loadLegacySchedules(supabase, activityRow.id, slug);
        const sMaxAge = resolveCacheTierSeconds(schedules);

        return Response.json(ok({ schedules, source: 'legacy_fallback' }), {
          headers: {
            'cache-control': `public, s-maxage=${sMaxAge}, stale-while-revalidate=${Math.max(30, sMaxAge * 2)}`,
            'x-availability-cache-tier': String(sMaxAge),
            'x-availability-source': 'legacy-fallback',
            'x-availability-requested-mode': requestedMode,
          },
        });
      }
    }

    const schedules = await loadLegacySchedules(supabase, activityRow.id, slug);
    const sMaxAge = resolveCacheTierSeconds(schedules);

    return Response.json(ok({ schedules, source: 'legacy' }), {
      headers: {
        'cache-control': `public, s-maxage=${sMaxAge}, stale-while-revalidate=${Math.max(30, sMaxAge * 2)}`,
        'x-availability-cache-tier': String(sMaxAge),
        'x-availability-source': 'legacy',
        'x-availability-requested-mode': requestedMode,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    if (message === 'legacy_schedules_not_found') {
      return Response.json(fail('NOT_FOUND', 'activity not found or no schedules'), { status: 404 });
    }
    return Response.json(fail('LOAD_AVAILABILITY_FAILED', message), { status: 500 });
  }
}
