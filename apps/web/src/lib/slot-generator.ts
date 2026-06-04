/**
 * Slot Generator Engine (TP-BP-003)
 *
 * Server-side slot generation utility for V2 Booking Engine.
 * Inspired by Cal.com's availability/slot generation approach.
 *
 * Key principles:
 * - All times stored in UTC
 * - Slot generation is timezone-aware
 * - Server-first validation (never trust client)
 * - Buffers are respected for conflict detection
 */

// ============================================================================
// Types
// ============================================================================

export interface AvailabilityRule {
  id: string;
  guide_id: string;
  activity_plan_id: string | null;
  weekday: number; // 0-6 (0=Sunday)
  start_time_local: string; // "HH:MM" format
  end_time_local: string; // "HH:MM" format
  timezone: string; // e.g., "Asia/Taipei"
  slot_interval_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  effective_from: string | null; // "YYYY-MM-DD" or null
  effective_to: string | null; // "YYYY-MM-DD" or null
  is_active: boolean;
}

export interface BlackoutWindow {
  id: string;
  guide_id: string;
  starts_at: string; // ISO 8601 UTC
  ends_at: string; // ISO 8601 UTC
  reason?: string;
  source: 'manual' | 'system';
}

export interface ExistingBooking {
  id: string;
  guide_id: string;
  start_at: string; // ISO 8601 UTC
  end_at: string; // ISO 8601 UTC
  status: string;
  participants?: number;
  activity_id?: string | null;
  activity_plan_id?: string | null;
  buffer_before_minutes?: number;
  buffer_after_minutes?: number;
}

export interface ActivityPlan {
  id: string;
  activity_id: string;
  duration_minutes: number;
  max_participants: number;
  booking_type: 'scheduled' | 'request' | 'instant';
  price_type?: 'per_person' | 'per_group' | null;
  base_price?: number | null;
  min_participants?: number | null;
  is_year_round?: boolean | null;
}

export interface TimeSlot {
  startAt: Date;
  endAt: Date;
}

export interface SerializedSlot {
  startAt: string; // ISO 8601 with timezone offset
  endAt: string; // ISO 8601 with timezone offset
  capacityLeft: number;
  bookingType: 'scheduled' | 'request' | 'instant';
  isAvailable: boolean;
  canonicalState?: string;
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
}

export interface SlotGeneratorInput {
  guideId: string;
  activityPlanId: string;
  dateFrom: string; // "YYYY-MM-DD"
  dateTo: string; // "YYYY-MM-DD"
  timezone: string;
  participants?: number;
}

export interface SlotGeneratorResult {
  timezone: string;
  slots: SerializedSlot[];
}

// ============================================================================
// Date/Time Utilities
// ============================================================================

/**
 * Parse a time string "HH:MM" into hours and minutes
 */
export function parseTimeString(timeStr: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return { hours, minutes };
}

/**
 * Get the weekday (0-6, 0=Sunday) for a date in a specific timezone
 */
export function getWeekdayInTimezone(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: timezone,
  });
  const weekdayStr = formatter.format(date);
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return weekdayMap[weekdayStr] ?? 0;
}

/**
 * Get the date string "YYYY-MM-DD" for a date in a specific timezone
 */
export function getDateStringInTimezone(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: timezone,
  });
  return formatter.format(date);
}

/**
 * Create a Date object from a local date and time in a specific timezone
 */
export function createDateInTimezone(
  dateStr: string, // "YYYY-MM-DD"
  timeStr: string, // "HH:MM"
  timezone: string
): Date {
  // Parse the date and time components
  const [year, month, day] = dateStr.split('-').map(Number);
  const { hours, minutes } = parseTimeString(timeStr);

  // Create a date string that can be parsed with the timezone
  // We use a trick: create a date formatter that shows us the offset
  const testDate = new Date(year, month - 1, day, hours, minutes);

  // Get the offset for this timezone at this date/time
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  // Use the parts to figure out what UTC time corresponds to our local time
  const parts = formatter.formatToParts(testDate);
  const getPart = (type: string) =>
    parts.find((p) => p.type === type)?.value || '';

  // Calculate the difference between what we wanted and what we got
  const localYear = parseInt(getPart('year'));
  const localMonth = parseInt(getPart('month'));
  const localDay = parseInt(getPart('day'));
  const localHour = parseInt(getPart('hour'));
  const localMinute = parseInt(getPart('minute'));

  // If the local representation differs from what we created, adjust
  const diffYears = year - localYear;
  const diffMonths = month - localMonth;
  const diffDays = day - localDay;
  const diffHours = hours - localHour;
  const diffMinutes = minutes - localMinute;

  // Apply the differences to get the correct UTC time
  const result = new Date(testDate);
  result.setFullYear(result.getFullYear() + diffYears);
  result.setMonth(result.getMonth() + diffMonths);
  result.setDate(result.getDate() + diffDays);
  result.setHours(result.getHours() + diffHours);
  result.setMinutes(result.getMinutes() + diffMinutes);

  return result;
}

