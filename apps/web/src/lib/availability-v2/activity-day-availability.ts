import {
  buildCandidateSlots,
  formatDateWithTimezone,
  getWeekdayInTimezone,
  rangesOverlap,
  type ActivityPlan,
  type AvailabilityRule,
  type BlackoutWindow,
  type ExistingBooking,
} from '../slot-generator';

type SupabaseLike = {
  from: (table: string) => {
    select: (query: string) => any;
  };
};

type ActivityWithGuide = {
  id: string;
  guide_id: string;
};

export type V2AvailabilityDayStatus = 'open' | 'full' | 'not-open';

export interface V2AvailabilityDayPlanRow {
  date: string;
  planId: string;
  status: V2AvailabilityDayStatus;
  remaining: number;
  bookedCount: number;
  capacity: number;
  firstSlotStartAt: string | null;
  slotCount: number;
  timezone: string;
}

export interface V2AvailabilityResult {
  timezone: string;
  plans: V2AvailabilityDayPlanRow[];
}

interface QueryOptions {
  timezone: string;
  dateFrom: string;
  dateTo: string;
  participants: number;
}

type CandidateSlot = {
  startAt: Date;
  endAt: Date;
  startAtIso: string;
  remaining: number;
};

function toDateYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function defaultDateRange(): { dateFrom: string; dateTo: string } {
  const from = new Date();
  const to = new Date(from);
  to.setDate(to.getDate() + 30);
  return { dateFrom: toDateYmd(from), dateTo: toDateYmd(to) };
}

function normalizeRuleRow(row: any): AvailabilityRule {
  return {
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
  };
}

function normalizeBlackoutRow(row: any): BlackoutWindow {
  return {
    id: row.id,
    guide_id: row.guide_id,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    reason: row.reason,
    source: row.source === 'system' ? 'system' : 'manual',
  };
}

function normalizeBookingRow(row: any): ExistingBooking {
  return {
    id: row.id,
    guide_id: row.guide_id,
    start_at: row.start_at,
    end_at: row.end_at,
    status: row.status,
    participants: Number.isFinite(Number(row.participants)) ? Number(row.participants) : 1,
    activity_id: row.activity_id ?? null,
    activity_plan_id: row.activity_plan_id ?? null,
  } as ExistingBooking;
}

function normalizePlanRow(row: any): ActivityPlan {
  return {
    id: row.id,
    activity_id: row.activity_id,
    duration_minutes: row.duration_minutes,
    max_participants: row.max_participants,
    booking_type: row.booking_type,
  };
}

function slotConflictsWithBlackout(slot: { startAt: Date; endAt: Date }, blackouts: BlackoutWindow[]): boolean {
  return blackouts.some((blackout) =>
    rangesOverlap(slot.startAt, slot.endAt, new Date(blackout.starts_at), new Date(blackout.ends_at))
  );
}

function sumBookedParticipants(slot: { startAt: Date; endAt: Date }, bookings: ExistingBooking[]): number {
  return bookings.reduce((acc, booking: any) => {
    if (!rangesOverlap(slot.startAt, slot.endAt, new Date(booking.start_at), new Date(booking.end_at))) {
      return acc;
    }
    const participants = Number.isFinite(Number(booking.participants)) ? Number(booking.participants) : 1;
    return acc + Math.max(1, participants);
  }, 0);
}

function aggregateByDayAndPlan(
  rows: Array<{ plan: ActivityPlan; slots: CandidateSlot[] }>,
  timezone: string,
  dateFrom: string,
  dateTo: string
): V2AvailabilityDayPlanRow[] {
  const dateSet = new Set<string>();
  let cursor = new Date(`${dateFrom}T00:00:00.000Z`);
  const end = new Date(`${dateTo}T00:00:00.000Z`);
  while (cursor <= end) {
    dateSet.add(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const result: V2AvailabilityDayPlanRow[] = [];

  for (const { plan, slots } of rows) {
    const grouped = new Map<string, CandidateSlot[]>();
    for (const slot of slots) {
      const date = slot.startAtIso.slice(0, 10);
      const list = grouped.get(date) ?? [];
      list.push(slot);
      grouped.set(date, list);
    }

    for (const date of dateSet) {
      const daySlots = grouped.get(date) ?? [];
      const slotCount = daySlots.length;
      const remaining = daySlots.length > 0 ? Math.max(...daySlots.map((s) => s.remaining)) : 0;
      const firstSlotStartAt = daySlots.length > 0 ? daySlots[0].startAtIso : null;
      const capacity = plan.max_participants;
      const bookedCount = Math.max(0, capacity - remaining);
      let status: V2AvailabilityDayStatus = 'not-open';

      if (slotCount > 0) {
        status = remaining > 0 ? 'open' : 'full';
      }

      result.push({
        date,
        planId: plan.id,
        status,
        remaining,
        bookedCount,
        capacity,
        firstSlotStartAt,
        slotCount,
        timezone,
      });
    }
  }

  result.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.planId.localeCompare(b.planId);
  });

  return result;
}

