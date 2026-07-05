import { NextRequest } from 'next/server';
import { jsonOk, jsonError } from '../../../../../src/lib/api-response';
import { createClient } from '../../../../../src/lib/supabase/server';

type BookingActivity = { id: string; title: string; slug: string | null };
type BookingPlan = { id: string; name: string; slug: string | null };
type BookingOrder = { id: string; status: string; payment_status: string; total_twd: number };

type BookingRow = {
  id: string;
  booking_no: string;
  status: string;
  source_channel: string;
  start_at: string;
  end_at: string;
  timezone: string;
  participants: number;
  order_id: string | null;
  activities: BookingActivity | BookingActivity[] | null;
  activity_plans: BookingPlan | BookingPlan[] | null;
  orders: BookingOrder | BookingOrder[] | null;
};

function normalizeSingleRelation<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function isValidUuid(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await context.params;

  if (!bookingId || !isValidUuid(bookingId)) {
    return jsonError('VALIDATION_ERROR', 'Invalid bookingId', 400);
  }

  try {
    const supabase = await createClient();
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, booking_no, status, source_channel, start_at, end_at, timezone, participants, order_id, activities!inner(id, title, slug), activity_plans!inner(id, name, slug), orders!inner(id, status, payment_status, total_twd)')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      return jsonError('NOT_FOUND', 'Booking not found', 404);
    }

    const typedBooking = booking as BookingRow;
    const activities = normalizeSingleRelation(typedBooking.activities);
    const plans = normalizeSingleRelation(typedBooking.activity_plans);
    const orders = normalizeSingleRelation(typedBooking.orders);

    return jsonOk({
      id: booking.id,
      bookingNo: booking.booking_no,
      status: booking.status,
      sourceChannel: booking.source_channel,
      startAt: booking.start_at,
      endAt: booking.end_at,
      timezone: booking.timezone,
      participants: booking.participants,
      activity: activities ? { id: activities.id, title: activities.title, slug: activities.slug } : null,
      plan: plans ? { id: plans.id, name: plans.name, slug: plans.slug } : null,
      order: orders ? { id: orders.id, status: orders.status, paymentStatus: orders.payment_status, totalTwd: orders.total_twd } : null,
    });
  } catch (err) {
    console.error('Booking detail API error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError('INTERNAL_ERROR', message, 500);
  }
}
