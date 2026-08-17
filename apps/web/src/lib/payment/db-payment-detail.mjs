import { getSupabase, hasSupabaseEnv } from '../supabase-env.mjs';

/** Persisted checkout aggregate projection for the V2 payment boundary. */
export async function getMaterializedOrderDetailForPayment(orderId, injectedSupabase) {
  if (!injectedSupabase && !hasSupabaseEnv()) return null;
  const supabase = injectedSupabase ?? await getSupabase();
  const { data: order, error } = await supabase
    .from('orders')
    .select(`
      id, booking_id, status, payment_status, total_twd, contact_name, contact_email, activity_id,
      booking:bookings!orders_booking_id_fkey(id, order_id, status, source_inquiry_id, traveler_confirmation_status),
      items:order_items!order_items_order_id_fkey(order_id, booking_id, item_type, subtotal_amount, metadata)
    `)
    .eq('id', orderId)
    .maybeSingle();
  if (error) {
    const failure = new Error(error.message || 'failed to load payment order');
    failure.code = error.code;
    throw failure;
  }
  if (!order) return null;

  let title = null;
  if (order.activity_id) {
    const { data: activity, error: activityError } = await supabase.from('activities').select('title').eq('id', order.activity_id).maybeSingle();
    if (activityError) {
      const failure = new Error(activityError.message || 'failed to load payment activity');
      failure.code = activityError.code;
      throw failure;
    }
    title = activity?.title || null;
  }
  const booking = Array.isArray(order.booking) ? order.booking[0] ?? null : order.booking;
  return {
    id: order.id, bookingId: order.booking_id, status: order.status, paymentStatus: order.payment_status,
    totalTwd: order.total_twd, booking, items: order.items,
    sourceInquiryId: booking?.source_inquiry_id ?? null,
    travelerConfirmationStatus: booking?.traveler_confirmation_status ?? null,
    title,
    contactName: order.contact_name, contactEmail: order.contact_email,
  };
}