export async function getV2ActivityAvailability(
  supabase: SupabaseLike,
  activityId: string,
  input: Partial<QueryOptions>
): Promise<V2AvailabilityResult> {
  const range = defaultDateRange();
  const options: QueryOptions = {
    timezone: input.timezone ?? 'Asia/Taipei',
    dateFrom: input.dateFrom ?? range.dateFrom,
    dateTo: input.dateTo ?? range.dateTo,
    participants: input.participants ?? 1,
  };

  const { data: activityData, error: activityError } = await supabase
    .from('activities')
    .select('id, guide_id')
    .eq('id', activityId)
    .maybeSingle();

  if (activityError) throw new Error(activityError.message);
  if (!activityData?.id || !activityData?.guide_id) throw new Error('activity not found');

  const activity = activityData as ActivityWithGuide;

  const { data: planData, error: planError } = await supabase
    .from('activity_plans')
    .select('id, activity_id, duration_minutes, max_participants, booking_type, status')
    .eq('activity_id', activity.id)
    .eq('status', 'active');

  if (planError) throw new Error(planError.message);
  const plans: ActivityPlan[] = (planData ?? []).map(normalizePlanRow);

  const { data: rulesData, error: rulesError } = await supabase
    .from('guide_availability_rules')
    .select('*')
    .eq('guide_id', activity.guide_id)
    .eq('is_active', true);

  if (rulesError) throw new Error(rulesError.message);

  const { data: blackoutsData, error: blackoutsError } = await supabase
    .from('guide_blackout_dates')
    .select('*')
    .eq('guide_id', activity.guide_id);

  if (blackoutsError) throw new Error(blackoutsError.message);

  const activeStatuses = ['draft', 'pending_confirmation', 'confirmed', 'reschedule_requested'];
  const { data: bookingsData, error: bookingsError } = await supabase
    .from('bookings')
    .select('id, guide_id, start_at, end_at, status, participants, activity_id, activity_plan_id')
    .eq('guide_id', activity.guide_id)
    .in('status', activeStatuses);

  if (bookingsError) throw new Error(bookingsError.message);

  const rules: AvailabilityRule[] = (rulesData ?? []).map(normalizeRuleRow);
  const blackouts: BlackoutWindow[] = (blackoutsData ?? []).map(normalizeBlackoutRow);
  const bookings: ExistingBooking[] = (bookingsData ?? []).map(normalizeBookingRow);

  const planRows = plans.map((plan) => {
    const scopedRules = rules.filter(
      (rule) => rule.activity_plan_id === null || rule.activity_plan_id === plan.id
    );

    const scopedBookings = bookings.filter((booking: any) => {
      const sameActivity = booking.activity_id === null || booking.activity_id === activity.id;
      const samePlan = booking.activity_plan_id === null || booking.activity_plan_id === plan.id;
      return sameActivity && samePlan;
    });

    const dateCursor = new Date(`${options.dateFrom}T00:00:00.000Z`);
    const dateEnd = new Date(`${options.dateTo}T00:00:00.000Z`);
    const candidateRows: CandidateSlot[] = [];

    while (dateCursor <= dateEnd) {
      const date = dateCursor.toISOString().slice(0, 10);
      const midday = new Date(`${date}T12:00:00.000Z`);
      const weekday = getWeekdayInTimezone(midday, options.timezone);
      const rulesForDay = scopedRules.filter((rule) => rule.weekday === weekday);

      for (const rule of rulesForDay) {
        const candidates = buildCandidateSlots(rule, plan.duration_minutes, date);
        for (const candidate of candidates) {
          if (slotConflictsWithBlackout(candidate, blackouts)) continue;

          const bookedParticipants = sumBookedParticipants(candidate, scopedBookings);
          const remaining = Math.max(0, plan.max_participants - bookedParticipants);

          candidateRows.push({
            startAt: candidate.startAt,
            endAt: candidate.endAt,
            startAtIso: formatDateWithTimezone(candidate.startAt, options.timezone),
            remaining,
          });
        }
      }

      dateCursor.setUTCDate(dateCursor.getUTCDate() + 1);
    }

    candidateRows.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

    return { plan, slots: candidateRows };
  });

  return {
    timezone: options.timezone,
    plans: aggregateByDayAndPlan(planRows, options.timezone, options.dateFrom, options.dateTo),
  };
}
