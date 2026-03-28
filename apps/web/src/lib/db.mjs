import {
  listExperiences as listInMemory,
  createOrder as createOrderInMemory,
  listMyOrders as listMyOrdersInMemory,
  getMyOrderDetail as getMyOrderDetailInMemory,
  createRefundRequest as createRefundRequestInMemory,
  listRefundRequests as listRefundRequestsInMemory,
  createGuideApplication as createGuideApplicationInMemory,
  listGuideApplications as listGuideApplicationsInMemory,
  updateGuideApplicationStatus as updateGuideApplicationStatusInMemory,
  processPaymentCallback as processPaymentCallbackInMemory
} from './services.mjs';
import {
  listAdminOrdersFallback,
  getAdminOrderDetailFallback,
  updateAdminOrderFallback,
  listOrderAuditLogsFallback,
  applyAdminOrderExceptionFallback,
  listOperationsTrackingFallback,
  updateOperationsTrackingFallback,
  operationsTrackingSummaryFallback,
  operationsTrackingCsvFallback,
  listAdminRefundRequestsFallback,
  updateAdminRefundStatusFallback
} from './admin.mjs';

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

export async function listAdminOrdersDb(input = {}) {
  if (!hasSupabaseEnv()) return listAdminOrdersFallback(input);

  const status = String(input?.status || '').trim();
  const contactEmail = String(input?.contactEmail || '').trim();
  const supabase = await getSupabase();

  let query = supabase
    .from('orders')
    .select('id, status, total_twd, activity_id, schedule_id, people_count, contact_name, contact_phone, contact_email, created_at, paid_at, admin_note, updated_at')
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);
  if (contactEmail) query = query.eq('contact_email', contactEmail);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const activityIds = [...new Set((data || []).map((r) => r.activity_id).filter(Boolean))];
  let activityMap = new Map();
  if (activityIds.length > 0) {
    const { data: acts } = await supabase
      .from('activities')
      .select('id, title, slug')
      .in('id', activityIds);
    activityMap = new Map((acts || []).map((a) => [a.id, a]));
  }

  return (data || []).map((r) => {
    const costTwd = Math.round(r.total_twd * 0.65);
    return {
      id: r.id,
      status: r.status,
      totalTwd: r.total_twd,
      costTwd,
      marginTwd: r.total_twd - costTwd,
      title: activityMap.get(r.activity_id)?.title || null,
      experienceSlug: activityMap.get(r.activity_id)?.slug || null,
      peopleCount: r.people_count,
      scheduleId: r.schedule_id,
      contactName: r.contact_name,
      contactPhone: r.contact_phone,
      contactEmail: r.contact_email,
      createdAt: r.created_at,
      paidAt: r.paid_at,
      adminNote: r.admin_note,
      updatedAt: r.updated_at
    };
  });
}

export async function getAdminOrderDetailDb(input = {}) {
  const orderId = String(input?.orderId || '').trim();
  if (!orderId) throw new Error('orderId is required');

  if (!hasSupabaseEnv()) return getAdminOrderDetailFallback({ orderId });

  const rows = await listAdminOrdersDb({});
  const row = rows.find((r) => r.id === orderId);
  if (!row) throw new Error('order not found');
  return row;
}

export async function updateAdminOrderDb(input = {}) {
  if (!hasSupabaseEnv()) return updateAdminOrderFallback(input);

  const orderId = String(input?.orderId || '').trim();
  const status = String(input?.status || '').trim();
  const adminNote = input?.adminNote == null ? null : String(input?.adminNote).trim();

  if (!orderId) throw new Error('orderId is required');

  const validStatuses = [
    'pending_payment', 'paid', 'confirmed', 'rejected', 'cancelled_by_user', 'cancelled_by_guide', 'completed', 'refund_pending', 'refunded'
  ];

  const patch = { updated_at: new Date().toISOString() };
  if (status) {
    if (!validStatuses.includes(status)) throw new Error('invalid order status');
    patch.status = status;
  }
  if (adminNote !== null) patch.admin_note = adminNote;

  const supabase = await getSupabase();
  const { error } = await supabase.from('orders').update(patch).eq('id', orderId);
  if (error) throw new Error(error.message);

  return getAdminOrderDetailDb({ orderId });
}

