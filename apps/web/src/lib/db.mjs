import {
  listExperiences as listInMemory,
  createOrder as createOrderInMemory,
  listMyOrders as listMyOrdersInMemory,
  getMyOrderDetail as getMyOrderDetailInMemory,
  createRefundRequest as createRefundRequestInMemory,
  listRefundRequests as listRefundRequestsInMemory,
  processPaymentCallback as processPaymentCallbackInMemory
} from './services.mjs';

function hasSupabaseEnv() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function listExperiencesDb() {
  if (!hasSupabaseEnv()) return listInMemory();

  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('activities')
    .select('id, slug, title, price_twd, guide_slug')
    .order('slug', { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []).map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    priceTwd: r.price_twd,
    guideSlug: r.guide_slug
  }));
}

export async function createOrderDb(input) {
  if (!hasSupabaseEnv()) return createOrderInMemory(input);

  const experienceSlug = String(input?.experienceSlug || '').trim();
  const scheduleId = String(input?.scheduleId || '').trim();
  const peopleCount = Number(input?.peopleCount || 0);

  if (!experienceSlug) throw new Error('experienceSlug is required');
  if (!scheduleId) throw new Error('scheduleId is required');
  if (!Number.isInteger(peopleCount) || peopleCount < 1) {
    throw new Error('peopleCount must be a positive integer');
  }

  const contactName = String(input?.contactName || '').trim();
  const contactPhone = String(input?.contactPhone || '').trim();
  const contactEmail = String(input?.contactEmail || '').trim();

  if (!contactName) throw new Error('contactName is required');
  if (!contactPhone) throw new Error('contactPhone is required');
  if (!contactEmail) throw new Error('contactEmail is required');

  const supabase = await getSupabase();

  const { data: activity, error: activityError } = await supabase
    .from('activities')
    .select('id, slug, price_twd')
    .eq('slug', experienceSlug)
    .single();

  if (activityError || !activity) throw new Error('experience not found');

  const { data: schedule, error: scheduleError } = await supabase
    .from('activity_schedules')
    .select('id, start_at, end_at, capacity, booked_count, status')
    .eq('id', scheduleId)
    .eq('activity_id', activity.id)
    .single();

  if (scheduleError || !schedule) throw new Error('schedule not found');
  if (schedule.status !== 'open') throw new Error('schedule is not open');

  const remaining = schedule.capacity - schedule.booked_count;
  if (peopleCount > remaining) throw new Error('not enough seats');

  const payload = {
    id: crypto.randomUUID(),
    activity_id: activity.id,
    schedule_id: schedule.id,
    people_count: peopleCount,
    contact_name: contactName,
    contact_phone: contactPhone,
    contact_email: contactEmail,
    status: 'pending_payment',
    total_twd: activity.price_twd * peopleCount
  };

  const { data: inserted, error: orderError } = await supabase
    .from('orders')
    .insert(payload)
    .select('id, status, total_twd, activity_id, schedule_id, people_count, contact_name, contact_phone, contact_email, created_at')
    .single();

  if (orderError || !inserted) throw new Error(orderError?.message || 'order create failed');

  return {
    id: inserted.id,
    status: inserted.status,
    totalTwd: inserted.total_twd,
    experienceId: inserted.activity_id,
    experienceSlug: activity.slug,
    scheduleId: inserted.schedule_id,
    scheduleStartAt: schedule.start_at,
    scheduleEndAt: schedule.end_at,
    peopleCount: inserted.people_count,
    contactName: inserted.contact_name,
    contactPhone: inserted.contact_phone,
    contactEmail: inserted.contact_email,
    createdAt: inserted.created_at,
    paidAt: null
  };
}

export async function listMyOrdersDb(input = {}) {
  if (!hasSupabaseEnv()) return listMyOrdersInMemory(input);

  const contactEmail = String(input?.contactEmail || '').trim();
  const supabase = await getSupabase();

  let query = supabase
    .from('orders')
    .select('id, status, total_twd, activity_id, schedule_id, people_count, contact_name, contact_phone, contact_email, created_at, paid_at')
    .order('created_at', { ascending: false });

  if (contactEmail) query = query.eq('contact_email', contactEmail);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const activityIds = [...new Set((data || []).map((r) => r.activity_id).filter(Boolean))];
  let activityMap = new Map();
  if (activityIds.length > 0) {
    const { data: acts } = await supabase
      .from('activities')
      .select('id, title, slug, guide_slug')
      .in('id', activityIds);
    activityMap = new Map((acts || []).map((a) => [a.id, a]));
  }

  return (data || []).map((r) => ({
    id: r.id,
    status: r.status,
    totalTwd: r.total_twd,
    experienceId: r.activity_id,
    experienceSlug: activityMap.get(r.activity_id)?.slug || null,
    title: activityMap.get(r.activity_id)?.title || null,
    guideSlug: activityMap.get(r.activity_id)?.guide_slug || null,
    scheduleId: r.schedule_id,
    peopleCount: r.people_count,
    contactName: r.contact_name,
    contactPhone: r.contact_phone,
    contactEmail: r.contact_email,
    createdAt: r.created_at,
    paidAt: r.paid_at
  }));
}

export async function getMyOrderDetailDb(input = {}) {
  const orderId = String(input?.orderId || '').trim();
  if (!orderId) throw new Error('orderId is required');

  if (!hasSupabaseEnv()) return getMyOrderDetailInMemory(input);

  const rows = await listMyOrdersDb(input);
  const target = rows.find((o) => o.id === orderId);
  if (!target) throw new Error('order not found');
  return target;
}