/**
 * Add minutes to a date
 */
export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

/**
 * Add days to a date
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Check if two time ranges overlap
 */
export function rangesOverlap(
  start1: Date,
  end1: Date,
  start2: Date,
  end2: Date
): boolean {
  return start1 < end2 && end1 > start2;
}

/**
 * Check if a date falls within a date range (inclusive)
 */
export function isDateInRange(
  dateStr: string, // "YYYY-MM-DD"
  fromStr: string | null,
  toStr: string | null
): boolean {
  if (fromStr && dateStr < fromStr) return false;
  if (toStr && dateStr > toStr) return false;
  return true;
}

/**
 * Format a date to ISO 8601 with timezone offset
 */
export function formatDateWithTimezone(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'longOffset',
  });

  const parts = formatter.formatToParts(date);
  const getPart = (type: string) =>
    parts.find((p) => p.type === type)?.value || '';

  const year = getPart('year');
  const month = getPart('month');
  const day = getPart('day');
  const hour = getPart('hour') === '24' ? '00' : getPart('hour');
  const minute = getPart('minute');
  const second = getPart('second');
  const tzName = getPart('timeZoneName');

  // Extract offset from timeZoneName (e.g., "GMT+8" or "GMT+08:00")
  const offsetMatch = tzName.match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
  let offset = '+00:00';
  if (offsetMatch) {
    const sign = offsetMatch[1];
    const hours = offsetMatch[2].padStart(2, '0');
    const mins = offsetMatch[3] || '00';
    offset = `${sign}${hours}:${mins}`;
  }

  return `${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`;
}

/**
 * Generate all dates in a range
 */
export function generateDateRange(
  fromStr: string, // "YYYY-MM-DD"
  toStr: string // "YYYY-MM-DD"
): string[] {
  const dates: string[] = [];
  let current = fromStr;
  while (current <= toStr) {
    dates.push(current);
    // Parse and add one day using UTC to avoid timezone-sensitive regressions.
    const [year, month, day] = current.split('-').map(Number);
    const nextDate = new Date(Date.UTC(year, month - 1, day + 1));
    current = nextDate.toISOString().split('T')[0];
  }
  return dates;
}

// ============================================================================
// Core Slot Generation Functions
// ============================================================================

/**
 * Filter availability rules for a specific guide and plan
 */
export function getAvailabilityRules(
  rules: AvailabilityRule[],
  guideId: string,
  planId: string | null
): AvailabilityRule[] {
  return rules.filter((rule) => {
    if (!rule.is_active) return false;
    if (rule.guide_id !== guideId) return false;
    // Rule applies if it's for all plans (null) or for the specific plan
    if (rule.activity_plan_id !== null && rule.activity_plan_id !== planId) {
      return false;
    }
    return true;
  });
}

/**
 * Get blackout windows for a guide that overlap with a date range
 */
export function getBlackoutWindows(
  blackouts: BlackoutWindow[],
  guideId: string,
  dateFrom: Date,
  dateTo: Date
): BlackoutWindow[] {
  return blackouts.filter((blackout) => {
    if (blackout.guide_id !== guideId) return false;
    const blackoutStart = new Date(blackout.starts_at);
    const blackoutEnd = new Date(blackout.ends_at);
    return rangesOverlap(blackoutStart, blackoutEnd, dateFrom, dateTo);
  });
}

/**
 * Get existing bookings for a guide that overlap with a date range
 * Only considers bookings in active states
 */