export async function listOrderAuditLogsDb(input = {}) {
  const orderId = String(input?.orderId || '').trim();
  if (!orderId) throw new Error('orderId is required');

  if (!hasSupabaseEnv()) return listOrderAuditLogsFallback({ orderId });

  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, order_id, actor, action, metadata, created_at')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  return (data || []).map((r) => ({
    id: r.id,
    orderId: r.order_id,
    actor: r.actor,
    action: r.action,
    metadata: r.metadata,
    createdAt: r.created_at
  }));
}

export async function applyAdminOrderExceptionDb(input = {}) {
  if (!hasSupabaseEnv()) return applyAdminOrderExceptionFallback(input);

  const orderId = String(input?.orderId || '').trim();
  const action = String(input?.action || '').trim();
  const targetScheduleId = String(input?.targetScheduleId || '').trim();
  const newCapacity = input?.newCapacity == null ? null : Number(input?.newCapacity);
  const adminNote = String(input?.adminNote || '').trim() || null;

  if (!orderId) throw new Error('orderId is required');
  if (!['reschedule', 'adjust_capacity', 'oversell_fix'].includes(action)) throw new Error('invalid exception action');

  const supabase = await getSupabase();

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, status, people_count, schedule_id, activity_id')
    .eq('id', orderId)
    .single();
  if (orderError || !order) throw new Error('order not found');

  const { data: schedules, error: schErr } = await supabase
    .from('activity_schedules')
    .select('id, activity_id, start_at, end_at, capacity, booked_count, status')
    .eq('activity_id', order.activity_id);
  if (schErr) throw new Error(schErr.message);

  const current = (schedules || []).find((s) => s.id === order.schedule_id);
  const target = targetScheduleId ? (schedules || []).find((s) => s.id === targetScheduleId) : current;
  if (!target) throw new Error('target schedule not found');

  if (action === 'reschedule') {
    if (!targetScheduleId) throw new Error('targetScheduleId is required');
    if (current && current.id !== target.id && current.booked_count >= order.people_count) {
      const newBooked = current.booked_count - order.people_count;
      await supabase.from('activity_schedules').update({
        booked_count: newBooked,
        status: newBooked >= current.capacity ? 'full' : 'open'
      }).eq('id', current.id);
    }

    const remaining = target.capacity - target.booked_count;
    if (remaining < order.people_count) throw new Error('target schedule not enough seats');

    const targetBooked = target.booked_count + order.people_count;
    await supabase.from('activity_schedules').update({
      booked_count: targetBooked,
      status: targetBooked >= target.capacity ? 'full' : 'open'
    }).eq('id', target.id);

    await supabase.from('orders').update({
      schedule_id: target.id,
      updated_at: new Date().toISOString(),
      admin_note: adminNote
    }).eq('id', order.id);
  }

  if (action === 'adjust_capacity') {
    if (!Number.isInteger(newCapacity) || newCapacity < 1) throw new Error('newCapacity must be positive integer');
    if (newCapacity < target.booked_count) throw new Error('newCapacity cannot be less than bookedCount');

    await supabase.from('activity_schedules').update({
      capacity: newCapacity,
      status: target.booked_count >= newCapacity ? 'full' : 'open'
    }).eq('id', target.id);

    await supabase.from('orders').update({ updated_at: new Date().toISOString(), admin_note: adminNote }).eq('id', order.id);
  }

  if (action === 'oversell_fix') {
    if (target.booked_count > target.capacity) {
      await supabase.from('activity_schedules').update({
        booked_count: target.capacity,
        status: 'full'
      }).eq('id', target.id);
    }
    await supabase.from('orders').update({ updated_at: new Date().toISOString(), admin_note: adminNote }).eq('id', order.id);
  }

  const logId = crypto.randomUUID();
  await supabase.from('audit_logs').insert({
    id: logId,
    order_id: order.id,
    actor: 'admin',
    action,
    metadata: { targetScheduleId: targetScheduleId || null, newCapacity: newCapacity ?? null, adminNote },
    created_at: new Date().toISOString()
  });

  return {
    orderId: order.id,
    action,
    scheduleId: target.id,
    adminNote,
    auditLogId: logId
  };
}

