import { ok, fail } from '../../../../../src/lib/api';
import { verifyGuideSession, maskEmail } from '../../../../../src/lib/guide-auth';

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(
  req: Request,
  context: { params: Promise<{ bookingId: string }> },
) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });

  const { bookingId } = await context.params;
  if (!bookingId) return Response.json(fail('BAD_REQUEST', 'bookingId required'), { status: 400 });

  const supabase = await getSupabase();

  // Fetch order
  const { data: order, error } = await supabase
    .from('orders')
    .select(`
      id, contact_name, contact_email, contact_phone,
      people_count, status, total_twd, paid_at, created_at, admin_note,
      activity_id, schedule_id,
      activity_schedules!orders_schedule_id_fkey(start_at, end_at, plan_id, capacity, booked_count)
    `)
    .eq('id', bookingId || '')
    .single();

  if (error || !order) {
    return Response.json(fail('NOT_FOUND', 'Order not found'), { status: 404 });
  }

  // Verify ownership: order.activity_id must belong to this guide
  const { data: activity } = await supabase
    .from('activities')
    .select('guide_id, title')
    .eq('id', order.activity_id)
    .single();

  if (!activity || activity.guide_id !== session.guideId) {
    return Response.json(fail('FORBIDDEN', '無權查看此訂單'), { status: 403 });
  }

  const schedule = Array.isArray(order.activity_schedules)
    ? order.activity_schedules[0]
    : order.activity_schedules;

  return Response.json(ok({
    id: order.id,
    guestName: order.contact_name || '未知',
    guestPhone: order.contact_phone || '',  // Full phone for guide
    maskedEmail: order.contact_email ? maskEmail(order.contact_email) : '',
    partySize: order.people_count,
    status: order.status,
    totalTwd: order.total_twd,
    paymentStatus: order.paid_at ? 'paid' : 'unpaid',
    paidAt: order.paid_at,
    createdAt: order.created_at,
    adminNote: order.admin_note,
    tourTitle: activity.title,
    schedule: schedule ? {
      date: schedule.start_at,
      endAt: schedule.end_at,
      planId: schedule.plan_id,
      capacity: schedule.capacity,
      bookedCount: schedule.booked_count,
    } : null,
  }));
}