export function getExistingBookings(
  bookings: ExistingBooking[],
  guideId: string,
  dateFrom: Date,
  dateTo: Date
): ExistingBooking[] {
  const activeStatuses = [
    'draft',
    'pending_confirmation',
    'confirmed',
    'reschedule_requested',
  ];

  return bookings.filter((booking) => {
    if (booking.guide_id !== guideId) return false;
    if (!activeStatuses.includes(booking.status)) return false;
    const bookingStart = new Date(booking.start_at);
    const bookingEnd = new Date(booking.end_at);
    return rangesOverlap(bookingStart, bookingEnd, dateFrom, dateTo);
  });
}

/**
 * Build candidate slots for a single day based on an availability rule
 */
export function buildCandidateSlots(
  rule: AvailabilityRule,
  durationMinutes: number,
  dateStr: string // "YYYY-MM-DD"
): TimeSlot[] {
  const slots: TimeSlot[] = [];

  // Check if this date is within the rule's effective range
  if (!isDateInRange(dateStr, rule.effective_from, rule.effective_to)) {
    return slots;
  }

  // Create start and end times for this day in the rule's timezone
  const dayStart = createDateInTimezone(
    dateStr,
    rule.start_time_local,
    rule.timezone
  );
  const dayEnd = createDateInTimezone(
    dateStr,
    rule.end_time_local,
    rule.timezone
  );

  // Generate slots at the specified interval
  let slotStart = dayStart;
  while (true) {
    const slotEnd = addMinutes(slotStart, durationMinutes);

    // Slot must fit within the availability window
    if (slotEnd > dayEnd) {
      break;
    }

    slots.push({
      startAt: new Date(slotStart),
      endAt: new Date(slotEnd),
    });

    // Move to next potential slot
    slotStart = addMinutes(slotStart, rule.slot_interval_minutes);
  }

  return slots;
}

/**
 * Check if a slot conflicts with a blackout window
 */