export async function listAdminRefundRequestsDb() {
  if (!hasSupabaseEnv()) return listAdminRefundRequestsFallback();

  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('refund_requests')
    .select('id, order_id, reason, note, status, requested_at, approved_at, refunded_at, admin_note')
    .order('requested_at', { ascending: false });

  if (error) throw new Error(error.message);

  const orderIds = [...new Set((data || []).map((r) => r.order_id).filter(Boolean))];
  let orderMap = new Map();
  if (orderIds.length > 0) {
    const { data: orderRows } = await supabase
      .from('orders')
      .select('id, status, total_twd, contact_name, contact_email')
      .in('id', orderIds);
    orderMap = new Map((orderRows || []).map((o) => [o.id, o]));
  }

  return (data || []).map((r) => ({
    id: r.id,
    orderId: r.order_id,
    reason: r.reason,
    note: r.note,
    status: r.status,
    requestedAt: r.requested_at,
    approvedAt: r.approved_at,
    refundedAt: r.refunded_at,
    adminNote: r.admin_note,
    orderStatus: orderMap.get(r.order_id)?.status || null,
    totalTwd: orderMap.get(r.order_id)?.total_twd || 0,
    contactName: orderMap.get(r.order_id)?.contact_name || null,
    contactEmail: orderMap.get(r.order_id)?.contact_email || null
  }));
}

export async function updateAdminRefundStatusDb(input = {}) {
  if (!hasSupabaseEnv()) return updateAdminRefundStatusFallback(input);

  const refundRequestId = String(input?.refundRequestId || '').trim();
  const action = String(input?.action || '').trim();
  const adminNote = String(input?.adminNote || '').trim() || null;

  if (!refundRequestId) throw new Error('refundRequestId is required');
  if (!['approve', 'reject', 'process', 'complete'].includes(action)) {
    throw new Error('invalid refund action');
  }

  const supabase = await getSupabase();

  const { data: req, error: reqError } = await supabase
    .from('refund_requests')
    .select('id, order_id, status')
    .eq('id', refundRequestId)
    .single();

  if (reqError || !req) throw new Error('refund request not found');

  const now = new Date().toISOString();
  let nextStatus = req.status;
  let orderStatus = 'refund_pending';
  let patch = { admin_note: adminNote, updated_at: now };

  if (action === 'approve') {
    nextStatus = 'approved';
    patch = { ...patch, status: 'approved', approved_at: now };
    orderStatus = 'refund_pending';
  } else if (action === 'reject') {
    nextStatus = 'rejected';
    patch = { ...patch, status: 'rejected' };
    orderStatus = 'paid';
  } else if (action === 'process') {
    nextStatus = 'processing';
    patch = { ...patch, status: 'processing' };
    orderStatus = 'refund_pending';
  } else if (action === 'complete') {
    nextStatus = 'refunded';
    patch = { ...patch, status: 'refunded', refunded_at: now };
    orderStatus = 'refunded';
  }

  const { error: reqUpdateError } = await supabase
    .from('refund_requests')
    .update(patch)
    .eq('id', refundRequestId);

  if (reqUpdateError) throw new Error(reqUpdateError.message);

  const { error: orderUpdateError } = await supabase
    .from('orders')
    .update({ status: orderStatus })
    .eq('id', req.order_id);

  if (orderUpdateError) throw new Error(orderUpdateError.message);

  return {
    id: req.id,
    orderId: req.order_id,
    status: nextStatus,
    orderStatus,
    adminNote
  };
}

