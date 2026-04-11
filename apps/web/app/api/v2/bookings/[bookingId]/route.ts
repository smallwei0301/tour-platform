import { NextRequest } from 'next/server';
import { successV2, errorV2 } from '../../../../../../src/lib/api';
import { createClient } from '../../../../../../src/lib/supabase/server';

function isValidUuid(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await context.params;

  if (!bookingId || !isValidUuid(bookingId)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid bookingId'), { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`id,booking_no,status,source_channel,start_at,end_at,timezone,participants,order_id,activities(id,title,slug),activity_plans(id,name,slug),orders(id,status,payment_status,total_twd)`)
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      return Response.json(errorV2('NOT_FOUND', 'Booking not found'), { status: 404 });
    }

    const activities = booking.activities as any;
    const plans = booking.activity_plans as any;
    const orders = booking.orders as any;

    return Response.json(successV2({
      id: booking.id,
      bookingNo: booking.booking_no,
      status: booking.status,
      sourceChannel: booking.source_channel,
      startAt: booking.start_at,
      endAt: booking.end_at,
      timezone: booking.timezone,
      participants: booking.participants,
      orderId: booking.order_id,
      activity: activities ? { id: activities.id, title: activities.title, slug: activities.slug } : null,
      plan: plans ? { id: plans.id, name: plans.name, slug: plans.slug } : null,
      order: orders ? { id: orders.id, status: orders.status, paymentStatus: orders.payment_status, totalTwd: orders.total_twd } : null,
    }));
  } catch (err) {
    console.error('Booking detail API error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json(errorV2('INTERNAL_ERROR', message), { status: 500 });
  }
}