export async function createRefundRequestDb(input = {}) {
  if (!hasSupabaseEnv()) return createRefundRequestInMemory(input);

  const orderId = String(input?.orderId || '').trim();
  const reason = String(input?.reason || '').trim() || 'user_request';
  const note = String(input?.note || '').trim() || null;
  const contactEmail = String(input?.contactEmail || '').trim();

  if (!orderId) throw new Error('orderId is required');

  const supabase = await getSupabase();

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, status, contact_email')
    .eq('id', orderId)
    .single();

  if (orderError || !order) throw new Error('order not found');
  if (contactEmail && order.contact_email && contactEmail !== order.contact_email) {
    throw new Error('order not found');
  }

  if (['cancelled_by_user', 'cancelled_by_guide', 'refunded'].includes(order.status)) {
    throw new Error('order cannot request refund in current status');
  }

  const { data: existing } = await supabase
    .from('refund_requests')
    .select('id, status')
    .eq('order_id', orderId)
    .in('status', ['requested', 'reviewing', 'approved', 'processing'])
    .limit(1);

  if (existing && existing.length > 0) throw new Error('refund already requested');

  const payload = {
    id: crypto.randomUUID(),
    order_id: orderId,
    reason,
    note,
    status: 'requested',
    requested_at: new Date().toISOString()
  };

  const { data: inserted, error: insertError } = await supabase
    .from('refund_requests')
    .insert(payload)
    .select('id, order_id, reason, note, status, requested_at')
    .single();

  if (insertError || !inserted) throw new Error(insertError?.message || 'refund create failed');

  const { error: updateOrderError } = await supabase
    .from('orders')
    .update({ status: 'refund_pending' })
    .eq('id', orderId);

  if (updateOrderError) throw new Error(updateOrderError.message);

  return {
    id: inserted.id,
    orderId: inserted.order_id,
    reason: inserted.reason,
    note: inserted.note,
    status: inserted.status,
    requestedAt: inserted.requested_at,
    orderStatus: 'refund_pending'
  };
}

export async function listRefundRequestsDb(input = {}) {
  if (!hasSupabaseEnv()) return listRefundRequestsInMemory(input);

  const orderId = String(input?.orderId || '').trim();
  const supabase = await getSupabase();

  let query = supabase
    .from('refund_requests')
    .select('id, order_id, reason, note, status, requested_at, approved_at, refunded_at')
    .order('requested_at', { ascending: false });

  if (orderId) query = query.eq('order_id', orderId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data || []).map((r) => ({
    id: r.id,
    orderId: r.order_id,
    reason: r.reason,
    note: r.note,
    status: r.status,
    requestedAt: r.requested_at,
    approvedAt: r.approved_at,
    refundedAt: r.refunded_at
  }));
}

export async function processPaymentCallbackDb(input) {
  if (!hasSupabaseEnv()) return processPaymentCallbackInMemory(input);

  const orderId = String(input?.orderId || '').trim();
  if (!orderId) throw new Error('orderId is required');

  const supabase = await getSupabase();

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, status, total_twd, people_count, schedule_id')
    .eq('id', orderId)
    .single();

  if (orderError || !order) throw new Error('order not found');

  if (['paid', 'confirmed', 'completed'].includes(order.status)) {
    return { order: { id: order.id, status: order.status, totalTwd: order.total_twd }, scheduleUpdated: false };
  }

  const { data: schedule, error: scheduleError } = await supabase
    .from('activity_schedules')
    .select('id, capacity, booked_count, status')
    .eq('id', order.schedule_id)
    .single();

  if (scheduleError || !schedule) throw new Error('schedule not found for order');

  const remaining = schedule.capacity - schedule.booked_count;
  if (order.people_count > remaining) {
    throw new Error('schedule seats exhausted before payment confirmation');
  }

  const nextBooked = schedule.booked_count + order.people_count;
  const nextStatus = nextBooked >= schedule.capacity ? 'full' : schedule.status;

  const { error: scheduleUpdateError } = await supabase
    .from('activity_schedules')
    .update({ booked_count: nextBooked, status: nextStatus })
    .eq('id', schedule.id);

  if (scheduleUpdateError) throw new Error(scheduleUpdateError.message);

  const paidAt = new Date().toISOString();

  const { data: updatedOrder, error: updateOrderError } = await supabase
    .from('orders')
    .update({ status: 'paid', paid_at: paidAt })
    .eq('id', order.id)
    .select('id, status, total_twd, paid_at')
    .single();

  if (updateOrderError || !updatedOrder) throw new Error(updateOrderError?.message || 'order update failed');

  const { error: paymentInsertError } = await supabase
    .from('payments')
    .insert({
      id: crypto.randomUUID(),
      order_id: order.id,
      provider: 'ecpay',
      trade_no: String(input?.tradeNo || '').trim() || null,
      amount_twd: order.total_twd,
      status: 'paid',
      paid_at: paidAt,
      raw_payload: input || null
    });

  if (paymentInsertError) throw new Error(paymentInsertError.message);

  return {
    order: {
      id: updatedOrder.id,
      status: updatedOrder.status,
      totalTwd: updatedOrder.total_twd,
      paidAt: updatedOrder.paid_at
    },
    scheduleUpdated: true,
    schedule: {
      id: schedule.id,
      bookedCount: nextBooked,
      capacity: schedule.capacity,
      status: nextStatus
    }
  };
}