export async function listOperationsTrackingDb() {
  if (!hasSupabaseEnv()) return listOperationsTrackingFallback();

  const supabase = await getSupabase();
  const { data: rows, error } = await supabase
    .from('operations_tracking')
    .select('id, order_id, manual_minutes, manual_cost_twd, refund_amount_twd, subsidy_twd, is_rescheduled, has_complaint, has_guide_adjustment, has_oversell_issue, note, updated_at')
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);

  const orderRows = await listAdminOrdersDb({});
  const orderMap = new Map(orderRows.map((o) => [o.id, o]));

  const calc = (o, ops) => {
    const gmv = Number(o?.totalTwd || 0);
    const commissionTwd = Math.round(gmv * 0.15);
    const paymentFeeTwd = Math.round(gmv * 0.035);
    const manualCostTwd = Number(ops.manual_cost_twd || 0);
    const refundAmountTwd = Number(ops.refund_amount_twd || 0);
    const subsidyTwd = Number(ops.subsidy_twd || 0);
    const finalContributionTwd = commissionTwd - paymentFeeTwd - manualCostTwd - refundAmountTwd - subsidyTwd;
    const hasException = Boolean(refundAmountTwd > 0 || ops.is_rescheduled || ops.has_complaint || ops.has_guide_adjustment || ops.has_oversell_issue);
    const isHealthyOrder = finalContributionTwd > 0 && !hasException;
    return { gmv, commissionTwd, paymentFeeTwd, finalContributionTwd, hasException, isHealthyOrder };
  };

  return (rows || []).map((r) => {
    const order = orderMap.get(r.order_id) || {};
    return {
      orderId: r.order_id,
      orderDate: order.createdAt || null,
      guideName: order.experienceSlug || null,
      activityName: order.title || null,
      scheduleDate: order.scheduleStartAt || null,
      travelers: order.peopleCount || 1,
      status: order.status || null,
      manualMinutes: r.manual_minutes || 0,
      manualCostTwd: r.manual_cost_twd || 0,
      refundAmountTwd: r.refund_amount_twd || 0,
      subsidyTwd: r.subsidy_twd || 0,
      isRescheduled: !!r.is_rescheduled,
      hasComplaint: !!r.has_complaint,
      hasGuideAdjustment: !!r.has_guide_adjustment,
      hasOversellIssue: !!r.has_oversell_issue,
      note: r.note || null,
      updatedAt: r.updated_at,
      ...calc(order, r)
    };
  });
}

export async function updateOperationsTrackingDb(input = {}) {
  if (!hasSupabaseEnv()) return updateOperationsTrackingFallback(input);

  const orderId = String(input?.orderId || '').trim();
  if (!orderId) throw new Error('orderId is required');

  const supabase = await getSupabase();

  const { data: existing } = await supabase
    .from('operations_tracking')
    .select('id')
    .eq('order_id', orderId)
    .limit(1);

  const payload = {
    manual_minutes: input?.manualMinutes == null ? 0 : Number(input.manualMinutes),
    manual_cost_twd: input?.manualCostTwd == null ? 0 : Number(input.manualCostTwd),
    refund_amount_twd: input?.refundAmountTwd == null ? 0 : Number(input.refundAmountTwd),
    subsidy_twd: input?.subsidyTwd == null ? 0 : Number(input.subsidyTwd),
    is_rescheduled: !!input?.isRescheduled,
    has_complaint: !!input?.hasComplaint,
    has_guide_adjustment: !!input?.hasGuideAdjustment,
    has_oversell_issue: !!input?.hasOversellIssue,
    note: input?.note ? String(input.note) : null,
    updated_at: new Date().toISOString()
  };

  if (existing && existing.length > 0) {
    const { error } = await supabase.from('operations_tracking').update(payload).eq('order_id', orderId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('operations_tracking').insert({ id: crypto.randomUUID(), order_id: orderId, ...payload });
    if (error) throw new Error(error.message);
  }

  return (await listOperationsTrackingDb()).find((r) => r.orderId === orderId) || null;
}

export async function operationsTrackingSummaryDb() {
  if (!hasSupabaseEnv()) return operationsTrackingSummaryFallback();
  const rows = await listOperationsTrackingDb();
  const n = rows.length || 1;
  const sum = (k) => rows.reduce((acc, r) => acc + Number(r[k] || 0), 0);
  return {
    totalOrders: rows.length,
    totalGmv: sum('gmv'),
    totalCommissionTwd: sum('commissionTwd'),
    avgCommissionTwd: Math.round(sum('commissionTwd') / n),
    avgManualMinutes: Number((sum('manualMinutes') / n).toFixed(1)),
    avgManualCostTwd: Math.round(sum('manualCostTwd') / n),
    refundRate: Number(((rows.filter((r) => r.refundAmountTwd > 0).length / n) * 100).toFixed(1)),
    exceptionRate: Number(((rows.filter((r) => r.hasException).length / n) * 100).toFixed(1)),
    avgFinalContributionTwd: Math.round(sum('finalContributionTwd') / n),
    healthyOrderRate: Number(((rows.filter((r) => r.isHealthyOrder).length / n) * 100).toFixed(1))
  };
}

export async function operationsTrackingCsvDb() {
  if (!hasSupabaseEnv()) return operationsTrackingCsvFallback();
  const rows = await listOperationsTrackingDb();
  const header = [
    'orderId','orderDate','guideName','activityName','scheduleDate','travelers','status','gmv','commissionTwd','paymentFeeTwd','manualMinutes','manualCostTwd','refundAmountTwd','subsidyTwd','hasException','finalContributionTwd','isHealthyOrder','note'
  ];
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header.join(','), ...rows.map((r) => header.map((h) => esc(r[h])).join(','))].join('\n');
}

