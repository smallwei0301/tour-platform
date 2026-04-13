/**
 * Guide Availability Preview API (TP-BP-007)
 * GET - Preview own generated slots for a date range
 *
 * Strict ownership: Guide can only preview their own availability
 */

import { NextRequest } from 'next/server';
import { ok, fail } from '../../../../src/lib/api';
import { verifyGuideSession } from '../../../../src/lib/guide-auth';

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

export async function GET(request: NextRequest) {
  const session = verifyGuideSession(request);
  if (!session) {
    return Response.json(fail('UNAUTHORIZED', 'Guide session required'), { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const timezone = searchParams.get('timezone') || 'Asia/Taipei';

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
      rulesCount: 0,
      blackoutsCount: 0,
      activeBookingsCount: 0,
      slots: [],
    }));
  }

  try {
    const supabase = await getSupabase();

    // Fetch guide info
    const { data: guide } = await supabase
      .from('guide_profiles')
      .select('id, display_name')
      .eq('id', session.guideId)
      .single();

    // Fetch rules
    const { data: rules } = await supabase
      .from('guide_availability_rules')
      .select('*')
      .eq('guide_id', session.guideId)
      .eq('is_active', true);

    // Fetch blackouts in range
    const { data: blackouts } = await supabase
      .from('guide_blackout_dates')
      .select('*')
      .eq('guide_id', session.guideId)
      .lte('starts_at', dateTo + 'T23:59:59Z')
      .gte('ends_at', dateFrom + 'T00:00:00Z');

    // Fetch active bookings in range (exclude cancelled/no_show)
    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, start_at, end_at, status')
      .eq('guide_id', session.guideId)
      .not('status', 'in', '("cancelled","no_show")')
      .lte('start_at', dateTo + 'T23:59:59Z')
      .gte('end_at', dateFrom + 'T00:00:00Z');

    // Generate slots using slot generator logic
    const slots = generatePreviewSlots(
      rules || [],
      blackouts || [],
      bookings || [],
      dateFrom,
      dateTo,
      timezone
    );

    return Response.json(ok({
      guide: guide || { id: session.guideId, display_name: session.guideName },
      timezone,
      dateFrom,
      dateTo,
      rulesCount: (rules || []).length,
      blackoutsCount: (blackouts || []).length,
      activeBookingsCount: (bookings || []).length,
      slots,
    }));
  } catch (err) {
    console.error('Availability preview API error:', err);
    return Response.json(fail('SERVER_ERROR', 'Server error'), { status: 500 });
  }
}

interface Rule {
  weekday: number;
  start_time_local: string;
  end_time_local: string;
  timezone: string;
  slot_interval_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  effective_from: string | null;
  effective_to: string | null;
  is_active: boolean;
}

interface Blackout {
  starts_at: string;
  ends_at: string;
}

interface Booking {
  start_at: string;
  end_at: string;
  status: string;
}

interface Slot {
  startAt: string;
  endAt: string;
  isAvailable: boolean;
}

function generatePreviewSlots(
  rules: Rule[],
  blackouts: Blackout[],
  bookings: Booking[],
  dateFrom: string,
  dateTo: string,
  timezone: string
): Slot[] {
  const slots: Slot[] = [];

  // Iterate through each day in the range
  const start = new Date(dateFrom);
  const end = new Date(dateTo);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    const dayOfWeek = d.getDay();

    // Find rules for this day
    const dayRules = rules.filter(r => {
      if (r.weekday !== dayOfWeek) return false;
      if (!r.is_active) return false;
      if (r.effective_from && dateStr < r.effective_from) return false;
      if (r.effective_to && dateStr > r.effective_to) return false;
      return true;
    });

    // Generate slots for each rule
    for (const rule of dayRules) {
      const [startHour, startMin] = rule.start_time_local.split(':').map(Number);
      const [endHour, endMin] = rule.end_time_local.split(':').map(Number);

      const ruleStartMinutes = startHour * 60 + startMin;
      const ruleEndMinutes = endHour * 60 + endMin;
      const interval = rule.slot_interval_minutes || 60;

      for (let m = ruleStartMinutes; m < ruleEndMinutes; m += interval) {
        const slotHour = Math.floor(m / 60);
        const slotMinute = m % 60;

        // Create slot time in the specified timezone
        const slotStart = new Date(`${dateStr}T${String(slotHour).padStart(2, '0')}:${String(slotMinute).padStart(2, '0')}:00`);
        const slotEnd = new Date(slotStart.getTime() + interval * 60 * 1000);

        // Convert to UTC for comparison (approximate - proper timezone handling would use a library)
        const slotStartISO = slotStart.toISOString();
        const slotEndISO = slotEnd.toISOString();

        // Check availability
        const isAvailable = !isSlotBlocked(
          slotStartISO,
          slotEndISO,
          blackouts,
          bookings,
          rule.buffer_before_minutes,
          rule.buffer_after_minutes
        );

        slots.push({
          startAt: slotStartISO,
          endAt: slotEndISO,
          isAvailable,
        });
      }
    }
  }

  // Sort by start time
  slots.sort((a, b) => a.startAt.localeCompare(b.startAt));

  return slots;
}

function isSlotBlocked(
  slotStart: string,
  slotEnd: string,
  blackouts: Blackout[],
  bookings: Booking[],
  bufferBefore: number,
  bufferAfter: number
): boolean {
  const slotStartTime = new Date(slotStart).getTime();
  const slotEndTime = new Date(slotEnd).getTime();

  // Check blackouts
  for (const b of blackouts) {
    const bStart = new Date(b.starts_at).getTime();
    const bEnd = new Date(b.ends_at).getTime();

    // Check overlap
    if (slotStartTime < bEnd && slotEndTime > bStart) {
      return true;
    }
  }

  // Check bookings with buffer
  const bufferMs = (bufferBefore + bufferAfter) * 60 * 1000;
  for (const booking of bookings) {
    if (booking.status === 'cancelled' || booking.status === 'no_show') continue;

    const bookingStart = new Date(booking.start_at).getTime() - bufferBefore * 60 * 1000;
    const bookingEnd = new Date(booking.end_at).getTime() + bufferAfter * 60 * 1000;

    // Check overlap
    if (slotStartTime < bookingEnd && slotEndTime > bookingStart) {
      return true;
    }
  }

  // Check if slot is in the past
  if (slotStartTime < Date.now()) {
    return true;
  }

  return false;
}
