import {
  listExperiences as listInMemory,
  createOrder as createOrderInMemory,
  listMyOrders as listMyOrdersInMemory,
  getMyOrderDetail as getMyOrderDetailInMemory,
  createRefundRequest as createRefundRequestInMemory,
  listRefundRequests as listRefundRequestsInMemory,
  cancelOrder as cancelOrderInMemory,
  createGuideApplication as createGuideApplicationInMemory,
  listGuideApplications as listGuideApplicationsInMemory,
  updateGuideApplicationStatus as updateGuideApplicationStatusInMemory,
  processPaymentCallback as processPaymentCallbackInMemory
} from './services.mjs';
import { calculateDiscount } from './promo-discount.ts';
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
  getKpiConfigFallback,
  updateKpiConfigFallback,
  listKpiConfigHistoryFallback,
  revertKpiConfigFallback,
  listAdminRefundRequestsFallback,
  updateAdminRefundStatusFallback
} from './admin.mjs';

export function hasSupabaseEnv() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

let supabaseClient = null;

export function __setSupabaseClientForTest(client = null) {
  supabaseClient = client;
}

export async function getSupabase() {
  if (supabaseClient) return supabaseClient;
  const { createClient } = await import('@supabase/supabase-js');
  supabaseClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  return supabaseClient;
}

async function tryRefreshAvailabilitySnapshotByOrderId(orderId) {
  if (!hasSupabaseEnv()) return;
  try {
    const supabase = await getSupabase();
    const { data: order } = await supabase
      .from('orders')
      .select('activity_id')
      .eq('id', orderId)
      .maybeSingle();
    if (!order?.activity_id) return;
    await supabase.rpc('fn_refresh_activity_availability_daily', {
      p_activity_id: order.activity_id,
    });
  } catch (e) {
    console.warn('[availability-snapshot] refresh by order failed:', e?.message || e);
  }
}