export async function createGuideApplicationDb(input = {}) {
  if (!hasSupabaseEnv()) return createGuideApplicationInMemory(input);

  const fullName = String(input?.fullName || '').trim();
  const phone = String(input?.phone || '').trim();
  const email = String(input?.email || '').trim();
  const city = String(input?.city || '').trim();
  const bio = String(input?.bio || '').trim();

  if (!fullName) throw new Error('fullName is required');
  if (!phone) throw new Error('phone is required');
  if (!email) throw new Error('email is required');
  if (!city) throw new Error('city is required');
  if (!bio) throw new Error('bio is required');

  const supabase = await getSupabase();

  const payload = {
    id: crypto.randomUUID(),
    full_name: fullName,
    phone,
    email,
    city,
    bio,
    status: 'pending'
  };

  const { data, error } = await supabase
    .from('guide_applications')
    .insert(payload)
    .select('id, full_name, phone, email, city, bio, status, admin_note, created_at, updated_at')
    .single();

  if (error || !data) throw new Error(error?.message || 'guide application create failed');

  return {
    id: data.id,
    fullName: data.full_name,
    phone: data.phone,
    email: data.email,
    city: data.city,
    bio: data.bio,
    status: data.status,
    adminNote: data.admin_note,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  };
}

export async function listGuideApplicationsDb(input = {}) {
  if (!hasSupabaseEnv()) return listGuideApplicationsInMemory(input);

  const status = String(input?.status || '').trim();
  const supabase = await getSupabase();

  let query = supabase
    .from('guide_applications')
    .select('id, full_name, phone, email, city, bio, status, admin_note, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data || []).map((r) => ({
    id: r.id,
    fullName: r.full_name,
    phone: r.phone,
    email: r.email,
    city: r.city,
    bio: r.bio,
    status: r.status,
    adminNote: r.admin_note,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }));
}

export async function updateGuideApplicationStatusDb(input = {}) {
  if (!hasSupabaseEnv()) return updateGuideApplicationStatusInMemory(input);

  const applicationId = String(input?.applicationId || '').trim();
  const action = String(input?.action || '').trim();
  const adminNote = String(input?.adminNote || '').trim() || null;

  if (!applicationId) throw new Error('applicationId is required');
  if (!['approve', 'reject', 'suspend'].includes(action)) throw new Error('invalid guide action');

  const nextStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'suspended';

  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('guide_applications')
    .update({ status: nextStatus, admin_note: adminNote, updated_at: new Date().toISOString() })
    .eq('id', applicationId)
    .select('id, full_name, phone, email, city, bio, status, admin_note, created_at, updated_at')
    .single();

  if (error || !data) throw new Error(error?.message || 'guide application update failed');

  return {
    id: data.id,
    fullName: data.full_name,
    phone: data.phone,
    email: data.email,
    city: data.city,
    bio: data.bio,
    status: data.status,
    adminNote: data.admin_note,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  };
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