export function slotConflictsWithBlackout(
  slot: TimeSlot,
  blackouts: BlackoutWindow[]
): boolean {
  for (const blackout of blackouts) {
    const blackoutStart = new Date(blackout.starts_at);
    const blackoutEnd = new Date(blackout.ends_at);
    if (rangesOverlap(slot.startAt, slot.endAt, blackoutStart, blackoutEnd)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a slot conflicts with an existing booking (including buffers)
 */
export function slotConflictsWithBooking(
  slot: TimeSlot,
  bookings: ExistingBooking[],
  bufferBefore: number,
  bufferAfter: number
): boolean {
  for (const booking of bookings) {
    const bookingStart = new Date(booking.start_at);
    const bookingEnd = new Date(booking.end_at);

    // Availability-rule buffers protect time around existing bookings.
    // A new candidate slot must not overlap the booked time plus the
    // required before/after buffer window.
    const bookingBufferBefore = booking.buffer_before_minutes || 0;
    const bookingBufferAfter = booking.buffer_after_minutes || 0;
    const bookingWithBufferStart = addMinutes(
      bookingStart,
      -(bufferBefore + bookingBufferBefore)
    );
    const bookingWithBufferEnd = addMinutes(
      bookingEnd,
      bufferAfter + bookingBufferAfter
    );

    if (
      rangesOverlap(
        slot.startAt,
        slot.endAt,
        bookingWithBufferStart,
        bookingWithBufferEnd
      )
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Filter out conflicting slots
 */
export function filterConflicts(
  candidates: TimeSlot[],
  blackouts: BlackoutWindow[],
  bookings: ExistingBooking[],
  bufferBefore: number,
  bufferAfter: number
): TimeSlot[] {
  return candidates.filter((slot) => {
    // Check blackout conflicts
    if (slotConflictsWithBlackout(slot, blackouts)) {
      return false;
    }

    // Check booking conflicts
    if (slotConflictsWithBooking(slot, bookings, bufferBefore, bufferAfter)) {
      return false;
    }

    return true;
  });
}

/**
 * Serialize slots for client consumption.
 *
 * Issue #880: `scheduleCapacityHint` (when provided) clamps `capacityLeft`
 * at the schedule-level available count, so the response never advertises
 * more seats than the underlying schedule can actually hold. Plan
 * `max_participants` remains the per-group ceiling.
 */
export function serializeSlots(
  slots: TimeSlot[],
  timezone: string,
  plan: ActivityPlan,
  participants: number = 1,
  scheduleCapacityHint?: number | null
): SerializedSlot[] {
  const cap =
    scheduleCapacityHint != null && Number.isFinite(scheduleCapacityHint)
      ? Math.min(plan.max_participants, scheduleCapacityHint)
      : plan.max_participants;
  return slots.map((slot) => ({
    startAt: formatDateWithTimezone(slot.startAt, timezone),
    endAt: formatDateWithTimezone(slot.endAt, timezone),
    capacityLeft: Math.max(0, cap - participants),
    bookingType: plan.booking_type,
    isAvailable: true,
  }));
}

// ============================================================================
// Main Entry Point
// ============================================================================

export interface SlotGeneratorDeps {
  rules: AvailabilityRule[];
  blackouts: BlackoutWindow[];
  bookings: ExistingBooking[];
  plan: ActivityPlan;
}

/**
 * Generate available slots for a guide and plan within a date range
 *
 * This is the main entry point for the slot generator.
 */
export function generateAvailableSlots(
  input: SlotGeneratorInput,
  deps: SlotGeneratorDeps
): SlotGeneratorResult {
  const { guideId, activityPlanId, dateFrom, dateTo, timezone, participants = 1 } = input;
  const { rules, blackouts, bookings, plan } = deps;

  // Filter rules for this guide and plan
  const applicableRules = getAvailabilityRules(rules, guideId, activityPlanId);

  // Parse date range boundaries for filtering
  const rangeStart = createDateInTimezone(dateFrom, '00:00', timezone);
  const rangeEnd = createDateInTimezone(dateTo, '23:59', timezone);

  // Get blackouts and bookings in range
  const relevantBlackouts = getBlackoutWindows(blackouts, guideId, rangeStart, rangeEnd);
  const relevantBookings = getExistingBookings(bookings, guideId, rangeStart, rangeEnd);

  // Generate all dates in the range
  const dates = generateDateRange(dateFrom, dateTo);

  // Build all candidate slots
  const allCandidates: TimeSlot[] = [];
  for (const dateStr of dates) {
    // Get the weekday for this date in the target timezone
    const dateInTz = createDateInTimezone(dateStr, '12:00', timezone);
    const weekday = getWeekdayInTimezone(dateInTz, timezone);

    // Find rules that apply to this weekday
    const rulesForDay = applicableRules.filter((r) => r.weekday === weekday);

    for (const rule of rulesForDay) {
      const candidates = buildCandidateSlots(rule, plan.duration_minutes, dateStr);
      allCandidates.push(...candidates);
    }
  }

  // Get buffer values from the first applicable rule (or default to 0)
  const bufferBefore = applicableRules[0]?.buffer_before_minutes ?? 0;
  const bufferAfter = applicableRules[0]?.buffer_after_minutes ?? 0;

  // Filter out conflicts
  const availableSlots = filterConflicts(
    allCandidates,
    relevantBlackouts,
    relevantBookings,
    bufferBefore,
    bufferAfter
  );

  // Sort slots by start time
  availableSlots.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

  // Serialize for client
  const serialized = serializeSlots(availableSlots, timezone, plan, participants);

  return {
    timezone,
    slots: serialized,
  };
}

/**
 * Validate that a specific slot is still available
 * Used for server-side validation before creating a booking
 */
export function validateSlotAvailability(
  slotStartAt: string, // ISO 8601
  slotEndAt: string, // ISO 8601
  guideId: string,
  deps: {
    blackouts: BlackoutWindow[];
    bookings: ExistingBooking[];
    bufferBefore: number;
    bufferAfter: number;
  }
): { available: boolean; reason?: string } {
  const slot: TimeSlot = {
    startAt: new Date(slotStartAt),
    endAt: new Date(slotEndAt),
  };

  // Check if slot is in the past
  if (slot.startAt < new Date()) {
    return { available: false, reason: 'SLOT_IN_PAST' };
  }

  // Check blackout conflicts
  const blackoutsForGuide = deps.blackouts.filter((b) => b.guide_id === guideId);
  if (slotConflictsWithBlackout(slot, blackoutsForGuide)) {
    return { available: false, reason: 'BLACKOUT_CONFLICT' };
  }

  // Check booking conflicts
  const bookingsForGuide = deps.bookings.filter((b) => b.guide_id === guideId);
  if (
    slotConflictsWithBooking(
      slot,
      bookingsForGuide,
      deps.bufferBefore,
      deps.bufferAfter
    )
  ) {
    return { available: false, reason: 'BOOKING_CONFLICT' };
  }

  return { available: true };
}