async function insertAuditLogDb(supabase, { orderId = null, actor = 'admin', action, metadata = {} }) {
  if (!action) return;
  const payload = {
    order_id: orderId || null,
    actor,
    action,
    metadata,
    created_at: new Date().toISOString()
  };
  const { error } = await supabase.from('audit_logs').insert(payload);
  if (error) throw new Error(error.message);
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
    .select('id, slug, price_twd, plans')
    .eq('slug', experienceSlug)
    .single();

  if (activityError || !activity) throw new Error('experience not found');

  // Apply plan priceMultiplier if planId provided
  const planId = String(input?.planId || '').trim();
  let effectivePriceTwd = activity.price_twd;
  if (planId && Array.isArray(activity.plans)) {
    const plan = activity.plans.find(p => p.id === planId);
    if (plan?.priceMultiplier != null && plan?.price != null) {
      effectivePriceTwd = Math.round(plan.price * plan.priceMultiplier);
    }
  }

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

  // 🔐 Phase 9: 支持 user_id 綁定（可選）
  const userId = input?.userId || null;

  // #355: 折扣碼支援
  const promoCode = String(input?.promoCode || '').trim().toUpperCase() || null;

  // 座位扣除在付款確認時執行（fn_process_payment_callback_atomic 內建 fn_book_schedule）
  // 建立訂單時只做可用性檢查（不扣位），避免未付款訂單佔用席次

  // Compute base total
  let totalTwd = effectivePriceTwd * peopleCount;
  let discountAmount = 0;

  const payload = {
    id: crypto.randomUUID(),
    activity_id: activity.id,
    schedule_id: schedule.id,
    user_id: userId,
    people_count: peopleCount,
    contact_name: contactName,
    contact_phone: contactPhone,
    contact_email: contactEmail,
    status: 'pending_payment',
    total_twd: totalTwd,
    discount_amount: 0,
  };

  const { data: inserted, error: orderError } = await supabase
    .from('orders')
    .insert(payload)
    .select('id, status, total_twd, activity_id, schedule_id, people_count, contact_name, contact_phone, contact_email, created_at')
    .single();

  if (orderError || !inserted) {
    throw new Error(orderError?.message || 'order create failed');
  }

  // #355: 若有折扣碼，原子性兌換並更新金額
  if (promoCode && userId) {
    const { data: redeemResult } = await supabase.rpc('fn_redeem_promo_code', {
      p_code: promoCode,
      p_user_id: userId,
      p_order_id: inserted.id,
    });

    if (redeemResult?.ok) {
      discountAmount = calculateDiscount(
        redeemResult.discount_type,
        Number(redeemResult.discount_value),
        totalTwd
      );
      const finalTotal = Math.max(0, totalTwd - discountAmount);
      // Update order with discounted total
      await supabase
        .from('orders')
        .update({
          total_twd: finalTotal,
          discount_amount: discountAmount,
        })
        .eq('id', inserted.id);
      totalTwd = finalTotal;
    } else if (redeemResult?.reason) {
      // Rollback: delete the order that was just created
      await supabase.from('orders').delete().eq('id', inserted.id);
      throw new Error(redeemResult.reason); // e.g. EXHAUSTED / ALREADY_REDEEMED / NOT_FOUND
    }
  }

  await insertAuditLogDb(supabase, {
    orderId: inserted.id,
    actor: 'user',
    action: 'order_created',
    metadata: {
      experienceSlug: activity.slug,
      scheduleId: inserted.schedule_id,
      peopleCount: inserted.people_count,
      status: inserted.status,
      promoCode: promoCode || null,
      discountAmount,
    }
  });

  await tryRefreshAvailabilitySnapshotByOrderId(inserted.id);

  return {
    id: inserted.id,
    status: inserted.status,
    totalTwd: totalTwd,
    discountAmount,
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
  const userId = input?.userId || null;
  const supabase = await getSupabase();

  let query = supabase
    .from('orders')
    .select('id, status, total_twd, activity_id, schedule_id, people_count, contact_name, contact_phone, contact_email, created_at, paid_at, user_id')
    .order('created_at', { ascending: false });

  // 🔐 Phase 9: 優先使用 user_id 查詢，fallback 到 contactEmail（向後相容舊訂單）
  if (userId) {
    // 查詢此用戶的所有訂單（包括 user_id 綁定的 + email 相符的舊訂單）
    query = query.or(`user_id.eq.${userId},contact_email.eq.${contactEmail}`);
  } else if (contactEmail) {
    query = query.eq('contact_email', contactEmail);
  }

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

  const scheduleIds = [...new Set((data || []).map((r) => r.schedule_id).filter(Boolean))];
  let scheduleMap = new Map();
  if (scheduleIds.length > 0) {
    const { data: scheds } = await supabase
      .from('activity_schedules')
      .select('id, start_at')
      .in('id', scheduleIds);
    scheduleMap = new Map((scheds || []).map((s) => [s.id, s]));
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
    scheduleStartAt: scheduleMap.get(r.schedule_id)?.start_at || null,
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

/**
 * 取得訂單詳情（用於付款建立）
 * Phase 10 — ECPay 正式串接
 */
export async function getOrderDetailForPayment(input = {}) {
  const orderId = String(input?.orderId || '').trim();
  if (!orderId) throw new Error('orderId is required');

  if (!hasSupabaseEnv()) {
    const order = _orders.find((o) => o.id === orderId);
    if (!order) return null;
    return {
      id: order.id,
      status: order.status,
      totalTwd: order.total_twd,
      title: order.activity_title || null,
      contactName: order.contact_name,
      contactEmail: order.contact_email,
    };
  }

  const supabase = await getSupabase();

  const { data: order, error } = await supabase
    .from('orders')
    .select(`
      id,
      status,
      total_twd,
      contact_name,
      contact_email,
      activity_id
    `)
    .eq('id', orderId)
    .single();

  if (error || !order) return null;

  // 取得行程標題
  let title = null;
  if (order.activity_id) {
    const { data: activity } = await supabase
      .from('activities')
      .select('title')
      .eq('id', order.activity_id)
      .single();
    title = activity?.title || null;
  }

  return {
    id: order.id,
    status: order.status,
    totalTwd: order.total_twd,
    title,
    contactName: order.contact_name,
    contactEmail: order.contact_email,
  };
}

export async function cancelOrderDb(input = {}) {
  const orderId = String(input?.orderId || '').trim();
  const contactEmail = String(input?.contactEmail || '').trim();

  if (!orderId) throw new Error('orderId is required');
  if (!contactEmail) throw new Error('contactEmail is required');

  if (!hasSupabaseEnv()) {
    return cancelOrderInMemory({ orderId, contactEmail });
  }

  const supabase = await getSupabase();

  // fetch order and validate ownership
  const { data: order, error: fetchErr } = await supabase
    .from('orders')
    .select('id, status, schedule_id, people_count, contact_email')
    .eq('id', orderId)
    .single();

  if (fetchErr || !order) throw new Error('order not found');
  if (order.contact_email !== contactEmail) throw new Error('order not found');
  if (order.status !== 'pending_payment') throw new Error('only pending_payment orders can be cancelled by user');

  // cancel order
  const { error: updateErr } = await supabase
    .from('orders')
    .update({ status: 'cancelled_by_user', updated_at: new Date().toISOString() })
    .eq('id', orderId);

  if (updateErr) throw new Error(updateErr.message);

  // release booked seats on schedule (race-safe path)
  if (order.schedule_id && order.people_count) {
    let releasedByRpc = false;

    // Prefer DB-side atomic release to avoid lost updates under concurrent cancellations.
    try {
      const { data: rpcResult, error: rpcError } = await supabase.rpc('fn_cancel_booking', {
        p_schedule_id: order.schedule_id,
        p_count: order.people_count,
      });
      if (rpcError) throw rpcError;
      if (rpcResult?.ok) releasedByRpc = true;
    } catch (e) {
      console.warn('[cancelOrderDb] cancel RPC failed, falling back to legacy release:', e?.message || e);
    }

    // Fallback for environments without RPC function.
    if (!releasedByRpc) {
      const { data: schedule } = await supabase
        .from('activity_schedules')
        .select('id, booked_count, capacity')
        .eq('id', order.schedule_id)
        .single();

      if (schedule) {
        const newBooked = Math.max(0, (schedule.booked_count || 0) - order.people_count);
        await supabase
          .from('activity_schedules')
          .update({
            booked_count: newBooked,
            status: newBooked < schedule.capacity ? 'open' : 'full',
          })
          .eq('id', order.schedule_id);
      }
    }
  }

  await insertAuditLogDb(supabase, {
    orderId,
    actor: 'user',
    action: 'order_cancelled_by_user',
    metadata: {
      previousStatus: 'pending_payment',
      status: 'cancelled_by_user'
    }
  });

  await tryRefreshAvailabilitySnapshotByOrderId(orderId);
  return { id: orderId, status: 'cancelled_by_user' };
}

export async function createRefundRequestDb(input = {}) {
  if (!hasSupabaseEnv()) return createRefundRequestInMemory(input);

  const orderId = String(input?.orderId || '').trim();
  const reason = String(input?.reason || '').trim() || 'user_request';
  const note = String(input?.note || '').trim() || null;
  const contactEmail = String(input?.contactEmail || '').trim();
  const requestId = String(input?.requestId || '').trim();
  const policySnapshot = input?.policySnapshot ?? null;

  if (!orderId) throw new Error('orderId is required');
  if (!requestId) throw new Error('requestId is required');

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

  const { data: existingByRequest } = await supabase
    .from('refund_requests')
    .select('id, order_id, reason, note, status, requested_at')
    .eq('order_id', orderId)
    .eq('request_id', requestId)
    .limit(1)
    .maybeSingle();

  if (existingByRequest) {
    return {
      id: existingByRequest.id,
      orderId: existingByRequest.order_id,
      reason: existingByRequest.reason,
      note: existingByRequest.note,
      status: existingByRequest.status,
      requestedAt: existingByRequest.requested_at,
      orderStatus: order.status,
      idempotentReplay: true,
    };
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
    request_id: requestId,
    reason,
    note,
    status: 'requested',
    requested_at: new Date().toISOString(),
    ...(policySnapshot !== null && { policy_snapshot: policySnapshot }),
  };

  const { data: inserted, error: insertError } = await supabase
    .from('refund_requests')
    .insert(payload)
    .select('id, order_id, reason, note, status, requested_at')
    .single();

  if (insertError) {
    // Concurrent same requestId race: return stable existing response.
    if (insertError.code === '23505') {
      const { data: collided } = await supabase
        .from('refund_requests')
        .select('id, order_id, reason, note, status, requested_at')
        .eq('order_id', orderId)
        .eq('request_id', requestId)
        .limit(1)
        .maybeSingle();
      if (collided) {
        return {
          id: collided.id,
          orderId: collided.order_id,
          reason: collided.reason,
          note: collided.note,
          status: collided.status,
          requestedAt: collided.requested_at,
          orderStatus: order.status,
          idempotentReplay: true,
        };
      }
    }
    throw new Error(insertError.message || 'refund create failed');
  }

  if (!inserted) throw new Error('refund create failed');

  const { error: updateOrderError } = await supabase
    .from('orders')
    .update({ status: 'refund_pending' })
    .eq('id', orderId);

  if (updateOrderError) throw new Error(updateOrderError.message);

  await insertAuditLogDb(supabase, {
    orderId,
    actor: 'user',
    action: 'refund_requested',
    metadata: {
      refundRequestId: inserted.id,
      requestId,
      reason: inserted.reason,
      previousOrderStatus: order.status,
      orderStatus: 'refund_pending'
    }
  });

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

/**
 * Admin-initiated order cancellation.
 * Unlike cancelOrderDb, this:
 * - skips contact-email ownership check (admin can cancel any order)
 * - works for any cancellable status (paid, confirmed, pending_payment)
 * - sets status to 'cancelled_by_guide' (not 'cancelled_by_user')
 */
export async function cancelOrderAdminDb(input = {}) {
  const orderId = String(input?.orderId || '').trim();
  if (!orderId) throw new Error('orderId is required');

  const CANCELLABLE = ['pending_payment', 'paid', 'confirmed', 'rejected'];

  if (!hasSupabaseEnv()) {
    // In-memory fallback: update order status directly
    const { getOrders, setOrders } = await import('./store.mjs');
    const orders = getOrders();
    const order = orders.find(o => o.id === orderId);
    if (!order) throw new Error('order not found');
    if (!CANCELLABLE.includes(order.status)) throw new Error(`order_cancel_locked:${order.status}`);
    order.status = 'cancelled_by_guide';
    setOrders(orders);
    return { id: orderId, status: 'cancelled_by_guide' };
  }

  const supabase = await getSupabase();

  const { data: order, error: fetchErr } = await supabase
    .from('orders')
    .select('id, status, schedule_id, people_count')
    .eq('id', orderId)
    .single();

  if (fetchErr || !order) throw new Error('order not found');
  if (!CANCELLABLE.includes(order.status)) throw new Error(`order_cancel_locked:${order.status}`);

  // Set status first so subsequent reads see it as cancelled
  const { error: updateErr } = await supabase
    .from('orders')
    .update({ status: 'cancelled_by_guide', updated_at: new Date().toISOString() })
    .eq('id', orderId);
  if (updateErr) throw new Error(updateErr.message);

  // Release booked seats atomically via RPC (same pattern as cancelOrderDb)
  if (order.schedule_id && order.people_count) {
    try {
      const { error: rpcError } = await supabase.rpc('fn_cancel_booking', {
        p_schedule_id: order.schedule_id,
        p_count: order.people_count,
      });
      if (rpcError) throw rpcError;
    } catch (e) {
      // Fallback: manual decrement
      const { data: sched } = await supabase
        .from('activity_schedules')
        .select('booked_count, capacity')
        .eq('id', order.schedule_id)
        .single();
      if (sched) {
        const newBooked = Math.max(0, (sched.booked_count || 0) - order.people_count);
        await supabase
          .from('activity_schedules')
          .update({ booked_count: newBooked, status: newBooked < sched.capacity ? 'open' : 'full' })
          .eq('id', order.schedule_id);
      }
    }
  }

  return { id: orderId, status: 'cancelled_by_guide', previousStatus: order.status };
}

export async function createAdminPosRefundEntryDb(input = {}) {
  const orderId = String(input?.orderId || '').trim();
  const adminNote = String(input?.adminNote || '').trim() || null;
  const adminUserId = String(input?.adminUserId || '').trim() || null;
  const requestId = String(input?.requestId || '').trim() || `admin-pos-refund-${orderId}`;

  if (!orderId) throw new Error('orderId is required');

  let created;
  try {
    created = await createRefundRequestDb({
      orderId,
      requestId,
      reason: 'admin_pos_refund_entry',
      note: adminNote,
    });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('order cannot request refund in current status')) {
      throw error;
    }
    const existingRows = await listAdminRefundRequestsDb();
    const existingCompleted = existingRows.find((row) => row.orderId === orderId && row.status === 'refunded');
    if (!existingCompleted) throw error;
    return {
      orderId,
      refundRequestId: existingCompleted.id,
      refundStatus: existingCompleted.status,
      orderStatus: 'refunded',
      replayedRequest: true,
      actor: adminUserId || 'admin',
    };
  }

  let refundRequest = created;
  if (!created?.id || created?.idempotentReplay === true) {
    const rows = await listRefundRequestsDb({ orderId });
    const existing = rows.find((r) => r.id === created?.id) || rows.find((r) => r.status === 'requested');
    if (existing) {
      refundRequest = {
        id: existing.id,
        orderId: existing.orderId,
        reason: existing.reason,
        note: existing.note,
        status: existing.status,
        requestedAt: existing.requestedAt,
      };
    }
  }

  const completed = await updateAdminRefundStatusDb({
    refundRequestId: refundRequest.id,
    action: 'complete',
    adminNote,
  });

  return {
    orderId,
    refundRequestId: refundRequest.id,
    refundStatus: completed.status,
    orderStatus: completed.orderStatus,
    replayedRequest: created?.idempotentReplay === true,
    actor: adminUserId || 'admin',
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
    .select('id, status, total_twd, activity_id, schedule_id, people_count, contact_name, contact_phone, contact_email, trade_no, created_at, paid_at, admin_note, updated_at')
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);
  if (contactEmail) query = query.eq('contact_email', contactEmail);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const cfg = await getKpiConfigDb().catch(() => ({ guidePayoutRate: 0.85 }));
  const guidePayoutRate = Number(cfg?.guidePayoutRate);
  const safeGuidePayoutRate = Number.isFinite(guidePayoutRate) && guidePayoutRate >= 0 && guidePayoutRate <= 1
    ? guidePayoutRate
    : 0.85;

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
    const costTwd = Math.round(r.total_twd * safeGuidePayoutRate);
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
      trade_no: r.trade_no || null,
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
  const adminNoteProvided = input?.adminNote != null;
  const adminNote = adminNoteProvided ? String(input?.adminNote).trim() : null;
  const actor = String(input?.actor || 'admin').trim() || 'admin';
  const sourceChannel = String(input?.sourceChannel || 'admin_pos').trim() || 'admin_pos';
  const bookingId = input?.bookingId || null;
  const paymentId = input?.paymentId || null;

  // Contact info fields
  const contactNameProvided = input?.contactName != null;
  const contactPhoneProvided = input?.contactPhone != null;
  const contactEmailProvided = input?.contactEmail != null;
  const newContactName = contactNameProvided ? String(input.contactName).trim() : null;
  const newContactPhone = contactPhoneProvided ? String(input.contactPhone).trim() : null;
  const newContactEmail = contactEmailProvided ? String(input.contactEmail).trim() : null;

  // Headcount field
  const peopleCountProvided = input?.peopleCount != null;
  const newPeopleCount = peopleCountProvided ? Number(input.peopleCount) : null;

  if (!orderId) throw new Error('orderId is required');

  const validStatuses = [
    'pending_payment', 'paid', 'confirmed', 'rejected', 'cancelled_by_user', 'cancelled_by_guide', 'completed', 'refund_pending', 'refunded'
  ];

  // AC5: locked statuses cannot be edited
  const lockedStatuses = ['refunded', 'refund_pending', 'completed', 'cancelled_by_user', 'cancelled_by_guide'];

  const patch = { updated_at: new Date().toISOString() };
  if (status) {
    if (!validStatuses.includes(status)) throw new Error('invalid order status');
    patch.status = status;

    // Keep payment state aligned on explicit paid/pending transitions for admin POS flow.
    if (status === 'paid') {
      patch.payment_status = 'paid';
      patch.paid_at = new Date().toISOString();
    }
    if (status === 'pending_payment') {
      patch.payment_status = 'pending';
      patch.paid_at = null;
    }
  }
  if (adminNoteProvided) patch.admin_note = adminNote;
  if (contactNameProvided) patch.contact_name = newContactName;
  if (contactPhoneProvided) patch.contact_phone = newContactPhone;
  if (contactEmailProvided) patch.contact_email = newContactEmail;

  const supabase = await getSupabase();
  const { data: beforeOrder, error: beforeError } = await supabase
    .from('orders')
    .select('id, status, payment_status, paid_at, admin_note, contact_name, contact_phone, contact_email, people_count, total_twd, schedule_id')
    .eq('id', orderId)
    .single();
  if (beforeError || !beforeOrder) throw new Error(beforeError?.message || 'order not found');

  // AC5: reject edits on locked orders
  if (lockedStatuses.includes(beforeOrder.status)) {
    throw new Error(`order_edit_locked:${beforeOrder.status}`);
  }

  // AC1.1 / AC1.2 / AC1.3: handle peopleCount change
  if (peopleCountProvided && newPeopleCount !== beforeOrder.people_count) {
    if (!Number.isInteger(newPeopleCount) || newPeopleCount < 1) {
      throw new Error('peopleCount must be a positive integer');
    }
    const delta = newPeopleCount - beforeOrder.people_count;

    // Fetch schedule capacity info
    const { data: schedule, error: scheduleError } = await supabase
      .from('activity_schedules')
      .select('id, capacity, booked_count, status')
      .eq('id', beforeOrder.schedule_id)
      .single();

    if (scheduleError || !schedule) throw new Error('schedule not found');

    const newBooked = schedule.booked_count + delta;
    // AC1.1: capacity check
    if (newBooked > schedule.capacity) {
      throw new Error(`capacity insufficient: capacity=${schedule.capacity} booked=${schedule.booked_count} delta=${delta}`);
    }

    // AC1.2: update booked_count and schedule status
    const newScheduleStatus = newBooked >= schedule.capacity ? 'full' : 'open';
    const { error: scheduleUpdateError } = await supabase
      .from('activity_schedules')
      .update({ booked_count: newBooked, status: newScheduleStatus })
      .eq('id', beforeOrder.schedule_id);
    if (scheduleUpdateError) throw new Error(scheduleUpdateError.message);

    // AC1.3: recompute total_twd
    // Derive price_per_head from existing total / pax, fallback to no recompute if pax was 0
    patch.people_count = newPeopleCount;
    if (beforeOrder.people_count > 0 && beforeOrder.total_twd != null) {
      const pricePerHead = Math.round(beforeOrder.total_twd / beforeOrder.people_count);
      patch.total_twd = pricePerHead * newPeopleCount;
    }
  }

  const { error } = await supabase.from('orders').update(patch).eq('id', orderId);
  if (error) throw new Error(error.message);

  const afterStatus = patch.status ?? beforeOrder.status;
  const afterAdminNote = adminNoteProvided ? (patch.admin_note || null) : (beforeOrder.admin_note || null);
  const statusChanged = !!status && beforeOrder.status !== afterStatus;
  const noteChanged = adminNoteProvided && (beforeOrder.admin_note || null) !== afterAdminNote;
  const contactChanged = contactNameProvided || contactPhoneProvided || contactEmailProvided;
  const headcountChanged = peopleCountProvided && patch.people_count != null;

  if (statusChanged || noteChanged) {
    await insertAuditLogDb(supabase, {
      orderId,
      actor,
      action: statusChanged ? 'order_status_update' : 'order_admin_note_update',
      metadata: {
        actor,
        actorRole: 'admin',
        sourceChannel,
        targetOrderId: orderId,
        bookingId,
        paymentId,
        before: {
          status: beforeOrder.status,
          paymentStatus: beforeOrder.payment_status || null,
          paidAt: beforeOrder.paid_at || null,
          adminNote: beforeOrder.admin_note || null
        },
        after: {
          status: afterStatus,
          paymentStatus: patch.payment_status ?? beforeOrder.payment_status ?? null,
          paidAt: patch.paid_at ?? beforeOrder.paid_at ?? null,
          adminNote: afterAdminNote
        }
      }
    });
  }

  // AC1.4: audit log for admin edit (contact / headcount changes)
  if (contactChanged || headcountChanged) {
    await insertAuditLogDb(supabase, {
      orderId,
      actor,
      action: 'order_admin_edit',
      metadata: {
        actor,
        actorRole: 'admin',
        sourceChannel: 'admin_pos',
        targetOrderId: orderId,
        before: {
          contactName: beforeOrder.contact_name || null,
          contactPhone: beforeOrder.contact_phone || null,
          contactEmail: beforeOrder.contact_email || null,
          peopleCount: beforeOrder.people_count || null,
          totalTwd: beforeOrder.total_twd || null
        },
        after: {
          contactName: contactNameProvided ? newContactName : (beforeOrder.contact_name || null),
          contactPhone: contactPhoneProvided ? newContactPhone : (beforeOrder.contact_phone || null),
          contactEmail: contactEmailProvided ? newContactEmail : (beforeOrder.contact_email || null),
          peopleCount: headcountChanged ? patch.people_count : (beforeOrder.people_count || null),
          totalTwd: headcountChanged ? (patch.total_twd ?? beforeOrder.total_twd) : (beforeOrder.total_twd || null)
        }
      }
    });
  }

  await tryRefreshAvailabilitySnapshotByOrderId(orderId);
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
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

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

  await tryRefreshAvailabilitySnapshotByOrderId(order.id);

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

export async function refundRequestsCsvDb() {
  const rows = await listAdminRefundRequestsDb();
  const header = ['id', 'orderId', 'status', 'reason', 'note', 'requestedAt', 'approvedAt', 'refundedAt', 'totalTwd', 'contactName', 'contactEmail'];
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header.join(','), ...rows.map((r) => header.map((h) => esc(r[h])).join(','))].join('\n');
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

  const orderPatch = action === 'complete'
    ? { status: orderStatus, payment_status: 'refunded', updated_at: now }
    : { status: orderStatus, updated_at: now };

  const { error: orderUpdateError } = await supabase
    .from('orders')
    .update(orderPatch)
    .eq('id', req.order_id);

  if (orderUpdateError) throw new Error(orderUpdateError.message);

  if (action === 'complete') {
    const { data: orderRow, error: orderRowError } = await supabase
      .from('orders')
      .select('id, total_twd, paid_at')
      .eq('id', req.order_id)
      .single();

    if (orderRowError || !orderRow) throw new Error(orderRowError?.message || 'order not found');

    let { data: paymentRow, error: paymentSelectError } = await supabase
      .from('payments')
      .select('id, status')
      .eq('order_id', req.order_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (paymentSelectError) throw new Error(paymentSelectError.message);

    if (!paymentRow) {
      const { data: insertedPayment, error: insertPaymentError } = await supabase
        .from('payments')
        .insert({
          order_id: req.order_id,
          provider: 'ecpay',
          amount_twd: Number(orderRow.total_twd || 0),
          status: 'refunded',
          paid_at: orderRow.paid_at || now,
          updated_at: now,
        })
        .select('id, status')
        .single();

      if (insertPaymentError || !insertedPayment) {
        throw new Error(insertPaymentError?.message || 'failed to create payment row for refund event');
      }
      paymentRow = insertedPayment;
    } else if (paymentRow.status !== 'refunded') {
      const { error: paymentUpdateError } = await supabase
        .from('payments')
        .update({ status: 'refunded', updated_at: now })
        .eq('id', paymentRow.id);

      if (paymentUpdateError) throw new Error(paymentUpdateError.message);
    }

    const { data: refundedEventRow, error: eventSelectError } = await supabase
      .from('payment_events')
      .select('id')
      .eq('payment_id', paymentRow.id)
      .eq('event_type', 'refunded')
      .limit(1)
      .maybeSingle();

    if (eventSelectError) throw new Error(eventSelectError.message);

    if (!refundedEventRow) {
      const { error: insertEventError } = await supabase
        .from('payment_events')
        .insert({
          payment_id: paymentRow.id,
          event_type: 'refunded',
          payload: {
            source: 'updateAdminRefundStatusDb',
            action: 'refund_complete',
            refundRequestId: req.id,
            orderId: req.order_id,
            adminNote,
          },
        });

      if (insertEventError) throw new Error(insertEventError.message);
    }
  }

  await insertAuditLogDb(supabase, {
    orderId: req.order_id,
    actor: 'admin',
    action: `refund_${action}`,
    metadata: {
      refundRequestId: req.id,
      previousRefundStatus: req.status,
      refundStatus: nextStatus,
      orderStatus,
      adminNote
    }
  });

  await tryRefreshAvailabilitySnapshotByOrderId(req.order_id);

  return {
    id: req.id,
    orderId: req.order_id,
    status: nextStatus,
    orderStatus,
    adminNote
  };
}

// ── Settlement Rules (Issue #446) ──────────────────────────────────────────────

export async function getSettlementRulesDb(supabase) {
  const { data, error } = await supabase
    .from('settlement_rules')
    .select('*')
    .eq('is_active', true)
    .single()
  if (error) return null
  return data
}

export async function updateSettlementRulesDb(supabase, patch, createdBy) {
  // Capture current active row id for rollback
  const { data: oldRows } = await supabase
    .from('settlement_rules')
    .select('id')
    .eq('is_active', true)

  // Deactivate current active row
  await supabase.from('settlement_rules').update({ is_active: false }).eq('is_active', true)

  // Insert new active row (versioned history preserved)
  const { data, error } = await supabase
    .from('settlement_rules')
    .insert({ ...patch, is_active: true, created_by: createdBy })
    .select()
    .single()

  if (error) {
    // Rollback: re-activate the old row so system never has zero active rows
    if (oldRows && oldRows.length > 0) {
      await supabase.from('settlement_rules').update({ is_active: true }).eq('id', oldRows[0].id)
    }
    throw error
  }

  return data
}

// ── Settlement Write-Side (Issue #447) ─────────────────────────────────────────

/**
 * Fetch orders eligible for settlement:
 * - status IN ('paid', 'confirmed', 'completed')
 * - activity schedule start_at <= now() - t_days (cutoff)
 * - not yet present in payout_items
 *
 * @param {object} supabase - service-role Supabase client
 * @param {number} tDays - T+N days holdback period (from settlement_rules)
 * @returns {Promise<Array>} orders with nested activities and activity_schedules
 */
export async function getUnsettledOrdersDb(supabase, tDays) {
  const cutoff = new Date(Date.now() - tDays * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('orders')
    .select('id, total_twd, activity_id, schedule_id, activities!inner(guide_id), activity_schedules!inner(start_at)')
    .in('status', ['paid', 'confirmed', 'completed'])
    .lte('activity_schedules.start_at', cutoff)
    .not('id', 'in', supabase.from('payout_items').select('order_id'))
  if (error) throw error
  return data ?? []
}

/**
 * Atomically record settlement:
 * 1. Insert payout_items rows (idempotent: ON CONFLICT DO NOTHING via UNIQUE order_id)
 * 2. Upsert guide_balances (fetch existing + accumulate new net_twd)
 *
 * @param {object} supabase - service-role Supabase client
 * @param {Array<{order_id, guide_id, gmv_twd, commission_twd, net_twd, rules_version, settled_at}>} items
 */
export async function recordSettlementDb(supabase, items) {
  if (!items || items.length === 0) return

  // 1. Upsert payout_items — ON CONFLICT DO NOTHING (idempotency via UNIQUE order_id)
  // Supabase upsert with ignoreDuplicates=true maps to ON CONFLICT DO NOTHING in PostgREST
  const { error: piError } = await supabase
    .from('payout_items')
    .upsert(items, { onConflict: 'order_id', ignoreDuplicates: true })
  if (piError) throw piError

  // 2. Accumulate net_twd per guide
  const balanceDeltas = {}
  for (const item of items) {
    balanceDeltas[item.guide_id] = (balanceDeltas[item.guide_id] ?? 0) + item.net_twd
  }

  const now = new Date().toISOString()
  for (const [guide_id, delta] of Object.entries(balanceDeltas)) {
    // Fetch existing balance first so we can accumulate (upsert replaces, not adds)
    const { data: existing } = await supabase
      .from('guide_balances')
      .select('balance_twd')
      .eq('guide_id', guide_id)
      .single()

    const newBalance = (existing?.balance_twd ?? 0) + delta
    const { error: balError } = await supabase
      .from('guide_balances')
      .upsert(
        { guide_id, balance_twd: newBalance, last_settled_at: now, updated_at: now },
        { onConflict: 'guide_id' }
      )
    if (balError) throw balError
  }
}

// ── KPI Config ─────────────────────────────────────────────────────────────────

export async function getKpiConfigDb() {
  if (!hasSupabaseEnv()) return getKpiConfigFallback();

  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('kpi_settings')
    .select('commission_rate, payment_fee_rate, guide_payout_rate, healthy_min_contribution_twd, healthy_allow_exception, updated_at')
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (!data) {
    return {
      commissionRate: 0.15,
      paymentFeeRate: 0.035,
      guidePayoutRate: 0.85,
      healthyMinContributionTwd: 1,
      healthyAllowException: false,
      updatedAt: new Date().toISOString()
    };
  }

  return {
    commissionRate: Number(data.commission_rate ?? 0.15),
    paymentFeeRate: Number(data.payment_fee_rate ?? 0.035),
    guidePayoutRate: Number(data.guide_payout_rate ?? 0.85),
    healthyMinContributionTwd: Number(data.healthy_min_contribution_twd ?? 1),
    healthyAllowException: !!data.healthy_allow_exception,
    updatedAt: data.updated_at
  };
}

export async function updateKpiConfigDb(input = {}) {
  if (!hasSupabaseEnv()) return updateKpiConfigFallback(input);

  const actor = String(input?.actor || 'admin');
  const note = String(input?.note || '');
  const skipAuditLog = input?.skipAuditLog === true;

  const current = await getKpiConfigDb();
  const commissionRate = input.commissionRate == null ? current.commissionRate : Number(input.commissionRate);
  const paymentFeeRate = input.paymentFeeRate == null ? current.paymentFeeRate : Number(input.paymentFeeRate);
  const guidePayoutRate = input.guidePayoutRate == null ? current.guidePayoutRate : Number(input.guidePayoutRate);
  const healthyMinContributionTwd = input.healthyMinContributionTwd == null ? current.healthyMinContributionTwd : Number(input.healthyMinContributionTwd);
  const healthyAllowException = input.healthyAllowException == null ? current.healthyAllowException : !!input.healthyAllowException;

  if (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 1) throw new Error('commissionRate must be between 0 and 1');
  if (!Number.isFinite(paymentFeeRate) || paymentFeeRate < 0 || paymentFeeRate > 1) throw new Error('paymentFeeRate must be between 0 and 1');
  if (!Number.isFinite(guidePayoutRate) || guidePayoutRate < 0 || guidePayoutRate > 1) throw new Error('guidePayoutRate must be between 0 and 1');

  const supabase = await getSupabase();
  const payload = {
    id: 'default',
    commission_rate: commissionRate,
    payment_fee_rate: paymentFeeRate,
    guide_payout_rate: guidePayoutRate,
    healthy_min_contribution_twd: healthyMinContributionTwd,
    healthy_allow_exception: healthyAllowException,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase.from('kpi_settings').upsert(payload);
  if (error) throw new Error(error.message);

  const updated = await getKpiConfigDb();

  await supabase.from('kpi_settings_history').insert({
    version_id: crypto.randomUUID(),
    actor,
    action: 'update',
    note,
    before_payload: current,
    config_payload: updated,
    source_version_id: null,
    created_at: new Date().toISOString()
  });

  if (!skipAuditLog) {
    await insertAuditLogDb(supabase, {
      actor,
      action: 'kpi_config_update',
      metadata: {
        note,
        before: current,
        after: updated
      }
    });
  }

  return updated;
}

export async function listKpiConfigHistoryDb() {
  if (!hasSupabaseEnv()) return listKpiConfigHistoryFallback();

  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('kpi_settings_history')
    .select('version_id, actor, action, note, before_payload, config_payload, source_version_id, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);

  return (data || []).map((r) => ({
    versionId: r.version_id,
    actor: r.actor,
    action: r.action,
    note: r.note,
    before: r.before_payload,
    config: r.config_payload,
    sourceVersionId: r.source_version_id,
    createdAt: r.created_at
  }));
}

export async function revertKpiConfigDb(input = {}) {
  if (!hasSupabaseEnv()) return revertKpiConfigFallback(input);

  const versionId = String(input?.versionId || '').trim();
  if (!versionId) throw new Error('versionId is required');

  const supabase = await getSupabase();

  const { data: target, error: targetErr } = await supabase
    .from('kpi_settings_history')
    .select('version_id, config_payload')
    .eq('version_id', versionId)
    .single();

  if (targetErr || !target) throw new Error('kpi config version not found');

  const cfg = target.config_payload || {};
  const actor = String(input.actor || 'admin');
  const updated = await updateKpiConfigDb({
    commissionRate: cfg.commissionRate,
    paymentFeeRate: cfg.paymentFeeRate,
    guidePayoutRate: cfg.guidePayoutRate,
    healthyMinContributionTwd: cfg.healthyMinContributionTwd,
    healthyAllowException: cfg.healthyAllowException,
    actor,
    note: `revert to ${versionId}`,
    skipAuditLog: true
  });

  // record revert op
  await supabase.from('kpi_settings_history').insert({
    version_id: crypto.randomUUID(),
    actor,
    action: 'revert',
    note: `revert to ${versionId}`,
    before_payload: null,
    config_payload: updated,
    source_version_id: versionId,
    created_at: new Date().toISOString()
  });

  await insertAuditLogDb(supabase, {
    actor,
    action: 'kpi_config_revert',
    metadata: {
      sourceVersionId: versionId,
      revertedConfig: updated
    }
  });

  return updated;
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
  const cfg = await getKpiConfigDb();

  const calc = (o, ops) => {
    const gmv = Number(o?.totalTwd || 0);
    const refundAmountTwd = Number(ops.refund_amount_twd || 0);
    // 有效 GMV：扣除退款後的實收金額
    const effectiveGmv = Math.max(0, gmv - refundAmountTwd);
    // 平台抽成只對有效 GMV 計算
    const commissionTwd = Math.round(effectiveGmv * cfg.commissionRate);
    // 金流費以原始 GMV 計算（通常不退）
    const paymentFeeTwd = Math.round(gmv * cfg.paymentFeeRate);
    const manualCostTwd = Number(ops.manual_cost_twd || 0);
    const subsidyTwd = Number(ops.subsidy_twd || 0);
    const finalContributionTwd = commissionTwd - paymentFeeTwd - manualCostTwd - subsidyTwd;
    const hasException = Boolean(refundAmountTwd > 0 || ops.is_rescheduled || ops.has_complaint || ops.has_guide_adjustment || ops.has_oversell_issue);
    const isHealthyOrder = cfg.healthyAllowException
      ? finalContributionTwd >= Number(cfg.healthyMinContributionTwd || 0)
      : finalContributionTwd >= Number(cfg.healthyMinContributionTwd || 0) && !hasException;
    return { gmv, effectiveGmv, commissionTwd, paymentFeeTwd, finalContributionTwd, hasException, isHealthyOrder };
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
  const [rows, cfg] = await Promise.all([listOperationsTrackingDb(), getKpiConfigDb()]);
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
    healthyOrderRate: Number(((rows.filter((r) => r.isHealthyOrder).length / n) * 100).toFixed(1)),
    kpiConfig: cfg
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

export async function adminDashboardSummaryDb(input = {}) {
  const preset = String(input?.preset || '').trim();
  const from = String(input?.from || '').trim();
  const to = String(input?.to || '').trim();

  const [ordersRaw, refundsRaw, guidesRaw, opsRowsRaw, cfg] = await Promise.all([
    listAdminOrdersDb({}),
    listAdminRefundRequestsDb(),
    listGuideApplicationsDb({}),
    listOperationsTrackingDb(),
    getKpiConfigDb()
  ]);

  let rangeFrom = from ? new Date(from) : null;
  let rangeTo = to ? new Date(to) : null;

  if (!rangeFrom && !rangeTo && preset) {
    const now = new Date();
    if (preset === 'today') {
      rangeFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      rangeTo = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    } else if (preset === '7d') {
      rangeFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      rangeTo = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    } else if (preset === '30d') {
      rangeFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
      rangeTo = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    }
  }

  const inRange = (iso) => {
    if (!iso) return true;
    const d = new Date(iso);
    if (rangeFrom && d < rangeFrom) return false;
    if (rangeTo && d >= rangeTo) return false;
    return true;
  };

  const orders = ordersRaw.filter((o) => inRange(o.createdAt));
  const refunds = refundsRaw.filter((r) => inRange(r.requestedAt));
  const guides = guidesRaw.filter((g) => inRange(g.createdAt));

  const orderIdSet = new Set(orders.map((o) => o.id));
  const opsRows = opsRowsRaw.filter((r) => orderIdSet.has(r.orderId));

  const pendingOrders = orders.filter((o) => ['pending_payment', 'paid', 'confirmed', 'refund_pending'].includes(o.status));
  const pendingRefunds = refunds.filter((r) => ['requested', 'approved', 'processing'].includes(r.status));
  const pendingGuideApps = guides.filter((g) => g.status === 'pending');

  const totalOrders = orders.length;
  const totalGmv = orders.reduce((acc, o) => acc + Number(o.totalTwd || 0), 0);
  // 有效 GMV = 扣除已退款訂單的退款金額
  const totalRefundedGmv = opsRows.reduce((acc, r) => acc + Number(r.refundAmountTwd || 0), 0);
  const effectiveTotalGmv = Math.max(0, totalGmv - totalRefundedGmv);
  const totalCommissionTwd = Math.round(effectiveTotalGmv * Number(cfg.commissionRate || 0.15));

  const countRefundOrders = opsRows.filter((r) => Number(r.refundAmountTwd || 0) > 0).length;
  const countExceptionOrders = opsRows.filter((r) => !!r.hasException).length;
  const countHealthyOrders = opsRows.filter((r) => !!r.isHealthyOrder).length;

  const rateBase = totalOrders || 1;
  const refundRate = Number(((countRefundOrders / rateBase) * 100).toFixed(1));
  const exceptionRate = Number(((countExceptionOrders / rateBase) * 100).toFixed(1));
  const healthyOrderRate = Number(((countHealthyOrders / rateBase) * 100).toFixed(1));

  const trendMap = new Map();
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    trendMap.set(key, { date: key, orders: 0, refunds: 0, guides: 0, gmv: 0 });
  }

  for (const o of ordersRaw) {
    if (!o.createdAt) continue;
    const key = new Date(o.createdAt).toISOString().slice(0, 10);
    if (trendMap.has(key)) {
      const row = trendMap.get(key);
      row.orders += 1;
      row.gmv += Number(o.totalTwd || 0);
    }
  }
  for (const r of refundsRaw) {
    if (!r.requestedAt) continue;
    const key = new Date(r.requestedAt).toISOString().slice(0, 10);
    if (trendMap.has(key)) trendMap.get(key).refunds += 1;
  }
  for (const g of guidesRaw) {
    if (!g.createdAt) continue;
    const key = new Date(g.createdAt).toISOString().slice(0, 10);
    if (trendMap.has(key)) trendMap.get(key).guides += 1;
  }

  return {
    filters: {
      preset: preset || null,
      from: rangeFrom ? rangeFrom.toISOString() : null,
      to: rangeTo ? rangeTo.toISOString() : null
    },
    definitions: {
      totalGmv: 'sum(orders.totalTwd) within selected range',
      totalCommissionTwd: `round(totalGmv * commissionRate) ; commissionRate=${Number(cfg.commissionRate || 0.15)}`,
      paymentFeeRate: `paymentFeeRate=${Number(cfg.paymentFeeRate || 0.035)}`,
      healthyRule: `healthyMinContributionTwd=${Number(cfg.healthyMinContributionTwd || 0)}, healthyAllowException=${!!cfg.healthyAllowException}`,
      refundRate: 'orders with refundAmountTwd > 0 / totalOrders * 100',
      exceptionRate: 'orders with hasException = true / totalOrders * 100',
      healthyOrderRate: 'orders with isHealthyOrder = true / totalOrders * 100',
      pendingOrders: 'status in [pending_payment, paid, confirmed, refund_pending]',
      pendingRefunds: 'refund status in [requested, approved, processing]',
      pendingGuideApps: 'guide application status = pending'
    },
    config: cfg,
    kpi: {
      totalOrders,
      pendingOrders: pendingOrders.length,
      pendingRefunds: pendingRefunds.length,
      pendingGuideApps: pendingGuideApps.length,
      totalGmv,
      totalCommissionTwd,
      healthyOrderRate,
      refundRate,
      exceptionRate
    },
    trends: Array.from(trendMap.values()),
    queues: {
      orders: pendingOrders.slice(0, 10),
      refunds: pendingRefunds.slice(0, 10),
      guides: pendingGuideApps.slice(0, 10)
    }
  };
}

export async function processPaymentCallbackDb(input) {
  if (!hasSupabaseEnv()) return processPaymentCallbackInMemory(input);

  const orderId = String(input?.orderId || '').trim();
  if (!orderId) throw new Error('orderId is required');

  const supabase = await getSupabase();

  const { data, error } = await supabase.rpc('fn_process_payment_callback_atomic', {
    p_order_id: orderId,
    p_trade_no: String(input?.tradeNo || '').trim() || null,
    p_owner_email: String(input?.ownerEmail || '').trim() || null,
    p_raw_payload: input || null,
  });

  if (error) {
    const err = new Error(error.message || 'payment callback processing failed');
    // Bubble specific code for API error mapping / observability.
    err.code = error.code;
    throw err;
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) throw new Error('payment callback processing returned empty result');

  await tryRefreshAvailabilitySnapshotByOrderId(orderId);

  return {
    order: {
      id: row.order_id,
      status: row.order_status,
      totalTwd: row.total_twd,
      paidAt: row.paid_at,
    },
    scheduleUpdated: !!row.schedule_updated,
    schedule: row.schedule_id ? {
      id: row.schedule_id,
      bookedCount: row.schedule_booked_count,
      capacity: row.schedule_capacity,
      status: row.schedule_status,
    } : null,
  };
}

// =============================================================
// Sprint 4.0+4.1 — Activities DB functions
// =============================================================

// ---------------------------------------------------------------
// Frontend (public) — published activities only
// ---------------------------------------------------------------

export async function listPublishedActivitiesDb(filters = {}) {
  if (!hasSupabaseEnv()) {
    // fallback: return fixtures data shaped like DB rows
    const { activities, guides } = await import('../fixtures/data').catch(() => ({ activities: [], guides: [] }));
    let result = activities || [];
    if (filters.region) result = result.filter(a => a.region === filters.region);
    if (filters.category) result = result.filter(a => a.category === filters.category);
    if (filters.q) {
      const q = filters.q.toLowerCase();
      result = result.filter(a =>
        a.title?.toLowerCase().includes(q) ||
        a.region?.toLowerCase().includes(q) ||
        a.shortDescription?.toLowerCase().includes(q)
      );
    }
    return result.map(a => {
      const guide = (guides || []).find(g => g.slug === a.guideSlug);
      return {
        id: a.slug, slug: a.slug, title: a.title, tagline: a.tagline,
        shortDescription: a.shortDescription, region: a.region, regionSlug: a.regionSlug,
        category: a.category, priceTwd: a.price, durationMinutes: a.durationMinutes,
        durationDisplay: a.durationDisplay, minParticipants: a.minParticipants,
        maxParticipants: a.maxParticipants, coverImageUrl: a.imageUrl,
        status: 'published', guideName: guide?.displayName || '',
        guideSlug: a.guideSlug, guideAvatarUrl: guide?.avatarUrl || '',
        ratingAvg: guide?.rating || 5.0, reviewCount: guide?.reviewCount || 0
      };
    });
  }

  const supabase = await getSupabase();
  let query = supabase
    .from('activities')
    .select(`
      id, slug, title, tagline, short_description, region, region_slug, category,
      price_twd, duration_minutes, min_participants, max_participants,
      cover_image_url, status, published_at,
      rating_avg, review_count,
      guide_id, guide_slug,
      guide_profiles!activities_guide_id_fkey(display_name, profile_photo_url, rating_avg, review_count, slug)
    `)
    .eq('status', 'published')
    .order('published_at', { ascending: false });

  if (filters.region) query = query.eq('region', filters.region);
  if (filters.category) query = query.eq('category', filters.category);
  if (filters.q) query = query.ilike('title', `%${filters.q}%`);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data || []).map(r => ({
    id: r.id, slug: r.slug, title: r.title, tagline: r.tagline,
    shortDescription: r.short_description, region: r.region, regionSlug: r.region_slug,
    category: r.category, priceTwd: r.price_twd, durationMinutes: r.duration_minutes,
    minParticipants: r.min_participants, maxParticipants: r.max_participants,
    coverImageUrl: r.cover_image_url, status: r.status,
    guideName: r.guide_profiles?.display_name || '',
    guideSlug: r.guide_slug || r.guide_profiles?.slug || '',
    guideAvatarUrl: r.guide_profiles?.profile_photo_url || '',
    ratingAvg: r.rating_avg ?? null,
    reviewCount: r.review_count ?? 0
  }));
}

async function getFixtureActivityBySlug(slug) {
  try {
    const { activities, guides, getReviewsByActivity } = await import('../fixtures/data');
    const fixture = (activities || []).find((x) => x.slug === slug);
    if (!fixture) return null;

    const guide = (guides || []).find((g) => g.slug === fixture.guideSlug);
    const reviews = getReviewsByActivity ? getReviewsByActivity(fixture.slug) : [];

    return {
      id: fixture.slug,
      slug: fixture.slug,
      title: fixture.title,
      tagline: fixture.tagline,
      shortDescription: fixture.shortDescription,
      description: fixture.longDescription,
      region: fixture.region,
      regionSlug: fixture.regionSlug,
      category: fixture.category,
      priceTwd: fixture.price,
      priceLabel: fixture.priceLabel || `NT$${Number(fixture.price || 0).toLocaleString()} / 人`,
      durationMinutes: fixture.durationMinutes,
      durationDisplay: fixture.durationDisplay,
      minParticipants: fixture.minParticipants,
      maxParticipants: fixture.maxParticipants,
      meetingPoint: fixture.meetingPoint,
      meetingPointMapUrl: fixture.meetingPointMapUrl,
      coverImageUrl: fixture.imageUrl,
      imageUrls: fixture.galleryUrls || [],
      inclusions: fixture.inclusions || [],
      exclusions: fixture.exclusions || [],
      notices: fixture.notices || [],
      refundRules: fixture.refundRules || [],
      safetyNotice: fixture.safetyNotice,
      faq: fixture.faq || [],
      goodFor: fixture.goodFor || [],
      notGoodFor: fixture.notGoodFor || [],
      itinerary: fixture.itinerary || [],
      socialProofQuotes: fixture.socialProofQuotes || [],
      plans: fixture.plans || null,
      status: 'published',
      guide: guide ? {
        id: guide.slug,
        slug: guide.slug,
        displayName: guide.displayName,
        headline: guide.headline,
        bio: guide.longBio || guide.shortBio,
        region: guide.region,
        languages: guide.languages || [],
        specialties: guide.specialties || [],
        profilePhotoUrl: guide.avatarUrl,
        ratingAvg: guide.rating,
        reviewCount: guide.reviewCount,
        galleryUrls: guide.galleryUrls || [],
      } : null,
      schedules: (fixture.schedules || []).map((s, i) => ({
        id: `${fixture.slug}-schedule-${i}`,
        startAt: s.startAt,
        endAt: s.endAt,
        capacity: s.capacity,
        bookedCount: s.bookedCount,
        status: s.status,
        planId: null,
        minParticipants: s.minParticipants || fixture.minParticipants || 1,
        guideNote: null,
      })),
      reviews: (reviews || []).map((r) => ({
        id: r.id,
        author: r.author,
        city: r.city,
        rating: r.rating,
        text: r.text || r.comment,
        date: r.date || r.reviewDate,
      })),
    };
  } catch {
    return null;
  }
}

export async function getActivityBySlugDb(slug, options = {}) {
  if (!hasSupabaseEnv()) {
    const { activities, guides, getReviewsByActivity } = await import('../fixtures/data').catch(() => ({}));
    const a = (activities || []).find(x => x.slug === slug);
    if (!a) return null;
    const guide = (guides || []).find(g => g.slug === a.guideSlug);
    const reviews = getReviewsByActivity ? getReviewsByActivity(slug) : [];
    return {
      id: a.slug, slug: a.slug, title: a.title, tagline: a.tagline,
      shortDescription: a.shortDescription, description: a.longDescription,
      region: a.region, regionSlug: a.regionSlug, category: a.category,
      priceTwd: a.price, priceLabel: a.priceLabel,
      durationMinutes: a.durationMinutes, durationDisplay: a.durationDisplay,
      minParticipants: a.minParticipants, maxParticipants: a.maxParticipants,
      meetingPoint: a.meetingPoint, meetingPointMapUrl: a.meetingPointMapUrl,
      coverImageUrl: a.imageUrl, imageUrls: a.galleryUrls || [],
      inclusions: a.inclusions || [], exclusions: a.exclusions || [],
      notices: a.notices || [], refundRules: a.refundRules || [],
      safetyNotice: a.safetyNotice, faq: a.faq || [],
      status: 'published',
      guide: guide ? {
        id: guide.slug, slug: guide.slug, displayName: guide.displayName,
        headline: guide.headline, bio: guide.shortBio, region: guide.region,
        languages: guide.languages || [], specialties: guide.specialties || [],
        profilePhotoUrl: guide.avatarUrl, ratingAvg: guide.rating,
        reviewCount: guide.reviewCount, verificationBadges: guide.verificationBadges || []
      } : null,
      schedules: (a.schedules || []).map((s, i) => ({
        id: `${slug}-schedule-${i}`, startAt: s.startAt, endAt: s.endAt,
        capacity: s.capacity, bookedCount: s.bookedCount, status: s.status
      })),
      reviews: reviews.map(r => ({
        id: r.id, author: r.author, city: r.city, rating: r.rating,
        comment: r.text, date: r.date
      }))
    };
  }

  const supabase = await getSupabase();
  if (options.preferFixtureFirst) {
    const fixtureFirst = await getFixtureActivityBySlug(slug);
    if (fixtureFirst) return fixtureFirst;
  }

  const { data: act, error } = await supabase
    .from('activities')
    .select(`
      id, slug, title, tagline, short_description, description, region, region_slug, category,
      price_twd, duration_minutes, min_participants, max_participants,
      meeting_point, meeting_point_map_url, cover_image_url, image_urls,
      inclusions, exclusions, notices, refund_rules, refund_policy_type,
      safety_notice, faq, good_for, not_good_for, plans, status, published_at,
      itinerary, social_proof_quotes,
      rating_avg, review_count,
      guide_id, guide_slug,
      guide_profiles!activities_guide_id_fkey(
        id, slug, display_name, headline, bio, region, languages, specialties,
        profile_photo_url, rating_avg, review_count, gallery_urls
      )
    `)
    .eq('slug', slug)
    .single();

  if (error || !act) {
    try {
      const { activities, guides, getReviewsByActivity } = await import('../fixtures/data');
      const fixture = (activities || []).find((x) => x.slug === slug);
      if (fixture) {
        const guide = (guides || []).find(g => g.slug === fixture.guideSlug);
        const fixtureReviews = getReviewsByActivity
          ? getReviewsByActivity(fixture.slug)
          : ([]);
        return {
          id: fixture.slug,
          slug: fixture.slug,
          title: fixture.title,
          tagline: fixture.tagline,
          shortDescription: fixture.shortDescription,
          description: fixture.longDescription,
          region: fixture.region,
          regionSlug: fixture.regionSlug,
          category: fixture.category,
          priceTwd: fixture.price,
          priceLabel: fixture.priceLabel,
          durationMinutes: fixture.durationMinutes,
          durationDisplay: fixture.durationDisplay,
          minParticipants: fixture.minParticipants,
          maxParticipants: fixture.maxParticipants,
          meetingPoint: fixture.meetingPoint,
          meetingPointMapUrl: fixture.meetingPointMapUrl,
          coverImageUrl: fixture.imageUrl,
          imageUrls: fixture.galleryUrls || [],
          inclusions: fixture.inclusions || [],
          exclusions: fixture.exclusions || [],
          notices: fixture.notices || [],
          refundRules: fixture.refundRules || [],
          safetyNotice: fixture.safetyNotice,
          faq: fixture.faq || [],
          goodFor: fixture.goodFor || [],
          notGoodFor: fixture.notGoodFor || [],
          itinerary: fixture.faq ? [] : [],
          socialProofQuotes: fixture.socialProofQuotes || [],
          plans: null,
          status: 'published',
          guide: guide ? {
            id: guide.slug,
            slug: guide.slug,
            displayName: guide.displayName,
            headline: guide.headline,
            bio: guide.longBio || guide.shortBio,
            region: guide.region,
            languages: guide.languages || [],
            specialties: guide.specialties || [],
            profilePhotoUrl: guide.avatarUrl,
            ratingAvg: guide.rating,
            reviewCount: guide.reviewCount,
            galleryUrls: guide.galleryUrls || [],
          } : null,
          schedules: (fixture.schedules || []).map((s, i) => ({
            id: `${fixture.slug}-schedule-${i}`,
            startAt: s.startAt,
            endAt: s.endAt,
            capacity: s.capacity,
            bookedCount: s.bookedCount,
            status: s.status,
            planId: null,
            minParticipants: s.minParticipants,
            guideNote: null,
          })),
          reviews: (fixtureReviews || []).map(r => ({
            id: r.id,
            author: r.author,
            city: r.city,
            rating: r.rating,
            text: r.text || r.comment,
            date: r.date || r.reviewDate,
          })),
        };
      }
    } catch {}
    return null;
  }

  const gp = act.guide_profiles || {};

  const [scheduleRes, reviewsRes] = await Promise.all([
    supabase
      .from('activity_schedules')
      .select('id, start_at, end_at, capacity, booked_count, status, plan_id, min_participants, guide_note')
      .eq('activity_id', act.id)
      .in('status', ['open', 'full'])
      .order('start_at', { ascending: true }),
    (async () => {
      try {
        const { data: dbReviews, error: reviewErr } = await supabase
          .from('activity_reviews')
          .select('id, author, city, rating, review_text, review_date, is_verified')
          .eq('activity_slug', act.slug)
          .eq('status', 'approved')
          .order('review_date', { ascending: false })
          .limit(20);
        if (!reviewErr && dbReviews && dbReviews.length > 0) {
          return dbReviews.map(r => ({
            id: r.id, author: r.author, city: r.city, rating: r.rating,
            text: r.review_text, date: r.review_date, isVerified: r.is_verified
          }));
        }
      } catch {}
      try {
        const { getReviewsByActivity } = await import('../fixtures/data');
        const fixtureReviews = getReviewsByActivity ? getReviewsByActivity(act.slug) : [];
        return (fixtureReviews || []).slice(0, 20).map(r => ({
          id: r.id, author: r.author, city: r.city, rating: r.rating,
          text: r.text, date: r.date
        }));
      } catch {
        return [];
      }
    })()
  ]);

  const schedules = scheduleRes.data || [];

  const reviews = reviewsRes || [];

  return {
    id: act.id, slug: act.slug, title: act.title, tagline: act.tagline,
    shortDescription: act.short_description, description: act.description,
    region: act.region, regionSlug: act.region_slug, category: act.category,
    priceTwd: act.price_twd, priceLabel: `NT$${act.price_twd?.toLocaleString()} / 人`,
    durationMinutes: act.duration_minutes,
    durationDisplay: act.duration_minutes ? `${Math.floor(act.duration_minutes/60)} 小時` : '',
    minParticipants: act.min_participants, maxParticipants: act.max_participants,
    meetingPoint: act.meeting_point, meetingPointMapUrl: act.meeting_point_map_url,
    coverImageUrl: act.cover_image_url, imageUrls: act.image_urls || [],
    inclusions: act.inclusions || [], exclusions: act.exclusions || [],
    notices: act.notices || [], refundRules: act.refund_rules || [],
    safetyNotice: act.safety_notice, faq: act.faq || [],
    goodFor: act.good_for || [], notGoodFor: act.not_good_for || [],
    itinerary: act.itinerary || [], socialProofQuotes: act.social_proof_quotes || [],
    plans: act.plans || null,
    status: act.status,
    ratingAvg: act.rating_avg ?? null,
    reviewCount: act.review_count ?? 0,
    guide: {
      id: gp.id, slug: gp.slug, displayName: gp.display_name,
      headline: gp.headline, bio: gp.bio, region: gp.region,
      languages: gp.languages || [], specialties: gp.specialties || [],
      profilePhotoUrl: gp.profile_photo_url,
      ratingAvg: gp.rating_avg, reviewCount: gp.review_count,
      galleryUrls: gp.gallery_urls || []
    },
    schedules: (schedules || []).map(s => ({
      id: s.id, startAt: s.start_at, endAt: s.end_at,
      capacity: s.capacity, bookedCount: s.booked_count, status: s.status,
      planId: s.plan_id || null, minParticipants: s.min_participants || 1,
      guideNote: s.guide_note || null,
    })),
    // Reviews: query from activity_reviews table (migration 003), fallback to fixtures
    reviews,
  };
}

export async function listPublishedGuidesDb() {
  if (!hasSupabaseEnv()) {
    const { guides } = await import('../fixtures/data').catch(() => ({ guides: [] }));
    return (guides || []).map(g => ({
      id: g.slug, slug: g.slug, displayName: g.displayName,
      headline: g.headline, shortBio: g.shortBio, region: g.region,
      languages: g.languages || [], specialties: g.specialties || [],
      profilePhotoUrl: g.avatarUrl, heroImageUrl: g.heroImageUrl,
      galleryUrls: g.galleryUrls || [],
      ratingAvg: g.rating, reviewCount: g.reviewCount, serviceCount: g.serviceCount,
      verificationStatus: 'approved'
    }));
  }

  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('guide_profiles')
    .select('id, slug, display_name, headline, bio, region, languages, specialties, profile_photo_url, hero_image_url, gallery_urls, rating_avg, review_count, service_count, verification_status')
    .eq('verification_status', 'approved')
    .order('display_name');

  if (error) throw new Error(error.message);
  return (data || []).map(g => ({
    id: g.id, slug: g.slug, displayName: g.display_name,
    headline: g.headline, shortBio: g.bio, region: g.region,
    languages: g.languages || [], specialties: g.specialties || [],
    profilePhotoUrl: g.profile_photo_url, heroImageUrl: g.hero_image_url,
    galleryUrls: g.gallery_urls || [],
    ratingAvg: g.rating_avg, reviewCount: g.review_count, serviceCount: g.service_count,
    verificationStatus: g.verification_status
  }));
}

export async function getGuideBySlugDb(slug) {
  if (!hasSupabaseEnv()) {
    const { guides, getActivitiesByGuide, getReviewsByGuide } = await import('../fixtures/data').catch(() => ({}));
    const g = (guides || []).find(x => x.slug === slug);
    if (!g) return null;
    const acts = getActivitiesByGuide ? getActivitiesByGuide(slug) : [];
    const reviews = getReviewsByGuide ? getReviewsByGuide(slug) : [];
    return {
      id: g.slug, slug: g.slug, displayName: g.displayName,
      headline: g.headline, bio: g.longBio, region: g.region,
      languages: g.languages || [], specialties: g.specialties || [],
      verificationBadges: g.verificationBadges || [],
      profilePhotoUrl: g.avatarUrl, heroImageUrl: g.heroImageUrl,
      galleryUrls: g.galleryUrls || [],
      ratingAvg: g.rating, reviewCount: g.reviewCount, serviceCount: g.serviceCount,
      verificationStatus: 'approved',
      activities: acts.map(a => ({
        id: a.slug, slug: a.slug, title: a.title, category: a.category,
        region: a.region, priceTwd: a.price, coverImageUrl: a.imageUrl,
        status: 'published'
      })),
      reviews: reviews.map(r => ({
        id: r.id, author: r.author, city: r.city, rating: r.rating,
        comment: r.text, date: r.date
      }))
    };
  }

  const supabase = await getSupabase();
  const { data: gp, error } = await supabase
    .from('guide_profiles')
    .select('id, slug, display_name, headline, bio, region, languages, specialties, profile_photo_url, hero_image_url, gallery_urls, rating_avg, review_count, service_count, verification_status')
    .eq('slug', slug)
    .single();

  if (error || !gp) return null;

  const { data: acts } = await supabase
    .from('activities')
    .select('id, slug, title, category, region, price_twd, cover_image_url, status')
    .eq('guide_slug', slug)
    .eq('status', 'published');

  return {
    id: gp.id, slug: gp.slug, displayName: gp.display_name,
    headline: gp.headline, bio: gp.bio, region: gp.region,
    languages: gp.languages || [], specialties: gp.specialties || [],
    verificationBadges: [],
    profilePhotoUrl: gp.profile_photo_url, heroImageUrl: gp.hero_image_url,
    galleryUrls: gp.gallery_urls || [],
    ratingAvg: gp.rating_avg, reviewCount: gp.review_count,
    serviceCount: gp.service_count, verificationStatus: gp.verification_status,
    activities: (acts || []).map(a => ({
      id: a.id, slug: a.slug, title: a.title, category: a.category,
      region: a.region, priceTwd: a.price_twd, coverImageUrl: a.cover_image_url,
      status: a.status
    })),
    reviews: []
  };
}

// ---------------------------------------------------------------
// Admin — activities CRUD
// ---------------------------------------------------------------

export async function listAdminActivitiesDb(filters = {}) {
  if (!hasSupabaseEnv()) {
    return [];
  }

  const supabase = await getSupabase();
  let query = supabase
    .from('activities')
    .select(`
      id, slug, title, region, category, price_twd, status, published_at,
      created_at, updated_at, guide_slug, min_participants, max_participants,
      guide_profiles!activities_guide_id_fkey(display_name)
    `)
    .order('created_at', { ascending: false });

  if (filters.status) query = query.eq('status', filters.status);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  // Count schedules per activity
  const actIds = (data || []).map(r => r.id);
  let scheduleCountMap = {};
  if (actIds.length > 0) {
    const { data: sched } = await supabase
      .from('activity_schedules')
      .select('activity_id, status')
      .in('activity_id', actIds);
    for (const s of (sched || [])) {
      scheduleCountMap[s.activity_id] = (scheduleCountMap[s.activity_id] || 0) + 1;
    }
  }

  return (data || []).map(r => ({
    id: r.id, slug: r.slug, title: r.title, region: r.region,
    category: r.category, priceTwd: r.price_twd, status: r.status,
    publishedAt: r.published_at, createdAt: r.created_at, updatedAt: r.updated_at,
    guideSlug: r.guide_slug,
    guideName: r.guide_profiles?.display_name || r.guide_slug || '',
    minParticipants: r.min_participants, maxParticipants: r.max_participants,
    scheduleCount: scheduleCountMap[r.id] || 0
  }));
}

export async function getAdminActivityByIdDb(id) {
  if (!hasSupabaseEnv()) return null;

  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('activities')
    .select(`
      id, slug, title, tagline, short_description, description, region, region_slug, category,
      price_twd, duration_minutes, min_participants, max_participants,
      meeting_point, meeting_point_map_url, cover_image_url, image_urls,
      inclusions, exclusions, notices, refund_rules, safety_notice, faq,
      good_for, not_good_for, transport_mode, seo_title, seo_description,
      itinerary, social_proof_quotes,
      rating_avg, review_count,
      plans,
      status, published_at, created_at, updated_at,
      guide_id, guide_slug,
      guide_profiles!activities_guide_id_fkey(id, slug, display_name)
    `)
    .eq('id', id)
    .single();

  if (error || !data) return null;

  const { data: schedules } = await supabase
    .from('activity_schedules')
    .select('id, start_at, end_at, capacity, booked_count, status, plan_id, min_participants, guide_note')
    .eq('activity_id', id)
    .order('start_at');

  return {
    id: data.id, slug: data.slug, title: data.title, tagline: data.tagline,
    shortDescription: data.short_description, description: data.description,
    region: data.region, regionSlug: data.region_slug, category: data.category,
    priceTwd: data.price_twd, durationMinutes: data.duration_minutes,
    minParticipants: data.min_participants, maxParticipants: data.max_participants,
    meetingPoint: data.meeting_point, meetingPointMapUrl: data.meeting_point_map_url,
    coverImageUrl: data.cover_image_url, imageUrls: data.image_urls || [],
    inclusions: data.inclusions || [], exclusions: data.exclusions || [],
    notices: data.notices || [], refundRules: data.refund_rules || [],
    safetyNotice: data.safety_notice, faq: data.faq || [],
    goodFor: data.good_for || [], notGoodFor: data.not_good_for || [],
    itinerary: data.itinerary || [], socialProofQuotes: data.social_proof_quotes || [],
    transportMode: data.transport_mode, seoTitle: data.seo_title, seoDescription: data.seo_description,
    plans: data.plans || null,
    ratingAvg: data.rating_avg ?? null,
    reviewCount: data.review_count ?? 0,
    status: data.status, publishedAt: data.published_at,
    createdAt: data.created_at, updatedAt: data.updated_at,
    guideId: data.guide_id, guideSlug: data.guide_slug,
    guideName: data.guide_profiles?.display_name || '',
    schedules: (schedules || []).map(s => ({
      id: s.id, startAt: s.start_at, endAt: s.end_at,
      capacity: s.capacity, bookedCount: s.booked_count, status: s.status,
      planId: s.plan_id || null, minParticipants: s.min_participants || 1,
      guideNote: s.guide_note || null,
    }))
  };
}

export async function createActivityDb(input = {}) {
  if (!hasSupabaseEnv()) throw new Error('Supabase not configured');

  const supabase = await getSupabase();

  // Look up guide_id from guide_slug
  let guideId = input.guideId || null;
  if (!guideId && input.guideSlug) {
    const { data: gp } = await supabase
      .from('guide_profiles')
      .select('id')
      .eq('slug', input.guideSlug)
      .single();
    if (gp) guideId = gp.id;
  }

  const toJsonbArray = (v) => {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    return String(v).split('\n').map(x => x.trim()).filter(Boolean);
  };

  // slug 只允許英數字與連字號（Storage key 不能含中文）
  const slugBase = String(input.slug || input.title || '')
    .toLowerCase()
    .replace(/[\u4e00-\u9fff\u3400-\u4dbf]+/g, '')  // 移除中文字元
    .replace(/[^\w]+/g, '-')                          // 非英數字 → -
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
  const slug = (slugBase || 'activity') + '-' + Date.now();

  const payload = {
    id: crypto.randomUUID(),
    guide_id: guideId,
    guide_slug: input.guideSlug || null,
    title: String(input.title || '').trim(),
    slug,
    tagline: input.tagline || null,
    short_description: input.shortDescription || null,
    description: input.description || null,
    region: input.region || null,
    region_slug: input.regionSlug || null,
    category: input.category || null,
    price_twd: Number(input.priceTwd || 0),
    duration_minutes: input.durationMinutes ? Number(input.durationMinutes) : null,
    min_participants: Number(input.minParticipants || 1),
    max_participants: Number(input.maxParticipants || 10),
    meeting_point: input.meetingPoint || null,
    meeting_point_map_url: input.meetingPointMapUrl || null,
    cover_image_url: input.coverImageUrl || null,
    image_urls: input.imageUrls || [],
    inclusions: toJsonbArray(input.inclusions),
    exclusions: toJsonbArray(input.exclusions),
    notices: toJsonbArray(input.notices),
    refund_rules: toJsonbArray(input.refundRules),
    safety_notice: input.safetyNotice || null,
    transport_mode: input.transportMode || null,
    seo_title: input.seoTitle || null,
    seo_description: input.seoDescription || null,
    status: 'draft',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('activities')
    .insert(payload)
    .select('id, slug, title, status, created_at')
    .single();

  if (error || !data) throw new Error(error?.message || 'create activity failed');
  return data;
}

export async function updateActivityDb(id, input = {}) {
  if (!hasSupabaseEnv()) throw new Error('Supabase not configured');

  const supabase = await getSupabase();

  const toJsonbArray = (v) => {
    if (!v) return undefined;
    if (Array.isArray(v)) return v;
    return String(v).split('\n').map(x => x.trim()).filter(Boolean);
  };

  const patch = { updated_at: new Date().toISOString() };
  const fields = [
    ['title', 'title'], ['tagline', 'tagline'], ['shortDescription', 'short_description'],
    ['description', 'description'], ['region', 'region'], ['regionSlug', 'region_slug'],
    ['category', 'category'], ['priceTwd', 'price_twd'], ['durationMinutes', 'duration_minutes'],
    ['minParticipants', 'min_participants'], ['maxParticipants', 'max_participants'],
    ['meetingPoint', 'meeting_point'], ['meetingPointMapUrl', 'meeting_point_map_url'],
    ['coverImageUrl', 'cover_image_url'], ['safetyNotice', 'safety_notice'],
    ['transportMode', 'transport_mode'], ['seoTitle', 'seo_title'], ['seoDescription', 'seo_description'],
    ['guideSlug', 'guide_slug']
  ];
  // Rating signal fields (warm-start; will be auto-updated by review system #301)
  if (input.ratingAvg !== undefined) {
    patch.rating_avg = input.ratingAvg === null ? null : Math.min(5, Math.max(0, Number(input.ratingAvg)));
  }
  if (input.reviewCount !== undefined) {
    patch.review_count = Math.max(0, Number(input.reviewCount) || 0);
  }
  for (const [k, col] of fields) {
    if (input[k] !== undefined) patch[col] = input[k];
  }
  for (const [k, col] of [
    ['inclusions', 'inclusions'], ['exclusions', 'exclusions'],
    ['notices', 'notices'], ['refundRules', 'refund_rules'],
    ['goodFor', 'good_for'], ['notGoodFor', 'not_good_for'],
  ]) {
    if (input[k] !== undefined) patch[col] = toJsonbArray(input[k]);
  }
  if (input.imageUrls !== undefined) patch.image_urls = input.imageUrls;
  if (input.plans !== undefined) patch.plans = input.plans;
  if (input.safetyNotice !== undefined) patch.safety_notice = input.safetyNotice || null;
  if (input.faq !== undefined) patch.faq = Array.isArray(input.faq) ? input.faq : [];
  if (input.itinerary !== undefined) patch.itinerary = Array.isArray(input.itinerary) ? input.itinerary : [];
  if (input.socialProofQuotes !== undefined) patch.social_proof_quotes = toJsonbArray(input.socialProofQuotes);

  // Re-resolve guide_id if guideSlug changed
  if (input.guideSlug) {
    const { data: gp } = await supabase
      .from('guide_profiles').select('id').eq('slug', input.guideSlug).single();
    if (gp) patch.guide_id = gp.id;
  }

  const { error } = await supabase.from('activities').update(patch).eq('id', id);
  if (error) throw new Error(error.message);

  return getAdminActivityByIdDb(id);
}

export async function updateActivityStatusDb(id, status) {
  if (!hasSupabaseEnv()) throw new Error('Supabase not configured');

  const validStatuses = ['draft', 'published', 'archived'];
  if (!validStatuses.includes(status)) throw new Error('invalid status');

  const supabase = await getSupabase();
  const patch = { status, updated_at: new Date().toISOString() };
  if (status === 'published') patch.published_at = new Date().toISOString();

  const { error } = await supabase.from('activities').update(patch).eq('id', id);
  if (error) throw new Error(error.message);

  return getAdminActivityByIdDb(id);
}

// ─────────────────────────────────────────────
// Sprint 4.2 — Activity Schedule CRUD
// ─────────────────────────────────────────────

export async function listSchedulesByActivityDb(activityId) {
  if (!hasSupabaseEnv()) return [];
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('activity_schedules')
    .select('id, activity_id, start_at, end_at, capacity, booked_count, status, plan_id, min_participants, guide_note, created_at, updated_at')
    .eq('activity_id', activityId)
    .order('start_at');
  if (error) throw new Error(error.message);
  return (data || []).map(s => ({
    id: s.id,
    activityId: s.activity_id,
    startAt: s.start_at,
    endAt: s.end_at,
    capacity: s.capacity,
    bookedCount: s.booked_count,
    status: s.status,
    planId: s.plan_id || null,
    minParticipants: s.min_participants || 1,
    guideNote: s.guide_note || null,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  }));
}

export async function createScheduleDb(input = {}) {
  if (!hasSupabaseEnv()) throw new Error('Supabase not configured');
  const { activityId, startAt, endAt, capacity = 10, status = 'open', planId = null, minParticipants = 1, guideNote = null } = input;
  if (!activityId) throw new Error('activityId is required');
  if (!startAt)    throw new Error('startAt is required');
  if (!endAt)      throw new Error('endAt is required');

  const supabase = await getSupabase();
  const row = {
    activity_id: activityId, start_at: startAt, end_at: endAt,
    capacity: Number(capacity), booked_count: 0, status,
    plan_id: planId || null, min_participants: Number(minParticipants) || 1,
    guide_note: guideNote || null,
  };
  const { data, error } = await supabase
    .from('activity_schedules')
    .insert(row)
    .select('id, activity_id, start_at, end_at, capacity, booked_count, status, plan_id, min_participants, guide_note')
    .single();
  if (error) throw new Error(error.message);
  return {
    id: data.id, activityId: data.activity_id,
    startAt: data.start_at, endAt: data.end_at,
    capacity: data.capacity, bookedCount: data.booked_count, status: data.status,
    planId: data.plan_id || null, minParticipants: data.min_participants || 1,
    guideNote: data.guide_note || null,
  };
}

export async function updateScheduleDb(id, input = {}) {
  if (!hasSupabaseEnv()) throw new Error('Supabase not configured');
  const supabase = await getSupabase();

  const patch = {};
  if (input.startAt         !== undefined) patch.start_at        = input.startAt;
  if (input.endAt           !== undefined) patch.end_at          = input.endAt;
  if (input.capacity        !== undefined) patch.capacity        = Number(input.capacity);
  if (input.status          !== undefined) patch.status          = input.status;
  if (input.planId          !== undefined) patch.plan_id         = input.planId || null;
  if (input.minParticipants !== undefined) patch.min_participants = Number(input.minParticipants) || 1;
  if (input.guideNote       !== undefined) patch.guide_note      = input.guideNote || null;
  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('activity_schedules')
    .update(patch)
    .eq('id', id)
    .select('id, activity_id, start_at, end_at, capacity, booked_count, status')
    .single();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('schedule not found');
  return {
    id: data.id, activityId: data.activity_id,
    startAt: data.start_at, endAt: data.end_at,
    capacity: data.capacity, bookedCount: data.booked_count, status: data.status,
  };
}

export async function deleteScheduleDb(id) {
  if (!hasSupabaseEnv()) throw new Error('Supabase not configured');
  const supabase = await getSupabase();

  // 有訂單禁止刪除
  const { data: existing } = await supabase
    .from('activity_schedules')
    .select('id, booked_count')
    .eq('id', id)
    .single();
  if (!existing) throw new Error('schedule not found');
  if (existing.booked_count > 0) throw new Error(`CONFLICT: 此場次已有 ${existing.booked_count} 筆訂單，無法刪除`);

  const { error } = await supabase.from('activity_schedules').delete().eq('id', id);
  if (error) throw new Error(error.message);
  return { deleted: true, id };
}

export async function listGuideProfilesDb() {
  if (!hasSupabaseEnv()) {
    const { guides } = await import('../fixtures/data').catch(() => ({ guides: [] }));
    return (guides || []).map(g => ({ id: g.slug, slug: g.slug, displayName: g.displayName }));
  }

  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('guide_profiles')
    .select('id, slug, display_name')
    .order('display_name');

  if (error) throw new Error(error.message);
  return (data || []).map(g => ({ id: g.id, slug: g.slug, displayName: g.display_name }));
}

export async function searchGuidesDb(query = '') {
  if (!hasSupabaseEnv()) {
    const { guides } = await import('../fixtures/data').catch(() => ({ guides: [] }));
    const q = query.toLowerCase();
    return (guides || [])
      .filter(g => !q || g.displayName?.toLowerCase().includes(q) || g.slug?.includes(q))
      .slice(0, 10)
      .map(g => ({ id: g.slug, slug: g.slug, displayName: g.displayName, verificationStatus: 'approved' }));
  }

  const supabase = await getSupabase();
  let qb = supabase
    .from('guide_profiles')
    .select('id, slug, display_name, verification_status, profile_photo_url')
    .not('slug', 'is', null)
    .order('display_name')
    .limit(15);

  if (query.trim()) {
    qb = qb.or(`display_name.ilike.%${query}%,slug.ilike.%${query}%`);
  }

  const { data, error } = await qb;
  if (error) throw new Error(error.message);
  return (data || []).map(g => ({
    id: g.id, slug: g.slug, displayName: g.display_name,
    verificationStatus: g.verification_status, profilePhotoUrl: g.profile_photo_url,
  }));
}

export async function deleteActivityDb(id) {
  if (!hasSupabaseEnv()) throw new Error('Supabase not configured');
  const supabase = await getSupabaseServiceRole();

  // 1. 取得行程資料（slug + 圖片 URLs）
  const { data: act } = await supabase
    .from('activities')
    .select('id, slug, cover_image_url, image_urls')
    .eq('id', id)
    .single();

  if (!act) throw new Error('Activity not found');

  // 2. 收集所有 Supabase Storage 圖片路徑
  const BUCKET = 'activity-images';
  const storageBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
  const pathsToDelete = [];

  const collectPath = (url) => {
    if (url && typeof url === 'string' && url.startsWith(storageBase)) {
      pathsToDelete.push(url.replace(storageBase, ''));
    }
  };

  collectPath(act.cover_image_url);
  (act.image_urls || []).forEach(collectPath);

  // 3. 刪除 Storage 圖片
  if (pathsToDelete.length > 0) {
    const { error: storageErr } = await supabase.storage.from(BUCKET).remove(pathsToDelete);
    if (storageErr) console.warn('[deleteActivityDb] storage remove error:', storageErr.message);
  }

  // 4. 刪除相關 schedules（cascade 沒設的話手動刪）
  await supabase.from('activity_schedules').delete().eq('activity_id', id);

  // 5. 刪除行程本體
  const { error } = await supabase.from('activities').delete().eq('id', id);
  if (error) throw new Error(error.message);

  return { deleted: true, id, imagesDeleted: pathsToDelete.length };
}

async function getSupabaseServiceRole() {
  // 嘗試用 service role key；不存在則 fallback 一般 client
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    const { createClient } = await import('@supabase/supabase-js');
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return getSupabase();
}

// ---------------------------------------------------------------------------
// Issue #305: Wishlist helpers
// ---------------------------------------------------------------------------

const UUID_V4_LIKE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Resolve wishlist activity input to canonical activities.id (uuid).
 * Accepts either a uuid id or a slug.
 * @param {import('@supabase/supabase-js').SupabaseClient<any, 'public', any>} supabase
 * @param {string} activityRef
 * @returns {Promise<string>}
 */
async function resolveWishlistActivityId(supabase, activityRef) {
  const normalizedRef = String(activityRef || '').trim();
  if (!normalizedRef) throw new Error('activityId is required');

  if (UUID_V4_LIKE_RE.test(normalizedRef)) {
    return normalizedRef;
  }

  const { data: activity, error } = await supabase
    .from('activities')
    .select('id')
    .eq('slug', normalizedRef)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!activity?.id) throw new Error('activity not found');
  return String(activity.id);
}

/**
 * Add an activity to the user's wishlist.
 * Silently upserts to handle duplicate clicks gracefully.
 * @param {{ userId: string, activityId: string }} input
 * @returns {Promise<{ id: string, userId: string, activityId: string, addedAt: string }>}
 */
export async function addToWishlistDb(input) {
  const userId = String(input?.userId || '').trim();
  const activityRef = String(input?.activityId || '').trim();

  if (!userId) throw new Error('userId is required');
  if (!activityRef) throw new Error('activityId is required');

  const supabase = await getSupabase();
  const resolvedActivityId = await resolveWishlistActivityId(supabase, activityRef);

  const { data, error } = await supabase
    .from('wishlists')
    .upsert({ user_id: userId, activity_id: resolvedActivityId }, { onConflict: 'user_id,activity_id' })
    .select('id, user_id, activity_id, added_at')
    .single();

  if (error) throw new Error(error.message);
  return {
    id: data.id,
    userId: data.user_id,
    activityId: data.activity_id,
    addedAt: data.added_at,
  };
}

/**
 * Remove an activity from the user's wishlist.
 * @param {{ userId: string, activityId: string }} input
 * @returns {Promise<void>}
 */
export async function removeFromWishlistDb(input) {
  const userId = String(input?.userId || '').trim();
  const activityId = String(input?.activityId || '').trim();

  if (!userId) throw new Error('userId is required');
  if (!activityId) throw new Error('activityId is required');

  const supabase = await getSupabase();
  const { error } = await supabase
    .from('wishlists')
    .delete()
    .eq('user_id', userId)
    .eq('activity_id', activityId);

  if (error) throw new Error(error.message);
}

/**
 * List all wishlisted activities for a user, with activity details.
 * @param {{ userId: string }} input
 * @returns {Promise<Array<{ id: string, activityId: string, addedAt: string, title: string, slug: string, priceTwd: number }>>}
 */
export async function listWishlistDb(input) {
  const userId = String(input?.userId || '').trim();
  if (!userId) throw new Error('userId is required');

  const supabase = await getSupabase();

  // NOTE (Issue #431): avoid PostgREST embed dependency on
  // wishlists.activity_id -> activities.id relationship metadata.
  // Some production environments may have drifted schema/FK definitions,
  // which breaks embeds with PGRST200/PGRST201.
  const { data: rows, error } = await supabase
    .from('wishlists')
    .select('id, activity_id, added_at')
    .eq('user_id', userId)
    .order('added_at', { ascending: false });

  if (error) throw new Error(error.message);

  const activityRefs = [...new Set((rows || []).map((r) => String(r.activity_id || '').trim()).filter(Boolean))];
  // Accept any canonical UUID shape (not only RFC4122 v1-v5) because legacy production
  // rows may contain non-standard variant/version UUID-looking ids.
  const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const activityIds = activityRefs.filter((ref) => uuidLike.test(ref));
  const activitySlugs = activityRefs.filter((ref) => !uuidLike.test(ref));

  let activityByIdMap = new Map();
  let activityBySlugMap = new Map();

  // Safe: getSupabase() uses service-role key, which bypasses activities RLS
  // (status='published' filter does not apply here).
  if (activityIds.length > 0) {
    const { data: activitiesById, error: activityByIdError } = await supabase
      .from('activities')
      .select('id, title, slug, price_twd, cover_image_url')
      .in('id', activityIds);

    if (activityByIdError) throw new Error(activityByIdError.message);
    activityByIdMap = new Map((activitiesById || []).map((a) => [a.id, a]));
  }

  if (activitySlugs.length > 0) {
    const { data: activitiesBySlug, error: activityBySlugError } = await supabase
      .from('activities')
      .select('id, title, slug, price_twd, cover_image_url')
      .in('slug', activitySlugs);

    if (activityBySlugError) throw new Error(activityBySlugError.message);
    activityBySlugMap = new Map((activitiesBySlug || []).map((a) => [a.slug, a]));
  }

  return (rows || []).map((row) => {
    const activityRef = String(row.activity_id || '').trim();
    const activity = activityByIdMap.get(activityRef) || activityBySlugMap.get(activityRef);
    return {
      id: row.id,
      activityId: row.activity_id,
      addedAt: row.added_at,
      title: activity?.title || '',
      slug: activity?.slug || '',
      priceTwd: activity?.price_twd || 0,
      coverImageUrl: activity?.cover_image_url || null,
    };
  });
}

// ── Issue #448: Payouts — generate + confirm ───────────────────────────────────

/**
 * Return guide_balances rows where balance_twd >= minTwd.
 * Used by the generate-payouts cron to find eligible guides.
 * @param {any} supabase — service-role Supabase client
 * @param {number} minTwd — minimum balance threshold (e.g. 5000)
 * @returns {Promise<Array<{ guide_id: string, balance_twd: number }>>}
 */
export async function getGuideBalancesAboveThresholdDb(supabase, minTwd) {
  const { data, error } = await supabase
    .from('guide_balances')
    .select('guide_id, balance_twd')
    .gte('balance_twd', minTwd);
  if (error) throw error;
  return data ?? [];
}

/**
 * Create a pending payout for a guide, skipping if one already exists.
 * @param {any} supabase — service-role Supabase client
 * @param {string} guideId
 * @param {number} totalTwd
 * @returns {Promise<{ skipped: boolean, id: string, [key: string]: any }>}
 */
export async function createPayoutDb(supabase, guideId, totalTwd) {
  // Check no pending payout exists first
  const { data: existing } = await supabase
    .from('payouts')
    .select('id')
    .eq('guide_id', guideId)
    .eq('state', 'pending')
    .maybeSingle();
  if (existing) return { skipped: true, id: existing.id };

  const { data, error } = await supabase
    .from('payouts')
    .insert({ guide_id: guideId, total_twd: totalTwd, state: 'pending' })
    .select()
    .single();
  if (error) throw error;
  return { skipped: false, ...data };
}

/**
 * Confirm a pending payout: debit guide_balances, mark payout paid, write audit log.
 * @param {any} supabase — service-role Supabase client
 * @param {string} payoutId
 * @param {string|null} confirmedBy — admin identifier
 * @param {string|null} transferRef — bank transfer reference
 * @returns {Promise<object>} updated payout row
 */
export async function confirmPayoutDb(supabase, payoutId, confirmedBy, transferRef) {
  // Fetch payout
  const { data: payout, error: fetchErr } = await supabase
    .from('payouts')
    .select('*')
    .eq('id', payoutId)
    .single();
  if (fetchErr || !payout) throw new Error('payout not found');
  if (payout.state !== 'pending') throw new Error(`payout already ${payout.state}`);

  // Fetch current guide balance
  const { data: balance } = await supabase
    .from('guide_balances')
    .select('balance_twd')
    .eq('guide_id', payout.guide_id)
    .single();
  const newBalance = Math.max(0, (balance?.balance_twd ?? 0) - payout.total_twd);

  // Debit guide_balances
  await supabase
    .from('guide_balances')
    .upsert(
      { guide_id: payout.guide_id, balance_twd: newBalance, updated_at: new Date().toISOString() },
      { onConflict: 'guide_id' }
    );

  // Mark payout paid
  const { data: updated, error: updateErr } = await supabase
    .from('payouts')
    .update({
      state: 'paid',
      confirmed_by: confirmedBy ?? 'admin',
      confirmed_at: new Date().toISOString(),
      transfer_ref: transferRef ?? null,
    })
    .eq('id', payoutId)
    .select()
    .single();
  if (updateErr) throw updateErr;

  // Audit log
  await supabase
    .from('audit_logs')
    .insert({
      actor: confirmedBy ?? 'admin',
      action: 'payout_confirmed',
      metadata: {
        payout_id: payoutId,
        guide_id: payout.guide_id,
        total_twd: payout.total_twd,
        before_balance: balance?.balance_twd ?? 0,
        after_balance: newBalance,
        transfer_ref: transferRef ?? null,
      },
    });

  return updated;
}

export async function recordRefundReversalDb(supabase, { orderId, actor = 'system' }) {
  // Check if this order was already settled
  const { data: settlement } = await supabase
    .from('payout_items')
    .select('*')
    .eq('order_id', orderId)
    .eq('settlement_kind', 'settlement')
    .maybeSingle();

  if (!settlement) return { skipped: 'pre_settlement' };

  // Insert reversal row (idempotent via UNIQUE(order_id, settlement_kind))
  const reversalRow = {
    order_id: orderId,
    guide_id: settlement.guide_id,
    gmv_twd: -settlement.gmv_twd,
    commission_twd: -settlement.commission_twd,
    net_twd: -settlement.net_twd,
    rules_version: settlement.rules_version,
    settlement_kind: 'reversal',
    settled_at: new Date().toISOString(),
  };

  const { data: reversal, error: insertErr } = await supabase
    .from('payout_items')
    .upsert(reversalRow, { onConflict: 'order_id,settlement_kind', ignoreDuplicates: true })
    .select()
    .maybeSingle();

  if (insertErr) throw insertErr;
  if (!reversal) return { skipped: 'already_reversed' };

  // Debit guide_balances (carry-forward: balance can go negative)
  const { data: balance } = await supabase
    .from('guide_balances')
    .select('balance_twd')
    .eq('guide_id', settlement.guide_id)
    .maybeSingle();

  const beforeBalance = balance?.balance_twd ?? 0;
  const debit = Math.abs(settlement.net_twd);
  const newBalance = beforeBalance - debit; // can be negative (carry-forward)

  await supabase
    .from('guide_balances')
    .upsert(
      { guide_id: settlement.guide_id, balance_twd: newBalance, updated_at: new Date().toISOString() },
      { onConflict: 'guide_id' }
    );

  // Audit log entries
  await supabase.from('audit_logs').insert([
    {
      actor,
      action: 'payout_reversal_created',
      metadata: {
        order_id: orderId,
        guide_id: settlement.guide_id,
        net_twd: settlement.net_twd,
        reversal_id: reversal.id,
        settlement_id: settlement.id,
      },
    },
    {
      actor,
      action: 'guide_balance_debited_reversal',
      metadata: {
        guide_id: settlement.guide_id,
        before_balance: beforeBalance,
        after_balance: newBalance,
        debit,
      },
    },
  ]);

  return { reversed: true, reversal_id: reversal.id, before_balance: beforeBalance, after_balance: newBalance };
}
