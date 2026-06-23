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
import { buildFormalPlanBackfillRows } from './activity-plans-rich-mapper.mjs';
import { buildGuideShopView } from './guide-shop.mjs';
import { applyUpsertWithMissingColumnFallback } from './activity-plans-insert-fallback.mjs';
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
  updateAdminRefundStatusFallback,
  getHomepageFeaturedFallback,
  setHomepageFeaturedFallback
} from './admin.mjs';
import { normalizeHomepageFeatured } from './homepage-featured.mjs';
import {
  isMissingHomepageFeaturedTable,
  isMissingHomepageFeaturedCopyColumn,
  HOMEPAGE_FEATURED_TABLE_MISSING_MESSAGE,
} from './homepage-featured-error.mjs';
import { sanitizeEditorPickCopy, sanitizeMoreFeaturedCopy } from './homepage-featured-copy.mjs';
import { isMissingTableError } from './missing-table-error.mjs';

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

// #1385: audit log 單一實作於 audit-log.mjs（admin.mjs/services.mjs 亦共用）；
// refund 狀態機集中於 refund-transition.mjs（ESM import 會被 hoist，置此保留原始碼位置脈絡）
import { insertAuditLogDb } from './audit-log.mjs';
import { normalizeSocialProofQuotes } from './social-proof-quotes.mjs';
import { normalizeRegionForActivityPath } from './region-slug.mjs';
import { normalizeRegionToDbValue } from './region-slugs.mjs';
import { resolveAdminRefundTransition } from './refund-transition.mjs';
// #1383 — 訂單改期（fallback 實作 + 純規則）
import {
  createRescheduleRequestInMemory,
  listRescheduleOptionsInMemory,
  decideRescheduleRequestInMemory,
  withdrawRescheduleRequestInMemory,
  listGuideRescheduleRequestsInMemory,
} from './reschedule-store.mjs';
import { canRequestReschedule, isRescheduleTargetValid, isRescheduleRequestExpired } from './reschedule.mjs';
import {
  listOrderMessagesInMemory,
  createOrderMessageInMemory,
  listGuideMessageThreadsInMemory,
} from './order-messages-store.mjs';
import {
  getOrderMessageWindow,
  shouldNotifyOrderMessage,
  serialiseOrderMessage,
  validateOrderMessageBody,
} from './order-messages.mjs';

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

export async function upsertEcpayPaymentAttemptDb(input = {}) {
  const orderId = String(input?.orderId || '').trim();
  const merchantTradeNo = String(input?.merchantTradeNo || '').trim();
  const amountTwd = Number(input?.amountTwd || 0);

  if (!orderId) throw new Error('orderId is required');
  if (!merchantTradeNo) throw new Error('merchantTradeNo is required');
  if (!Number.isFinite(amountTwd) || amountTwd < 0) throw new Error('amountTwd must be a non-negative number');

  if (!hasSupabaseEnv()) {
    return {
      orderId,
      merchantTradeNo,
      status: 'pending',
      simulated: true,
    };
  }

  const now = new Date().toISOString();
  const supabase = await getSupabase();

  const { data: existingPending, error: existingPendingError } = await supabase
    .from('payments')
    .select('id, order_id, merchant_trade_no, status')
    .eq('order_id', orderId)
    .eq('provider', 'ecpay')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingPendingError) {
    throw new Error(existingPendingError.message || 'failed to fetch existing pending payment attempt');
  }

  if (existingPending) {
    return {
      id: existingPending.id,
      orderId: existingPending.order_id,
      merchantTradeNo: existingPending.merchant_trade_no,
      status: existingPending.status,
      reused: true,
    };
  }

  const payload = {
    order_id: orderId,
    provider: 'ecpay',
    merchant_trade_no: merchantTradeNo,
    amount_twd: Math.round(amountTwd),
    currency: 'TWD',
    status: 'pending',
    provider_status: 'pending',
    updated_at: now,
  };

  const { data, error } = await supabase
    .from('payments')
    .insert(payload)
    .select('id, order_id, merchant_trade_no, status')
    .single();

  if (error || !data) throw new Error(error?.message || 'failed to create ecpay payment attempt');

  return {
    id: data.id,
    orderId: data.order_id,
    merchantTradeNo: data.merchant_trade_no,
    status: data.status,
    reused: false,
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

  // admin POS 「取消＋退款」會先把訂單設成 cancelled_by_guide 再建退款 entry，
  // 因此 allowAdminCancelled 時放行 cancelled_by_guide（仍擋 user 取消與已退款）。
  const blockedStatuses = input?.allowAdminCancelled
    ? ['cancelled_by_user', 'refunded']
    : ['cancelled_by_user', 'cancelled_by_guide', 'refunded'];
  if (blockedStatuses.includes(order.status)) {
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
    // In-memory fallback: store.mjs exports the mutable `orders`/`experiences`
    // arrays directly (no getOrders/setOrders accessors), so mutate in place.
    const { orders, experiences } = await import('./store.mjs');
    const order = orders.find((o) => o.id === orderId);
    if (!order) throw new Error('order not found');
    if (!CANCELLABLE.includes(order.status)) throw new Error(`order_cancel_locked:${order.status}`);
    const previousStatus = order.status;
    order.status = 'cancelled_by_guide';
    order.updatedAt = new Date().toISOString();
    // Release booked seats — mirror the Supabase path's seat release.
    if (order.scheduleId && order.peopleCount) {
      const exp = experiences.find((e) => e.id === order.experienceId);
      const schedule = exp?.schedules?.find((s) => s.id === order.scheduleId);
      if (schedule) {
        schedule.bookedCount = Math.max(0, (schedule.bookedCount || 0) - order.peopleCount);
        if (schedule.status) {
          schedule.status = schedule.bookedCount < schedule.capacity ? 'open' : 'full';
        }
      }
    }
    return { id: orderId, status: 'cancelled_by_guide', previousStatus };
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
      // 允許對已被後台取消（cancelled_by_guide）的訂單建立退款 entry
      allowAdminCancelled: true,
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

  const selectWithTradeNo = 'id, status, total_twd, activity_id, schedule_id, people_count, contact_name, contact_phone, contact_email, trade_no, created_at, paid_at, admin_note, updated_at';
  const selectWithoutTradeNo = 'id, status, total_twd, activity_id, schedule_id, people_count, contact_name, contact_phone, contact_email, created_at, paid_at, admin_note, updated_at';

  const buildQuery = (selectClause) => {
    let q = supabase
      .from('orders')
      .select(selectClause)
      .order('created_at', { ascending: false });

    if (status) q = q.eq('status', status);
    if (contactEmail) q = q.eq('contact_email', contactEmail);
    return q;
  };

  let { data, error } = await buildQuery(selectWithTradeNo);

  // Schema drift guard: some environments may not yet have orders.trade_no.
  if (error?.message?.includes('column orders.trade_no does not exist')) {
    ({ data, error } = await buildQuery(selectWithoutTradeNo));
  }

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
      experienceId: r.activity_id || null,
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

  // 防呆：不得手動切換到的終端狀態（須走專用流程）。
  const MANUAL_BLOCKED_STATUSES = ['cancelled_by_user', 'cancelled_by_guide', 'refund_pending', 'refunded'];

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

  // 防呆：這些終端狀態只能由專用流程到達（取消＋退款、退款執行、旅客退款申請），
  // 不得由訂單詳情「狀態下拉」手動設定 — 否則會造成不釋放名額／無退款記錄的孤兒訂單。
  if (status && MANUAL_BLOCKED_STATUSES.includes(status)) {
    throw new Error(`manual_status_change_blocked:${status}`);
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

  // #1401: reject 必須依訂單實際付款狀態回 paid / pending_payment（與 fallback 一致）
  const { data: orderRow } = await supabase
    .from('orders')
    .select('paid_at')
    .eq('id', req.order_id)
    .maybeSingle();

  const now = new Date().toISOString();
  // #1385: 狀態機集中於 refund-transition.mjs（與 admin.mjs fallback 共用）
  const transition = resolveAdminRefundTransition(action, { now, hasPaidAt: Boolean(orderRow?.paid_at) });
  const nextStatus = transition.refundStatus;
  const orderStatus = transition.orderStatus;
  const patch = { admin_note: adminNote, updated_at: now, ...transition.refundPatch };

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
  // Issue #847: only `completed` orders enter payout (per
  // docs/05-business/06-payment-plan/03-settlement-rules.md §5). Orders in
  // `paid`/`confirmed` are pre-completion; `refund_pending`/`refunded` are
  // excluded by definition.
  const cutoff = new Date(Date.now() - tDays * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('orders')
    .select('id, total_twd, activity_id, schedule_id, activities!inner(guide_id), activity_schedules!inner(start_at), operations_tracking(refund_amount_twd)')
    .eq('status', 'completed')
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
    .select('id, order_id, manual_minutes, manual_cost_twd, refund_amount_twd, subsidy_twd, is_rescheduled, has_complaint, has_guide_adjustment, has_oversell_issue, is_disputed, is_safety_case, note, updated_at')
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
    const hasException = Boolean(refundAmountTwd > 0 || ops.is_rescheduled || ops.has_complaint || ops.has_guide_adjustment || ops.has_oversell_issue || ops.is_disputed || ops.is_safety_case);
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
      isDisputed: !!r.is_disputed,
      isSafetyCase: !!r.is_safety_case,
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
    is_disputed: !!input?.isDisputed,
    is_safety_case: !!input?.isSafetyCase,
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
  const toStringArray = (value) =>
    Array.isArray(value) ? value.map((v) => String(v || '').trim()).filter(Boolean) : [];
  const specialties = toStringArray(input?.specialties);
  const languages = toStringArray(input?.languages);
  const regions = toStringArray(input?.regions);
  const certifications = toStringArray(input?.certs ?? input?.certifications);
  // 收款方式由單選改可複選：優先讀陣列 payments/paymentMethods，向後相容單一 payment 字串。
  const paymentMethods = Array.isArray(input?.payments ?? input?.paymentMethods)
    ? toStringArray(input?.payments ?? input?.paymentMethods)
    : toStringArray([input?.payment ?? input?.paymentMethod]);
  const paymentMethod = paymentMethods[0] || null;
  const profilePhotoUrl = String(input?.profilePhotoUrl || '').trim() || null;
  const heroImageUrl = String(input?.heroImageUrl || '').trim() || null;
  const galleryUrls = toStringArray(input?.galleryUrls).slice(0, 12);

  if (!fullName) throw new Error('fullName is required');
  if (!phone) throw new Error('phone is required');
  if (!email) throw new Error('email is required');
  if (!city) throw new Error('city is required');
  if (!bio) throw new Error('bio is required');

  const supabase = await getSupabase();

  const basePayload = {
    id: crypto.randomUUID(),
    full_name: fullName,
    phone,
    email,
    city,
    bio,
    status: 'pending'
  };
  // payment_methods 為較新欄位（20260623_guide_profile_familiar_regions）；其餘 rich
  // 欄位（specialties…payment_method）由 20260610 加入。分三層 payload 以對應不同
  // migration 進度，確保部分 migrate 的環境不會連帶丟掉舊 rich 欄位。
  const richPayloadV1 = {
    ...basePayload,
    specialties,
    languages,
    regions,
    certifications,
    payment_method: paymentMethod,
    profile_photo_url: profilePhotoUrl,
    hero_image_url: heroImageUrl,
    gallery_urls: galleryUrls,
  };
  const richPayloadV2 = { ...richPayloadV1, payment_methods: paymentMethods };

  const baseSelect = 'id, full_name, phone, email, city, bio, status, admin_note, created_at, updated_at';
  const richSelectV1 = `${baseSelect}, specialties, languages, regions, certifications, payment_method, profile_photo_url, hero_image_url, gallery_urls`;
  const richSelectV2 = `${richSelectV1}, payment_methods`;

  const isMissingColumn = (e) =>
    e && (e.code === '42703' || /column .*does not exist/i.test(e.message || ''));

  // Tier 1：完整欄位（含 payment_methods）。
  let { data, error } = await supabase
    .from('guide_applications')
    .insert(richPayloadV2)
    .select(richSelectV2)
    .single();

  // Tier 2：缺 payment_methods（跑了 20260610、未跑 20260623）→ 退回 V1，保住其餘 rich 欄位。
  if (isMissingColumn(error)) {
    ({ data, error } = await supabase
      .from('guide_applications')
      .insert(richPayloadV1)
      .select(richSelectV1)
      .single());
  }

  // Tier 3：連 20260610 都沒跑 → 退回 base，至少不遺失申請本體。
  if (isMissingColumn(error)) {
    ({ data, error } = await supabase
      .from('guide_applications')
      .insert(basePayload)
      .select(baseSelect)
      .single());
  }

  if (error || !data) throw new Error(error?.message || 'guide application create failed');

  return mapGuideApplicationRow(data);
}

function mapGuideApplicationRow(r) {
  const arr = (value) => (Array.isArray(value) ? value : []);
  return {
    id: r.id,
    fullName: r.full_name,
    phone: r.phone,
    email: r.email,
    city: r.city,
    bio: r.bio,
    specialties: arr(r.specialties),
    languages: arr(r.languages),
    regions: arr(r.regions),
    certifications: arr(r.certifications),
    paymentMethod: r.payment_method ?? null,
    paymentMethods: (() => {
      const list = arr(r.payment_methods ?? r.paymentMethods);
      if (list.length) return list;
      // 向後相容：尚無 payment_methods 欄位時，由單選 payment_method 推出單元素陣列。
      return r.payment_method ? [r.payment_method] : [];
    })(),
    profilePhotoUrl: r.profile_photo_url ?? r.profilePhotoUrl ?? null,
    heroImageUrl: r.hero_image_url ?? r.heroImageUrl ?? null,
    galleryUrls: arr(r.gallery_urls ?? r.galleryUrls),
    status: r.status,
    adminNote: r.admin_note,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

export async function listGuideApplicationsDb(input = {}) {
  if (!hasSupabaseEnv()) return listGuideApplicationsInMemory(input);

  const status = String(input?.status || '').trim();
  const supabase = await getSupabase();

  const baseSelect = 'id, full_name, phone, email, city, bio, status, admin_note, created_at, updated_at';
  const richSelectV1 = `${baseSelect}, specialties, languages, regions, certifications, payment_method, profile_photo_url, hero_image_url, gallery_urls`;
  const richSelectV2 = `${richSelectV1}, payment_methods`;

  const buildQuery = (selectClause) => {
    let q = supabase
      .from('guide_applications')
      .select(selectClause)
      .order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    return q;
  };

  const isMissingColumn = (e) =>
    e && (e.code === '42703' || /column .*does not exist/i.test(e.message || ''));

  // Schema drift guard（三層，見 createGuideApplicationDb）：payment_methods → 其餘 rich → base。
  let { data, error } = await buildQuery(richSelectV2);
  if (isMissingColumn(error)) ({ data, error } = await buildQuery(richSelectV1));
  if (isMissingColumn(error)) ({ data, error } = await buildQuery(baseSelect));
  if (error) throw new Error(error.message);

  return (data || []).map(mapGuideApplicationRow);
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

  // 趨勢圖桶必須跟隨選擇的時間範圍（preset / 自訂），不得寫死近 7 日 —
  // 否則 KPI 卡片換了範圍、趨勢圖卻停在 7 天，呈現互相矛盾。
  // 無任何範圍時維持近 7 日預設；桶數上限 90（保留最近的日子）防爆量。
  const TREND_MAX_BUCKETS = 90;
  const now = new Date();
  let trendEnd = rangeTo
    ? new Date(new Date(rangeTo).getTime() - 1)
    : new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (trendEnd > now) trendEnd = now;
  let trendStart = rangeFrom
    ? new Date(rangeFrom)
    : new Date(trendEnd.getFullYear(), trendEnd.getMonth(), trendEnd.getDate() - 6);
  trendStart = new Date(trendStart.getFullYear(), trendStart.getMonth(), trendStart.getDate());
  trendEnd = new Date(trendEnd.getFullYear(), trendEnd.getMonth(), trendEnd.getDate());
  const minStart = new Date(trendEnd.getFullYear(), trendEnd.getMonth(), trendEnd.getDate() - (TREND_MAX_BUCKETS - 1));
  if (trendStart < minStart) trendStart = minStart;

  const trendMap = new Map();
  for (let d = new Date(trendStart); d <= trendEnd; d.setDate(d.getDate() + 1)) {
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

  const isSimulatePaid = String(input?.SimulatePaid ?? input?.simulatePaid ?? '').trim() === '1';
  if (isSimulatePaid) {
    const supabase = await getSupabase();
    const { data: order, error } = await supabase
      .from('orders')
      .select('id, status, total_twd, paid_at')
      .eq('id', orderId)
      .single();
    if (error || !order) throw new Error(error?.message || 'order not found');

    await insertAuditLogDb(supabase, {
      orderId,
      actor: 'system',
      action: 'payment_callback_simulate_paid_noop',
      metadata: {
        event_type: 'payment_callback_simulate_paid_noop',
        source: 'payment/ecpay_callback',
        provider: 'ecpay',
        order_id: orderId,
        trade_no: String(input?.tradeNo || input?.TradeNo || '').trim() || null,
        order_status: order.status,
        callback_received_at: new Date().toISOString(),
      },
    });

    return {
      order: {
        id: order.id,
        status: order.status,
        totalTwd: order.total_twd,
        paidAt: order.paid_at,
      },
      scheduleUpdated: false,
      schedule: null,
      simulated: true,
    };
  }

  const supabase = await getSupabase();

  const merchantTradeNo = String(input?.merchantTradeNo || input?.MerchantTradeNo || '').trim() || null;
  const tradeNo = String(input?.tradeNo || input?.TradeNo || '').trim() || null;

  const { data, error } = await supabase.rpc('fn_process_payment_callback_atomic', {
    p_order_id: orderId,
    p_trade_no: tradeNo,
    p_owner_email: String(input?.ownerEmail || '').trim() || null,
    p_raw_payload: input || null,
    p_merchant_trade_no: merchantTradeNo,
    p_provider: 'ecpay',
  });

  if (error) {
    const err = new Error(error.message || 'payment callback processing failed');
    // Bubble specific code for API error mapping / observability.
    err.code = error.code;
    throw err;
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) throw new Error('payment callback processing returned empty result');

  let paymentQuery = supabase
    .from('payments')
    .select('id')
    .eq('order_id', orderId)
    .eq('provider', 'ecpay');

  if (merchantTradeNo) {
    paymentQuery = paymentQuery.eq('merchant_trade_no', merchantTradeNo);
  } else if (tradeNo) {
    paymentQuery = paymentQuery.eq('trade_no', tradeNo);
  } else {
    paymentQuery = paymentQuery.order('created_at', { ascending: false }).limit(1);
  }

  const { data: paymentRow, error: paymentRowError } = await paymentQuery.maybeSingle();

  if (paymentRowError) throw new Error(paymentRowError.message || 'failed to resolve payment row after callback');

  if (paymentRow?.id) {
    let paidEventQuery = supabase
      .from('payment_events')
      .select('id')
      .eq('provider', 'ecpay')
      .eq('event_type', 'callback_paid')
      .eq('order_id', orderId)
      .limit(1);

    paidEventQuery = merchantTradeNo
      ? paidEventQuery.eq('merchant_trade_no', merchantTradeNo)
      : paidEventQuery.is('merchant_trade_no', null);

    paidEventQuery = tradeNo
      ? paidEventQuery.eq('trade_no', tradeNo)
      : paidEventQuery.is('trade_no', null);

    const { data: existingPaidEvent, error: existingPaidEventError } = await paidEventQuery.maybeSingle();

    if (existingPaidEventError) throw new Error(existingPaidEventError.message || 'failed to query callback_paid event');

    if (!existingPaidEvent) {
      const { error: insertCallbackEventError } = await supabase
        .from('payment_events')
        .insert({
          payment_id: paymentRow.id,
          order_id: orderId,
          provider: 'ecpay',
          merchant_trade_no: merchantTradeNo,
          trade_no: tradeNo,
          event_type: 'callback_paid',
          payload: {
            source: 'processPaymentCallbackDb',
            provider: 'ecpay',
            orderId,
            merchantTradeNo,
            tradeNo,
          },
        });

      if (insertCallbackEventError && insertCallbackEventError.code !== '23505') {
        throw new Error(insertCallbackEventError.message || 'failed to insert callback_paid payment event');
      }
    }
  }

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

/**
 * Idempotently record an ECPay refund callback result.
 * Returns { alreadyRefunded, orderId, refundRequestId }
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ merchantTradeNo: string, tradeNo: string, rawPayload: Record<string, unknown> }} opts
 */
export async function processRefundCallbackDb(supabase, { merchantTradeNo, tradeNo, rawPayload }) {
  if (!merchantTradeNo) throw new Error('merchantTradeNo is required');

  // 1. Find order by MerchantTradeNo (stored in payments.merchant_trade_no)
  const { data: paymentRow, error: paymentErr } = await supabase
    .from('payments')
    .select('order_id')
    .eq('merchant_trade_no', merchantTradeNo)
    .maybeSingle();

  if (paymentErr) throw new Error(paymentErr.message || 'failed to look up payment');
  if (!paymentRow) throw new Error(`no payment found for MerchantTradeNo=${merchantTradeNo}`);

  const orderId = paymentRow.order_id;

  // 2. Idempotency: check payment_events for existing refunded event
  const { data: existingEvent } = await supabase
    .from('payment_events')
    .select('id')
    .eq('order_id', orderId)
    .eq('event_type', 'refunded')
    .maybeSingle();

  if (existingEvent) {
    // 3. Already processed — return early with no DB side effects
    return { alreadyRefunded: true, orderId, refundRequestId: null };
  }

  // 4. Update orders.status = 'refunded', payment_status = 'refunded'
  const { error: orderErr } = await supabase
    .from('orders')
    .update({ status: 'refunded', payment_status: 'refunded' })
    .eq('id', orderId);

  if (orderErr) throw new Error(orderErr.message || 'failed to update order status');

  // 5. Update latest refund_request: status = 'refunded', refunded_at = now()
  const { data: refundReqRow, error: refundReqErr } = await supabase
    .from('refund_requests')
    .update({ status: 'refunded', refunded_at: new Date().toISOString() })
    .eq('order_id', orderId)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(1)
    .select('id')
    .maybeSingle();

  if (refundReqErr) {
    // Non-fatal: refund_requests row may not exist for all flows
    console.warn('[processRefundCallbackDb] refund_requests update warning:', refundReqErr.message);
  }

  const refundRequestId = refundReqRow?.id ?? null;

  // 6. Update payments.status = 'refunded'
  const { error: paymentsErr } = await supabase
    .from('payments')
    .update({ status: 'refunded' })
    .eq('merchant_trade_no', merchantTradeNo);

  if (paymentsErr) {
    console.warn('[processRefundCallbackDb] payments update warning:', paymentsErr.message);
  }

  // 7. Insert payment_events(event_type='refunded', payload)
  const { error: eventErr } = await supabase.from('payment_events').insert({
    order_id: orderId,
    event_type: 'refunded',
    payload: rawPayload ?? {},
    trade_no: tradeNo || null,
  });

  if (eventErr) throw new Error(eventErr.message || 'failed to insert payment_event');

  // 8. Return result
  return { alreadyRefunded: false, orderId, refundRequestId };
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
    const { activities, guides, getReviewsByActivity } = await import('../fixtures/data').catch(() => ({ activities: [], guides: [] }));
    let result = activities || [];
    if (filters.region) {
      // 地區比對一律正規化兩端（'高雄' / 'kaohsiung' / '高雄市' 視為同一地區），
      // 避免連結用短名、資料存全名時精確比對失配（footer 高雄篩選 0 筆的根因）。
      const wantRegion = normalizeRegionToDbValue(filters.region);
      result = result.filter(a => normalizeRegionToDbValue(a.region) === wantRegion);
    }
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
      // #收藏星數：帶上行程自身的真實評論 + 社群口碑語錄，供列表卡用
      // resolveActivityReviewStats 算出與詳情頁一致的星數/則數（單一真實來源）。
      const actReviews = getReviewsByActivity ? getReviewsByActivity(a.slug) : [];
      return {
        id: a.slug, slug: a.slug, title: a.title, tagline: a.tagline,
        shortDescription: a.shortDescription, region: a.region, regionSlug: a.regionSlug,
        category: a.category, priceTwd: a.price, durationMinutes: a.durationMinutes,
        durationDisplay: a.durationDisplay, minParticipants: a.minParticipants,
        maxParticipants: a.maxParticipants, coverImageUrl: a.imageUrl,
        status: 'published', guideName: guide?.displayName || '',
        guideSlug: a.guideSlug, guideAvatarUrl: guide?.avatarUrl || '',
        ratingAvg: a.ratingAvg ?? null,
        reviewCount: (actReviews || []).length,
        reviews: (actReviews || []).map(r => ({ rating: r.rating })),
        socialProofQuotes: a.socialProofQuotes || [],
      };
    });
  }

  const supabase = await getSupabase();
  // 地區篩選正規化成 DB 規範值（'高雄' → '高雄市'）後再 .eq()，讓 footer／熱門目的地
  // 用短名連結也能命中以全名儲存的資料（admin 表單存全名）。
  const regionFilter = filters.region ? normalizeRegionToDbValue(filters.region) : '';
  let query = supabase
    .from('activities')
    .select(`
      id, slug, title, tagline, short_description, region, region_slug, category,
      price_twd, duration_minutes, min_participants, max_participants,
      cover_image_url, status, published_at,
      rating_avg, social_proof_quotes,
      guide_id, guide_slug
    `)
    .eq('status', 'published')
    .order('published_at', { ascending: false });

  if (regionFilter) query = query.eq('region', regionFilter);
  if (filters.category) query = query.eq('category', filters.category);
  if (filters.q) query = query.ilike('title', `%${filters.q}%`);

  let { data, error } = await query;
  // schema-drift guard：rating_avg／social_proof_quotes 在部分環境可能尚未存在，
  // 欄位不存在（42703）時退回精簡 select，避免整個列表頁 500。
  if (error && (error.code === '42703' || /column .*does not exist/i.test(error.message || ''))) {
    let retry = supabase
      .from('activities')
      .select(`
        id, slug, title, tagline, short_description, region, region_slug, category,
        price_twd, duration_minutes, min_participants, max_participants,
        cover_image_url, status, published_at,
        guide_id, guide_slug
      `)
      .eq('status', 'published')
      .order('published_at', { ascending: false });
    if (regionFilter) retry = retry.eq('region', regionFilter);
    if (filters.category) retry = retry.eq('category', filters.category);
    if (filters.q) retry = retry.ilike('title', `%${filters.q}%`);
    ({ data, error } = await retry);
  }
  if (error) throw new Error(error.message);

  // #收藏星數：批次撈出所有行程的「已核准」真實評論星數，依 activity_slug 分組，
  // 供列表卡用 resolveActivityReviewStats 算出與詳情頁一致的星數/則數。
  const slugs = [...new Set((data || []).map(r => r.slug).filter(Boolean))];
  const reviewsBySlug = new Map();
  if (slugs.length > 0) {
    const { data: reviewRows } = await supabase
      .from('activity_reviews')
      .select('activity_slug, rating')
      .in('activity_slug', slugs)
      .eq('status', 'approved');
    for (const row of reviewRows || []) {
      const list = reviewsBySlug.get(row.activity_slug) || [];
      list.push({ rating: row.rating });
      reviewsBySlug.set(row.activity_slug, list);
    }
  }

  const guideIds = [...new Set((data || []).map((r) => r.guide_id).filter(Boolean))];
  let guideMap = new Map();
  if (guideIds.length > 0) {
    const { data: guides, error: guidesError } = await supabase
      .from('guide_profiles')
      .select('id, slug, display_name, profile_photo_url, rating_avg, review_count, verification_status')
      .in('id', guideIds);
    if (guidesError) throw new Error(guidesError.message);
    guideMap = new Map((guides || []).map((g) => [g.id, g]));
  }

  return (data || [])
    // 下架（停權）導遊的行程一併隱藏：有導遊且該導遊非 approved → 排除。
    // 無導遊的平台行程（guide_id 為 null）不受影響。
    .filter(r => {
      if (!r.guide_id) return true;
      const guide = guideMap.get(r.guide_id);
      return guide ? guide.verification_status === 'approved' : true;
    })
    .map(r => {
    const guide = guideMap.get(r.guide_id) || null;
    const actReviews = reviewsBySlug.get(r.slug) || [];
    return {
      id: r.id, slug: r.slug, title: r.title, tagline: r.tagline,
      shortDescription: r.short_description, region: r.region, regionSlug: r.region_slug,
      category: r.category, priceTwd: r.price_twd, durationMinutes: r.duration_minutes,
      minParticipants: r.min_participants, maxParticipants: r.max_participants,
      coverImageUrl: r.cover_image_url, status: r.status,
      guideName: guide?.display_name || '',
      guideSlug: r.guide_slug || guide?.slug || '',
      guideAvatarUrl: guide?.profile_photo_url || '',
      // 行程自身的評分（後台暖場初始值）優先；併入 reviews/socialProofQuotes 後由前台統一計算。
      ratingAvg: r.rating_avg ?? null,
      reviewCount: actReviews.length,
      reviews: actReviews,
      socialProofQuotes: Array.isArray(r.social_proof_quotes) ? r.social_proof_quotes : [],
    };
  });
}

export function buildCanonicalActivityDetailPath(activity = {}) {
  const slug = typeof activity.slug === 'string' ? activity.slug.trim() : '';
  if (!slug) return '/activities';

  const regionSlug = typeof activity.regionSlug === 'string' ? activity.regionSlug.trim() : '';
  const region = regionSlug || normalizeRegionForActivityPath(activity.region);
  return `/activities/${encodeURIComponent(region)}/${encodeURIComponent(slug)}`;
}

export function shouldRetryActivityDetailQuery(error) {
  const message = String(error?.message || '').toLowerCase();
  if (!message) return false;

  if (message.includes('column') && message.includes('does not exist')) return true;
  if (message.includes('relationship') && message.includes('activities') && message.includes('guide_profiles')) return true;

  return false;
}

function withActivityDetailTimeout(promise, { timeoutMs = 3500, label = 'activity-detail-query' } = {}) {
  const safeTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Number(timeoutMs) : 3500;
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`[${label}] timeout after ${safeTimeoutMs}ms`));
    }, safeTimeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

function isPrimaryActivityTimeoutError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('timeout after') && message.includes('activities-single');
}

function isPrimaryActivityNoRowError(error) {
  const message = String(error?.message || '').toLowerCase();

  if (error?.code === 'PGRST116') return true;

  return (
    message.includes('multiple (or no) rows returned') ||
    message.includes('no rows')
  );
}

function normalizeActivityDetailFormalPlan(plan) {
  if (!plan || typeof plan !== 'object') return null;

  const basePrice = Number(plan.base_price);
  const minParticipants = Number(plan.min_participants);
  const maxParticipants = Number(plan.max_participants);
  /** @type {'per_group' | 'per_person'} */
  const priceType = plan.price_type === 'per_group' ? 'per_group' : 'per_person';

  return {
    id: plan.id || plan.slug || plan.legacy_plan_id || null,
    slug: plan.slug || null,
    legacyPlanId: plan.legacy_plan_id || null,
    label: plan.name || plan.slug || plan.legacy_plan_id || '方案',
    duration: Number.isFinite(Number(plan.duration_minutes)) && Number(plan.duration_minutes) > 0
      ? `約 ${Math.round(Number(plan.duration_minutes) / 60)} 小時`
      : '依方案說明',
    priceType,
    basePrice: Number.isFinite(basePrice) && basePrice > 0 ? Math.trunc(basePrice) : undefined,
    minParticipants: Number.isFinite(minParticipants) && minParticipants > 0 ? Math.trunc(minParticipants) : undefined,
    maxParticipants: Number.isFinite(maxParticipants) && maxParticipants > 0 ? Math.trunc(maxParticipants) : undefined,
    highlights: Array.isArray(plan.highlights) ? plan.highlights.filter(Boolean) : [],
    detailsLinkText: plan.details_link_text || undefined,
    bookingBtnText: plan.booking_btn_text || undefined,
    language: plan.language || undefined,
    earliestDeparture: plan.earliest_departure || undefined,
    confirmByDays: Number.isFinite(Number(plan.confirm_by_days)) ? Math.trunc(Number(plan.confirm_by_days)) : undefined,
    freeCancelDays: Number.isFinite(Number(plan.free_cancel_days)) ? Math.trunc(Number(plan.free_cancel_days)) : undefined,
    planInclusions: Array.isArray(plan.plan_inclusions) ? plan.plan_inclusions.filter(Boolean) : [],
    planExclusions: Array.isArray(plan.plan_exclusions) ? plan.plan_exclusions.filter(Boolean) : [],
    planItinerary: Array.isArray(plan.plan_itinerary) ? plan.plan_itinerary : [],
    meetingPointName: plan.meeting_point_name || undefined,
    meetingAddress: plan.meeting_address || undefined,
    experiencePointName: plan.experience_point_name || undefined,
    experienceAddress: plan.experience_address || undefined,
    planNotices: Array.isArray(plan.plan_notices) ? plan.plan_notices.filter(Boolean) : [],
    planRefundRules: Array.isArray(plan.plan_refund_rules) ? plan.plan_refund_rules.filter(Boolean) : [],
    status: plan.status || null,
  };
}

export function selectPublicActivityDetailPlans({ formalPlans = [], legacyPlans = null } = {}) {
  const mappedFormalPlans = [];

  for (const rawPlan of formalPlans || []) {
    const normalizedPlan = normalizeActivityDetailFormalPlan(rawPlan);
    if (normalizedPlan?.id) {
      mappedFormalPlans.push(normalizedPlan);
    }
  }

  if (mappedFormalPlans.length > 0) {
    return mappedFormalPlans;
  }

  return null;
}

function buildActivityDetailFormalPlanIndex(plans = []) {
  const index = new Map();

  for (const plan of plans) {
    const canonicalId = String(plan?.id || '').trim();
    if (!canonicalId) continue;

    index.set(canonicalId, canonicalId);

    const slug = String(plan?.slug || '').trim();
    if (slug) index.set(slug, canonicalId);

    const legacyPlanId = String(plan?.legacyPlanId || '').trim();
    if (legacyPlanId) index.set(legacyPlanId, canonicalId);
  }

  return index;
}

function canonicalizeActivityDetailSchedulePlanId(rawPlanId, formalPlanIndex) {
  const candidate = String(rawPlanId || '').trim();
  if (!candidate) return null;

  return formalPlanIndex.get(candidate) || null;
}

function mapActivityDetailRow(act, schedules, reviews, guideProfileOverride = null, formalPlans = []) {
  const gp = guideProfileOverride || act?.guide_profiles || {};
  const selectedPlans = selectPublicActivityDetailPlans({
    formalPlans,
    legacyPlans: act?.plans || null,
  });
  const formalPlanIndex = buildActivityDetailFormalPlanIndex(formalPlans || []);

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
    plans: selectedPlans,
    status: act.status,
    ratingAvg: act.rating_avg ?? gp.rating_avg ?? null,
    reviewCount: act.review_count ?? gp.review_count ?? 0,
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
      planId: canonicalizeActivityDetailSchedulePlanId(s.plan_id, formalPlanIndex), minParticipants: s.min_participants || 1,
      guideNote: s.guide_note || null,
    })),
    reviews,
  };
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
      itinerary: a.itinerary || [], goodFor: a.goodFor || [],
      // 社群口碑語錄（結構化或舊純文字皆可）—— 前台會 normalize 後與真實評論整合呈現
      socialProofQuotes: a.socialProofQuotes || [],
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
        text: r.text, comment: r.text, date: r.date, photos: r.photos || []
      }))
    };
  }

  const supabase = await getSupabase();
  if (options.preferFixtureFirst) {
    const fixtureFirst = await getFixtureActivityBySlug(slug);
    if (fixtureFirst) return fixtureFirst;
  }

  const minimalSelect = `
      id, slug, title, tagline, short_description, description, region, region_slug, category,
      price_twd, duration_minutes, min_participants, max_participants,
      meeting_point, meeting_point_map_url, cover_image_url, image_urls,
      inclusions, exclusions, notices, refund_rules, refund_policy_type,
      safety_notice, faq, good_for, not_good_for, plans, status, published_at,
      itinerary, social_proof_quotes,
      rating_avg, review_count,
      guide_id, guide_slug
    `;

  const retryMinimalSelect = `
      id, slug, title, tagline, short_description, description, region, region_slug, category,
      price_twd, duration_minutes, min_participants, max_participants,
      meeting_point, meeting_point_map_url, cover_image_url, image_urls,
      inclusions, exclusions, notices, refund_rules,
      safety_notice, faq, status,
      guide_id, guide_slug
    `;

  const queryTimeoutMs = Number(options.queryTimeoutMs || 3500);

  let act = null;
  let error = null;
  const requirePrimaryResult = options.required !== false;
  let primaryQueryTimedOut = false;
  try {
    const result = await withActivityDetailTimeout(
      supabase
        .from('activities')
        .select(minimalSelect)
        .eq('slug', slug)
        .single(),
      { timeoutMs: queryTimeoutMs, label: 'activities-single' }
    );
    act = result?.data || null;
    error = result?.error || null;
  } catch (e) {
    error = e;
    primaryQueryTimedOut = isPrimaryActivityTimeoutError(e);
  }

  if ((!act || error) && shouldRetryActivityDetailQuery(error)) {
    const retryRes = await withActivityDetailTimeout(
      supabase
        .from('activities')
        .select(retryMinimalSelect)
        .eq('slug', slug)
        .single(),
      { timeoutMs: queryTimeoutMs, label: 'activities-single-retry' }
    );

    act = retryRes.data;
    error = retryRes.error;
  }

  // GH-1332: archived activities must be invisible on every traveler-facing
  // surface. The listing path already filters status='published'; this is
  // the single detail gateway behind /api/activities/[slug] and the
  // activity pages, so one guard here covers both the primary and the
  // retry query above. Guard instead of `.neq('status','archived')` in the
  // queries because `.single()` + `.neq` reports PGRST116 and would depend
  // on the error-path classification below.
  if (act && String(act.status).toLowerCase() === 'archived') {
    return null;
  }

  if (error || !act) {
    if (primaryQueryTimedOut && requirePrimaryResult) {
      const timeoutMessage =
        error instanceof Error
          ? error.message
          : 'activities-single query timed out while loading activity detail';
      throw new Error(timeoutMessage);
    }

    const shouldFallbackToFixture =
      shouldRetryActivityDetailQuery(error) && !isPrimaryActivityNoRowError(error);
    if (requirePrimaryResult && error && !shouldFallbackToFixture && !isPrimaryActivityNoRowError(error)) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`activity lookup failed: ${String(error?.message || error)}`);
    }

    if (shouldFallbackToFixture) {
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
              photos: r.photos || [],
            })),
          };
        }
      } catch {}
    }

    return null;
  }

  let guideProfile = act?.guide_profiles || null;
  if (!guideProfile && act?.guide_id) {
    const { data: gp } = await withActivityDetailTimeout(
      supabase
        .from('guide_profiles')
        .select('id, slug, display_name, headline, bio, region, languages, specialties, profile_photo_url, rating_avg, review_count, gallery_urls, verification_status')
        .eq('id', act.guide_id)
        .maybeSingle(),
      { timeoutMs: queryTimeoutMs, label: 'guide-profile' }
    ).catch(() => ({ data: null, error: null }));
    guideProfile = gp || null;
  }
  // 下架（停權）導遊的行程詳情一併隱藏：成功讀到導遊且其非 approved →
  // 整筆行程回 null（404）。讀取失敗（guideProfile 為 null）時 fail-open，
  // 不因暫時性 DB 問題誤藏有效行程。
  if (guideProfile && guideProfile.verification_status && guideProfile.verification_status !== 'approved') {
    return null;
  }

  const [scheduleRes, reviewsRes, formalPlansRes] = await Promise.all([
    withActivityDetailTimeout(
      supabase
        .from('activity_schedules')
        .select('id, start_at, end_at, capacity, booked_count, status, plan_id, min_participants, guide_note')
        .eq('activity_id', act.id)
        .in('status', ['open', 'full'])
        .order('start_at', { ascending: true }),
      { timeoutMs: queryTimeoutMs, label: 'activity-schedules' }
    ).catch(() => ({ data: [], error: null })),
    (async () => {
      try {
        const reviewSelect = 'id, author, city, rating, review_text, review_date, is_verified, photo_urls';
        let { data: dbReviews, error: reviewErr } = await withActivityDetailTimeout(
          supabase
            .from('activity_reviews')
            .select(reviewSelect)
            .eq('activity_slug', act.slug)
            .eq('status', 'approved')
            .order('review_date', { ascending: false })
            .limit(20),
          { timeoutMs: queryTimeoutMs, label: 'activity-reviews' }
        );
        // schema-drift guard：photo_urls 欄位若尚未 migrate（42703）→ 退回不含照片的 select。
        if (reviewErr && (reviewErr.code === '42703' || /column .*does not exist/i.test(reviewErr.message || ''))) {
          ({ data: dbReviews, error: reviewErr } = await withActivityDetailTimeout(
            supabase
              .from('activity_reviews')
              .select('id, author, city, rating, review_text, review_date, is_verified')
              .eq('activity_slug', act.slug)
              .eq('status', 'approved')
              .order('review_date', { ascending: false })
              .limit(20),
            { timeoutMs: queryTimeoutMs, label: 'activity-reviews-retry' }
          ));
        }
        if (!reviewErr && dbReviews && dbReviews.length > 0) {
          return dbReviews.map(r => ({
            id: r.id, author: r.author, city: r.city, rating: r.rating,
            text: r.review_text, date: r.review_date, isVerified: r.is_verified,
            photos: Array.isArray(r.photo_urls) ? r.photo_urls : []
          }));
        }
      } catch {}
      try {
        const { getReviewsByActivity } = await import('../fixtures/data');
        const fixtureReviews = getReviewsByActivity ? getReviewsByActivity(act.slug) : [];
        return (fixtureReviews || []).slice(0, 20).map(r => ({
          id: r.id, author: r.author, city: r.city, rating: r.rating,
          text: r.text, date: r.date, photos: r.photos || []
        }));
      } catch {
        return [];
      }
    })(),
    (async () => {
      try {
        const plansQuery = supabase.from('activity_plans');
        if (!plansQuery || typeof plansQuery.select !== 'function') {
          return { data: [], error: null };
        }

        const richResult = await withActivityDetailTimeout(
          plansQuery
            .select(`
              id, slug, legacy_plan_id, name, duration_minutes, price_type, base_price,
              min_participants, max_participants,
              details_link_text, booking_btn_text, highlights,
              language, earliest_departure, confirm_by_days, free_cancel_days,
              plan_inclusions, plan_exclusions, plan_itinerary,
              meeting_point_name, meeting_address,
              experience_point_name, experience_address,
              plan_notices, plan_refund_rules,
              status
            `)
            .eq('activity_id', act.id)
            .order('created_at', { ascending: true }),
          { timeoutMs: queryTimeoutMs, label: 'activity-plans' }
        );

        if (!richResult?.error) {
          return richResult;
        }

        const retryResult = await withActivityDetailTimeout(
          supabase
            .from('activity_plans')
            .select(`
              id, slug, legacy_plan_id, name, duration_minutes, price_type, base_price,
              min_participants, max_participants,
              details_link_text, booking_btn_text, highlights,
              language, earliest_departure, confirm_by_days, free_cancel_days,
              status
            `)
            .eq('activity_id', act.id)
            .order('created_at', { ascending: true }),
          { timeoutMs: queryTimeoutMs, label: 'activity-plans-retry' }
        );

        if (!retryResult?.error) {
          return retryResult;
        }

        return await withActivityDetailTimeout(
          supabase
            .from('activity_plans')
            .select(`
              id, slug, legacy_plan_id, name, duration_minutes, price_type, base_price,
              min_participants, max_participants,
              status
            `)
            .eq('activity_id', act.id)
            .order('created_at', { ascending: true }),
          { timeoutMs: queryTimeoutMs, label: 'activity-plans-minimal' }
        );
      } catch {
        return { data: [], error: null };
      }
    })(),
  ]);

  const schedules = scheduleRes.data || [];

  const reviews = reviewsRes || [];
  const rawFormalPlans = formalPlansRes.data || [];
  const formalPlans = rawFormalPlans.filter((plan) => {
    const status = plan?.status;
    return status === null || status === undefined || status === 'active';
  });

  return mapActivityDetailRow(act, schedules, reviews, guideProfile, formalPlans);
}

/**
 * 輕量查詢：只取某行程的相片集（image_urls）欄位，供首頁編輯精選大卡輪播用。
 * 首頁原本呼叫 getActivityBySlugDb（連帶撈 guide_profiles／schedules／reviews／plans，
 * 約 4 個序列 round-trip）只為了拿相片集——那是首頁渲染 critical path 的主要延遲來源。
 * 評分（reviews/ratingAvg/quotes）改由 catalog（listPublishedActivitiesDb）直接取得，
 * 相片集則用本函式單一查詢，渲染從 ~6-7 個序列查詢降到 catalog + 1。
 * @param {string} slug
 * @returns {Promise<string[]>} 相片集 URL 陣列（查無/未發布 → 空陣列）
 */
export async function getActivityGalleryBySlugDb(slug) {
  const s = String(slug || '').trim();
  if (!s) return [];
  if (!hasSupabaseEnv()) {
    const { activities } = await import('../fixtures/data').catch(() => ({ activities: [] }));
    const a = (activities || []).find((x) => x.slug === s);
    return a && Array.isArray(a.galleryUrls) ? a.galleryUrls : [];
  }

  const supabase = await getSupabase();
  const { data } = await supabase
    .from('activities')
    .select('image_urls')
    .eq('slug', s)
    .eq('status', 'published')
    .maybeSingle();
  return data && Array.isArray(data.image_urls) ? data.image_urls : [];
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
  const baseSelect = 'id, slug, display_name, headline, bio, region, languages, specialties, profile_photo_url, hero_image_url, gallery_urls, rating_avg, review_count, service_count, verification_status';
  const richSelect = `${baseSelect}, is_published`;
  // 認識導遊只顯示導遊自己「公開」的檔案。schema drift guard：production
  // 若尚未跑 20260611_guide_profiles_is_published，欄位不存在會 42703 —
  // 退回僅以 verification_status 過濾的舊行為，避免整批導遊消失。
  const buildQuery = (withPublishFilter) => {
    let q = supabase
      .from('guide_profiles')
      .select(withPublishFilter ? richSelect : baseSelect)
      .eq('verification_status', 'approved');
    if (withPublishFilter) q = q.eq('is_published', true);
    return q.order('display_name');
  };
  let { data, error } = await buildQuery(true);
  if (error && (error.code === '42703' || /column .*does not exist/i.test(error.message || ''))) {
    ({ data, error } = await buildQuery(false));
  }

  if (error) throw new Error(error.message);
  return (data || []).map(g => ({
    id: g.id, slug: g.slug, displayName: g.display_name,
    headline: g.headline, shortBio: g.bio, region: g.region,
    languages: g.languages || [], specialties: g.specialties || [],
    profilePhotoUrl: g.profile_photo_url, heroImageUrl: g.hero_image_url,
    galleryUrls: g.gallery_urls || [],
    ratingAvg: g.rating_avg, reviewCount: g.review_count, serviceCount: g.service_count,
    verificationStatus: g.verification_status,
    isPublished: g.is_published ?? true
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
      regions: g.regions || (g.region ? [g.region] : []),
      certifications: g.certifications || [],
      paymentMethods: g.paymentMethods || [],
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
        text: r.text, comment: r.text, date: r.date, photos: r.photos || []
      }))
    };
  }

  const supabase = await getSupabase();
  // guide_profiles 與 activities 都只用 slug 過濾、彼此不相依（activities 是
  // .eq('guide_slug', slug)，不需要先拿到 guide id），故平行發兩個查詢，把
  // 2 個串行 round-trip 併成 1 個 —— 這是詳情頁 ISR cache-miss 首訪的延遲來源。
  // 導遊無效（找不到/停權）時 acts 直接丟棄，成本可忽略。
  const baseGuideSelect = 'id, slug, display_name, headline, bio, region, languages, specialties, profile_photo_url, hero_image_url, gallery_urls, rating_avg, review_count, service_count, verification_status';
  const richGuideSelect = `${baseGuideSelect}, regions, certifications, payment_methods`;
  const [gpResult, actsResult] = await Promise.all([
    supabase
      .from('guide_profiles')
      .select(richGuideSelect)
      .eq('slug', slug)
      .single(),
    supabase
      .from('activities')
      .select('id, slug, title, category, region, price_twd, cover_image_url, status')
      .eq('guide_slug', slug)
      .eq('status', 'published'),
  ]);

  let { data: gp, error } = gpResult;
  // Schema drift guard：熟悉區域等欄位（20260623）未 migrate 時退回 base，公開頁不致 404。
  if (error && (error.code === '42703' || /column .*does not exist/i.test(error.message || ''))) {
    ({ data: gp, error } = await supabase
      .from('guide_profiles')
      .select(baseGuideSelect)
      .eq('slug', slug)
      .single());
  }
  if (error || !gp) return null;
  // 下架（停權）導遊對外全隱藏：非 approved（即 suspended）→ 詳情頁 404。
  // approved-但未公開（is_published=false）仍可預覽，不在此擋。
  if (gp.verification_status !== 'approved') return null;

  const acts = actsResult.data;

  return {
    id: gp.id, slug: gp.slug, displayName: gp.display_name,
    headline: gp.headline, bio: gp.bio, region: gp.region,
    regions: Array.isArray(gp.regions) && gp.regions.length ? gp.regions : (gp.region ? [gp.region] : []),
    certifications: Array.isArray(gp.certifications) ? gp.certifications : [],
    paymentMethods: Array.isArray(gp.payment_methods) ? gp.payment_methods : [],
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
// 導遊商店頁聚合（Guide Shop，#1475）
// ---------------------------------------------------------------

/**
 * 回傳導遊商店頁所需資料：導遊公開資訊 + 各（已發佈）行程的 active 方案，依地區分組。
 * 不含任何不公開匯款資訊。沒有任何 active 方案的行程會被略過。
 *
 * 效能（#1475）：Supabase 路徑用「批次」查詢避免 N+1 —— 早期版本對每個行程各打一次
 * getActivityBySlugDb（內含 activity + activity_plans + schedules/reviews 多次 round-trip），
 * 6 個行程 → 商店頁載入 4–6s。改為 1 次 activities + 1 次 activity_plans（並行）。
 * in-memory fallback（無 Supabase）資料量小，沿用逐行程 getActivityBySlugDb。
 */
export async function getGuideShopDb(slug) {
  // in-memory / fixture：沿用逐行程（無網路、資料量小）。
  if (!hasSupabaseEnv()) {
    const guide = await getGuideBySlugDb(slug);
    if (!guide) return null;
    const details = [];
    for (const a of guide.activities || []) {
      if (a.status && a.status !== 'published') continue;
      let detail = null;
      try {
        detail = await getActivityBySlugDb(a.slug, { required: false });
      } catch {
        detail = null;
      }
      details.push({
        summary: {
          id: a.id, slug: a.slug, title: a.title, region: a.region,
          regionSlug: detail?.regionSlug || a.regionSlug || null,
          status: a.status || 'published',
        },
        plans: detail?.plans || [],
      });
    }
    return buildGuideShopView(guide, details);
  }

  // Supabase：把 guide 與 activities+plans 兩個查詢「並行」發出（Promise.all），
  // 牆鐘只剩 1 個 round-trip —— 先前是 await getGuideBySlugDb 之後才查 activities（兩段
  // 序列），這正是冷啟動偏久的主因。activities 用 PostgREST 內嵌關聯一次取回方案；
  // embed 不可用時退回兩段式（safe fallback）。
  const supabase = await getSupabase();
  const PLAN_COLS = 'activity_id, id, slug, legacy_plan_id, name, duration_minutes, price_type, base_price, min_participants, max_participants, status';

  const [guide, embedRes] = await Promise.all([
    getGuideBySlugDb(slug),
    supabase
      .from('activities')
      .select(`id, slug, title, region, region_slug, plans, status, activity_plans(${PLAN_COLS})`)
      .eq('guide_slug', slug)
      .eq('status', 'published'),
  ]);
  if (!guide) return null;

  let acts = null;
  if (!embedRes.error) {
    acts = embedRes.data || [];
  } else {
    // Fallback：embed 失敗時退回 activities + activity_plans 兩段式。
    const a2 = await supabase
      .from('activities')
      .select('id, slug, title, region, region_slug, plans, status')
      .eq('guide_slug', slug)
      .eq('status', 'published');
    acts = a2.data || [];
    const ids = acts.map((a) => a.id);
    const p2 = ids.length
      ? await supabase.from('activity_plans').select(PLAN_COLS).in('activity_id', ids)
      : { data: [] };
    const byAct = {};
    for (const p of p2.data || []) (byAct[p.activity_id] ||= []).push(p);
    acts = acts.map((a) => ({ ...a, activity_plans: byAct[a.id] || [] }));
  }

  const details = (acts || []).map((a) => {
    const formal = (a.activity_plans || []).filter((p) => {
      const st = p?.status;
      return st === null || st === undefined || st === 'active';
    });
    return {
      summary: {
        id: a.id, slug: a.slug, title: a.title, region: a.region,
        regionSlug: a.region_slug || null, status: a.status || 'published',
      },
      plans: selectPublicActivityDetailPlans({ formalPlans: formal, legacyPlans: a.plans || null }) || [],
    };
  });

  // 純函式做過濾／投影／分組（單測見 tests/api/issue1475-guide-shop.test.mjs）。
  return buildGuideShopView(guide, details);
}

/**
 * 取得某筆預約對應導遊的不公開匯款資訊（#1475）。
 * 僅供付款步驟使用——回傳 order 狀態與下單者 email 供路由層做「本人 + pending_payment」授權，
 * db 層不做授權判斷（與既有 gateway 慣例一致）。找不到 booking 回 null。
 * in-memory fallback 無真實匯款資料，回傳 null（fixture 模式不揭露）。
 */
export async function getGuideTransferInfoForBookingDb(bookingId) {
  if (!hasSupabaseEnv() || !bookingId) return null;
  const supabase = await getSupabase();
  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select('id, guide_id, order_id')
    .eq('id', bookingId)
    .maybeSingle();
  if (bErr) throw new Error(bErr.message);
  if (!booking || !booking.order_id) return null;

  const [{ data: order, error: oErr }, { data: gp, error: gErr }] = await Promise.all([
    supabase.from('orders').select('id, status, contact_email').eq('id', booking.order_id).maybeSingle(),
    booking.guide_id
      ? supabase
          .from('guide_profiles')
          .select('display_name, bank_name, account_name, account_number, transfer_note')
          .eq('id', booking.guide_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (oErr) throw new Error(oErr.message);
  if (gErr) throw new Error(gErr.message);
  if (!order) return null;

  return {
    orderStatus: order.status,
    contactEmail: order.contact_email ?? null,
    guideName: gp?.display_name ?? null,
    bankName: gp?.bank_name ?? null,
    accountName: gp?.account_name ?? null,
    accountNumber: gp?.account_number ?? null,
    transferNote: gp?.transfer_note ?? null,
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
  if (input.socialProofQuotes !== undefined) {
    // 結構化 {author,rating,text}[]（舊純文字陣列也相容，normalize 會升級為物件）
    patch.social_proof_quotes = normalizeSocialProofQuotes(input.socialProofQuotes);
  }

  // 評論數／評分自動對齊「真實已核准評論」（移除 admin 手填初始評論數）。
  // 社群口碑語錄（暖場）只在前台頁面整合呈現，不進 review_count/rating_avg —
  // 後者供 Google 結構化資料與列表評分使用，須保持真實，避免假評價（#1378 準則）。
  // 任一查詢失敗都 fail-soft，不阻擋本次儲存。
  try {
    const ratingBlank =
      input.ratingAvg === undefined || input.ratingAvg === null || !(Number(input.ratingAvg) > 0);
    const { data: current } = await supabase
      .from('activities')
      .select('slug')
      .eq('id', id)
      .single();
    const slug = current?.slug;
    let approvedRatings = [];
    if (slug) {
      const { data: approved } = await supabase
        .from('activity_reviews')
        .select('rating')
        .eq('activity_slug', slug)
        .eq('status', 'approved');
      approvedRatings = (approved || [])
        .map((r) => Number(r.rating))
        .filter((n) => Number.isFinite(n));
    }
    // 評論數 = 真實已核准評論數（不含暖場口碑語錄）
    patch.review_count = approvedRatings.length;
    // 初始評分留空時，自動以真實評論星數平均回填（無真實評論則 null）
    if (ratingBlank) {
      patch.rating_avg =
        approvedRatings.length > 0
          ? Number((approvedRatings.reduce((s, n) => s + n, 0) / approvedRatings.length).toFixed(2))
          : null;
    }
  } catch {
    // fail-soft：對齊失敗不阻擋儲存
  }

  // Re-resolve guide_id if guideSlug changed
  if (input.guideSlug) {
    const { data: gp } = await supabase
      .from('guide_profiles').select('id').eq('slug', input.guideSlug).single();
    if (gp) patch.guide_id = gp.id;
  }

  const { error } = await supabase.from('activities').update(patch).eq('id', id);
  if (error) throw new Error(error.message);

  if (input.plans !== undefined) {
    await syncImportedActivityPlansDb(supabase, id, input.plans);
  }

  return getAdminActivityByIdDb(id);
}

async function syncImportedActivityPlansDb(supabase, activityId, legacyPlans) {
  const { data: existingRows, error: existingError } = await supabase
    .from('activity_plans')
    .select('id, slug')
    .eq('activity_id', activityId);
  if (existingError) throw new Error(existingError.message);

  const existingBySlug = new Map((existingRows || []).map((row) => [row.slug, row]));
  const { upserts, skipped } = buildFormalPlanBackfillRows({
    activityId,
    legacyPlans,
    existingBySlug,
  });

  if (skipped.length > 0) {
    console.warn('[admin-activity-import] skipped invalid legacy plans while syncing activity_plans', {
      activityId,
      skipped,
    });
  }

  if (upserts.length === 0) return;

  // Issue #904: production activity_plans may lag behind the rich-fields migration.
  // Strip any missing rich column from every row and retry so the JSON-import path
  // still creates the basic formal plans instead of throwing "Failed to create plan".
  const { error, droppedColumns } = await applyUpsertWithMissingColumnFallback(
    (rows) => supabase.from('activity_plans').upsert(rows, { onConflict: 'activity_id,slug' }),
    upserts,
  );
  if (error) throw new Error(error.message);

  if (droppedColumns.length > 0) {
    console.warn('[admin-activity-import] dropped rich columns missing from schema while syncing activity_plans', {
      activityId,
      droppedColumns,
    });
  }
}

export async function updateActivityStatusDb(id, status) {
  if (!hasSupabaseEnv()) throw new Error('Supabase not configured');

  const validStatuses = ['draft', 'published', 'archived'];
  if (!validStatuses.includes(status)) throw new Error('invalid status');

  const supabase = await getSupabase();

  // ── Issue #881: Booking readiness gate before publishing ─────────────────
  if (status === 'published') {
    const { validateActivityBookability } = await import('./booking-readiness/validate-activity-bookability.mjs');
    const check = await validateActivityBookability(id, { supabase });
    if (!check.ok) {
      const err = new Error('BOOKING_READINESS_FAILED');
      err.code = 'BOOKING_READINESS_FAILED';
      err.details = check.blockers;
      throw err;
    }
  }

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

/**
 * Check if a given capacity is compatible with the plan's max_participants.
 * Returns { ok: true } or { ok: false, blocker: { code, messageZh } }
 *
 * - If planId provided → look up that specific plan's max_participants.
 * - If planId null → query active plans for activityId.
 *   - If exactly 1 active plan → use its max_participants.
 *   - If 0 or 2+ active plans → return { ok: true } (don't block — readiness gate handles ambiguity).
 * - If capacity > plan.max_participants → return { ok: false }.
 *
 * Issue #891 — guard for admin schedule create/update write path.
 */
export async function validateScheduleCapacityAgainstPlan({ supabase, activityId, planId, capacity }) {
  const cap = Number(capacity);
  if (!Number.isFinite(cap) || cap <= 0) return { ok: true }; // let DB constraints handle bad values

  let maxParticipants = null;

  if (planId) {
    // Specific plan provided — look it up directly
    const { data, error } = await supabase
      .from('activity_plans')
      .select('max_participants')
      .eq('id', planId)
      .maybeSingle();
    if (error || !data) return { ok: true }; // plan not found → don't block
    maxParticipants = Number(data.max_participants);
  } else if (activityId) {
    // No planId — look for active plans for this activity
    const { data, error } = await supabase
      .from('activity_plans')
      .select('max_participants')
      .eq('activity_id', activityId)
      .eq('status', 'active');
    if (error || !data) return { ok: true }; // DB error → don't block
    if (data.length !== 1) return { ok: true }; // 0 or 2+ active plans → don't block
    maxParticipants = Number(data[0].max_participants);
  } else {
    return { ok: true }; // no context to check
  }

  if (!Number.isFinite(maxParticipants) || maxParticipants <= 0) return { ok: true };

  if (cap > maxParticipants) {
    return {
      ok: false,
      blocker: {
        code: 'SCHEDULE_CAPACITY_EXCEEDS_PLAN',
        messageZh: `場次人數上限（${cap}）超過方案上限（${maxParticipants}）`,
      },
    };
  }

  return { ok: true };
}

export async function createScheduleDb(input = {}) {
  if (!hasSupabaseEnv()) throw new Error('Supabase not configured');
  const { activityId, startAt, endAt, capacity = 10, status = 'open', planId = null, minParticipants = 1, guideNote = null } = input;
  if (!activityId) throw new Error('activityId is required');
  if (!startAt)    throw new Error('startAt is required');
  if (!endAt)      throw new Error('endAt is required');

  const supabase = await getSupabase();

  if (input.capacity !== undefined) {
    const check = await validateScheduleCapacityAgainstPlan({
      supabase,
      activityId,
      planId: planId ?? null,
      capacity: input.capacity,
    });
    if (!check.ok) {
      const err = new Error(`SCHEDULE_CAPACITY_EXCEEDS_PLAN: ${check.blocker.messageZh}`);
      err.code = 'SCHEDULE_CAPACITY_EXCEEDS_PLAN';
      err.messageZh = check.blocker.messageZh;
      throw err;
    }
  }

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

  if (input.capacity !== undefined) {
    // For updates we need activityId — fetch it from the existing schedule row
    let activityId = null;
    let existingPlanId = null;
    const { data: existing } = await supabase
      .from('activity_schedules')
      .select('activity_id, plan_id')
      .eq('id', id)
      .maybeSingle();
    if (existing) {
      activityId = existing.activity_id;
      existingPlanId = existing.plan_id || null;
    }

    // planId in input takes precedence over existing plan_id
    const planIdToCheck = input.planId !== undefined ? (input.planId || null) : existingPlanId;

    const check = await validateScheduleCapacityAgainstPlan({
      supabase,
      activityId,
      planId: planIdToCheck,
      capacity: input.capacity,
    });
    if (!check.ok) {
      const err = new Error(`SCHEDULE_CAPACITY_EXCEEDS_PLAN: ${check.blocker.messageZh}`);
      err.code = 'SCHEDULE_CAPACITY_EXCEEDS_PLAN';
      err.messageZh = check.blocker.messageZh;
      throw err;
    }
  }

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

  // 1. 取得行程資料（slug + region + 圖片 URLs）
  const { data: act } = await supabase
    .from('activities')
    .select('id, slug, region, region_slug, cover_image_url, image_urls')
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

  // 回傳 slug/region/regionSlug 讓呼叫端能精準 revalidate 該行程詳情頁（#1440）。
  return {
    deleted: true,
    id,
    slug: act.slug,
    region: act.region,
    regionSlug: act.region_slug,
    imagesDeleted: pathsToDelete.length,
  };
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
      .select('id, title, slug, price_twd, cover_image_url, region, region_slug')
      .in('id', activityIds);

    if (activityByIdError) throw new Error(activityByIdError.message);
    activityByIdMap = new Map((activitiesById || []).map((a) => [a.id, a]));
  }

  if (activitySlugs.length > 0) {
    const { data: activitiesBySlug, error: activityBySlugError } = await supabase
      .from('activities')
      .select('id, title, slug, price_twd, cover_image_url, region, region_slug')
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
      // region/regionSlug 供 UI 組 canonical 詳情頁連結 /activities/<region>/<slug>
      // （少了 region 會經 [region] 相容頁多一次查詢 + 轉址，點擊載入過久）。
      region: activity?.region || null,
      regionSlug: activity?.region_slug || null,
    };
  });
}

/**
 * 列出某旅客自己提過的所有 activity_qa（不限狀態），附行程／導遊標題與連結。
 * 供 /me/qa「問答回覆」收件匣使用。映射邏輯抽到純函式 mapMyQaRows（離線可測）。
 * 無 Supabase env（本地/測試）→ 回空陣列（route 不致 crash；UI 由 E2E mock 覆蓋）。
 * @param {{ userId: string }} input
 * @returns {Promise<Array<object>>}
 */
export async function listMyQaDb(input) {
  const userId = String(input?.userId || '').trim();
  if (!userId) throw new Error('userId is required');
  if (!hasSupabaseEnv()) return [];

  const { mapMyQaRows } = await import('./my-qa.mjs');
  const supabase = await getSupabase();

  const { data: rows, error } = await supabase
    .from('activity_qa')
    .select('id, activity_id, question, answer, status, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);

  const refs = [...new Set((rows || []).map((r) => String(r.activity_id || '').trim()).filter(Boolean))];
  const guideIds = refs.filter((r) => r.startsWith('guide:')).map((r) => r.slice('guide:'.length)).filter(Boolean);
  const activityRefs = refs.filter((r) => !r.startsWith('guide:'));

  const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const activityIds = activityRefs.filter((r) => uuidLike.test(r));
  const activitySlugs = activityRefs.filter((r) => !uuidLike.test(r));

  // region/region_slug 一併取出：mapMyQaRows 需要 region segment 才能組出
  // canonical 詳情頁連結 /activities/<region>/<slug>（避免 [region] 相容轉址）。
  // 三組查詢（依 id 的行程／依 slug 的行程／導遊）彼此獨立 → 並行，省掉序列等待。
  const toQaActivity = (a) => ({ id: a.id, title: a.title, slug: a.slug, region: a.region, regionSlug: a.region_slug });
  const [byIdRes, bySlugRes, guideRes] = await Promise.all([
    activityIds.length > 0
      ? supabase.from('activities').select('id, title, slug, region, region_slug').in('id', activityIds)
      : Promise.resolve({ data: [] }),
    activitySlugs.length > 0
      ? supabase.from('activities').select('id, title, slug, region, region_slug').in('slug', activitySlugs)
      : Promise.resolve({ data: [] }),
    guideIds.length > 0
      ? supabase.from('guide_profiles').select('id, slug, display_name').in('id', guideIds)
      : Promise.resolve({ data: [] }),
  ]);

  const activityById = new Map();
  for (const a of byIdRes.data || []) activityById.set(a.id, toQaActivity(a));
  // sentinel ref 是 slug 時，map key 用 slug 對回
  for (const a of bySlugRes.data || []) activityById.set(a.slug, toQaActivity(a));

  const guideById = new Map();
  for (const g of guideRes.data || []) guideById.set(g.id, g);

  return mapMyQaRows(rows, { activityById, guideById });
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

/**
 * #1365 缺口 2 — admin 出款管理手動操作 fallback。
 * List all guide balances > 0 (including below-threshold guides) with
 * profile info and a has_pending_payout flag so the admin UI can show the
 * settlement queue and block duplicate manual payout generation.
 * @param {any} supabase — service-role Supabase client
 * @returns {Promise<Array<{ guide_id, balance_twd, last_settled_at, display_name, email, has_pending_payout }>>}
 */
export async function listGuideBalancesWithProfilesDb(supabase) {
  const { data: balances, error } = await supabase
    .from('guide_balances')
    .select('guide_id, balance_twd, last_settled_at, updated_at')
    .gt('balance_twd', 0)
    .order('balance_twd', { ascending: false });
  if (error) throw new Error(error.message);
  if (!balances || balances.length === 0) return [];

  const guideIds = balances.map((b) => b.guide_id);

  const { data: profiles } = await supabase
    .from('guide_profiles')
    .select('id, display_name, guide_email')
    .in('id', guideIds);
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const { data: pendings } = await supabase
    .from('payouts')
    .select('guide_id')
    .eq('state', 'pending')
    .in('guide_id', guideIds);
  const pendingGuideIds = new Set((pendings ?? []).map((p) => p.guide_id));

  return balances.map((b) => {
    const profile = profileById.get(b.guide_id);
    return {
      guide_id: b.guide_id,
      balance_twd: b.balance_twd,
      last_settled_at: b.last_settled_at ?? null,
      updated_at: b.updated_at ?? null,
      display_name: profile?.display_name ?? null,
      email: profile?.guide_email ?? null,
      has_pending_payout: pendingGuideIds.has(b.guide_id),
    };
  });
}

/**
 * #1365 缺口 2 — manually create a pending payout from a guide's current
 * balance (admin fallback while the settlement cron is not scheduled).
 * Reuses createPayoutDb so the pending-uniqueness guard stays the single
 * source of idempotency. Writes an audit log only when a payout is created.
 * @param {any} supabase — service-role Supabase client
 * @param {{ guideId: string, actor?: string }} input
 * @returns {Promise<{ skipped: boolean, id: string, [key: string]: any }>}
 */
export async function generateManualPayoutDb(supabase, { guideId, actor = 'admin' } = {}) {
  if (!guideId) throw new Error('guideId is required');

  const { data: balance } = await supabase
    .from('guide_balances')
    .select('balance_twd')
    .eq('guide_id', guideId)
    .maybeSingle();
  const balanceTwd = Number(balance?.balance_twd ?? 0);
  if (balanceTwd <= 0) throw new Error('guide balance is empty — nothing to pay out');

  const result = await createPayoutDb(supabase, guideId, balanceTwd);
  if (result.skipped) return result;

  await supabase
    .from('audit_logs')
    .insert({
      actor,
      action: 'payout_manually_generated',
      metadata: {
        payout_id: result.id,
        guide_id: guideId,
        total_twd: balanceTwd,
        source: 'admin_manual_fallback',
      },
    });

  return result;
}

/**
 * #1365 缺口 2 — cancel a pending payout (pending → cancelled).
 * The guide balance is NOT debited: cancelling releases the pending
 * uniqueness slot so a corrected payout can be generated later.
 * @param {any} supabase — service-role Supabase client
 * @param {string} payoutId
 * @param {string|null} cancelledBy — admin identifier
 * @param {string|null} reason — optional operator note (audit only)
 * @returns {Promise<object>} updated payout row
 */
export async function cancelPayoutDb(supabase, payoutId, cancelledBy, reason) {
  const { data: payout, error: fetchErr } = await supabase
    .from('payouts')
    .select('*')
    .eq('id', payoutId)
    .single();
  if (fetchErr || !payout) throw new Error('payout not found');
  if (payout.state !== 'pending') throw new Error(`payout already ${payout.state}`);

  const { data: updated, error: updateErr } = await supabase
    .from('payouts')
    .update({ state: 'cancelled' })
    .eq('id', payoutId)
    .select()
    .single();
  if (updateErr) throw updateErr;

  await supabase
    .from('audit_logs')
    .insert({
      actor: cancelledBy ?? 'admin',
      action: 'payout_cancelled',
      metadata: {
        payout_id: payoutId,
        guide_id: payout.guide_id,
        total_twd: payout.total_twd,
        cancelled_by: cancelledBy ?? 'admin',
        reason: reason ?? null,
      },
    });

  return updated;
}

export async function recordRefundReversalDb(supabase, { orderId, actor = 'system' }) {
  const normalizeError = (err) => {
    if (!err) return new Error('database error');
    if (err instanceof Error) return err;
    return new Error(err.message ?? JSON.stringify(err));
  };

  const normalizeNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const readLog = async (action, reversalId) => {
    const query = supabase.from('audit_logs');
    if (!query || typeof query.select !== 'function') {
      return null;
    }

    let chain = query.select('id,metadata');
    if (typeof chain.eq !== 'function') {
      return null;
    }

    chain = chain.eq('action', action);
    if (typeof chain.eq !== 'function') {
      return null;
    }

    chain = chain.eq('metadata->>order_id', orderId);
    if (typeof chain.eq !== 'function') {
      return null;
    }

    chain = chain.eq('metadata->>reversal_id', reversalId);
    if (typeof chain.maybeSingle !== 'function') {
      return null;
    }

    const { data, error } = await chain.maybeSingle();

    if (error) throw normalizeError(error);
    return data || null;
  };

  // Check if this order was already settled
  const { data: settlement, error: settlementErr } = await supabase
    .from('payout_items')
    .select('*')
    .eq('order_id', orderId)
    .eq('settlement_kind', 'settlement')
    .maybeSingle();

  if (settlementErr) throw normalizeError(settlementErr);
  if (!settlement) return { skipped: 'pre_settlement' };

  const settledAt = new Date().toISOString();

  // Insert reversal row (idempotent via UNIQUE(order_id, settlement_kind))
  const reversalRow = {
    order_id: orderId,
    guide_id: settlement.guide_id,
    gmv_twd: -settlement.gmv_twd,
    commission_twd: -settlement.commission_twd,
    net_twd: -settlement.net_twd,
    rules_version: settlement.rules_version,
    settlement_kind: 'reversal',
    settled_at: settledAt,
  };

  const { data: reversal, error: insertErr } = await supabase
    .from('payout_items')
    .upsert(reversalRow, { onConflict: 'order_id,settlement_kind', ignoreDuplicates: true })
    .select()
    .maybeSingle();

  if (insertErr) throw normalizeError(insertErr);

  const readExistingReversalId = async () => {
    const { data: existingReversal, error: existingReversalErr } = await supabase
      .from('payout_items')
      .select('id')
      .eq('order_id', orderId)
      .eq('settlement_kind', 'reversal')
      .maybeSingle();

    if (existingReversalErr) throw normalizeError(existingReversalErr);
    return existingReversal?.id ? String(existingReversal.id) : null;
  };

  const hasAuditSelect = (() => {
    const auditTable = supabase.from('audit_logs');
    return !!(auditTable && typeof auditTable.select === 'function');
  })();

  const createdFresh = !!reversal?.id;

  if (!createdFresh && !hasAuditSelect) {
    return { skipped: 'already_reversed' };
  }

  let reversalIdRef = reversal?.id
    ? String(reversal.id)
    : await (async () => {
        try {
          const existingReversalId = await readExistingReversalId();
          if (!existingReversalId) {
            // no visible reversal row; keep old duplicate behavior
            return null;
          }
          return existingReversalId;
        } catch (err) {
          if (err instanceof Error && /^Unexpected Supabase call/.test(err.message)) {
            return null;
          }
          throw err;
        }
      })();


  if (!reversalIdRef) {
    return { skipped: 'already_reversed' };
  }

  const hasReversalCreatedLog = await readLog('payout_reversal_created', reversalIdRef);
  let balanceDebitLog = await readLog('guide_balance_debited_reversal', reversalIdRef);
  const isBalanceDebitInProgress =
    !!balanceDebitLog &&
    typeof balanceDebitLog.metadata === 'object' &&
    balanceDebitLog.metadata?.status === 'started';

  let beforeBalance = null;
  let afterBalance = null;
  let repaired = false;

  if (!hasAuditSelect && !hasReversalCreatedLog) {
    const { error: auditErr } = await supabase.from('audit_logs').insert({
      actor,
      action: 'payout_reversal_created',
      metadata: {
        order_id: orderId,
        guide_id: settlement.guide_id,
        net_twd: settlement.net_twd,
        reversal_id: reversalIdRef,
        settlement_id: settlement.id,
        settled_at: settledAt,
      },
    });

    if (auditErr) throw normalizeError(auditErr);
  }

  if (!balanceDebitLog || isBalanceDebitInProgress) {
    const { data: balance, error: balanceReadErr } = await supabase
      .from('guide_balances')
      .select('balance_twd')
      .eq('guide_id', settlement.guide_id)
      .maybeSingle();

    if (balanceReadErr) throw normalizeError(balanceReadErr);

    const currentBalance = normalizeNumber(balance?.balance_twd) ?? 0;
    const debit = Math.abs(normalizeNumber(settlement.net_twd) ?? 0);
    const markerMeta = typeof balanceDebitLog?.metadata === 'object' ? balanceDebitLog.metadata : {};
    const markerBefore = normalizeNumber(markerMeta.before_balance);
    const markerAfter = normalizeNumber(markerMeta.after_balance);
    const markerDebit = normalizeNumber(markerMeta.debit);

    beforeBalance = markerBefore ?? currentBalance;
    const newBalance = beforeBalance - debit;
    afterBalance = markerAfter ?? newBalance;

    if (markerDebit !== null && markerDebit !== debit) {
      afterBalance = currentBalance - debit;
    }

    if (!balanceDebitLog) {
      const markerPayload = {
        actor,
        action: 'guide_balance_debited_reversal',
        metadata: {
          order_id: orderId,
          guide_id: settlement.guide_id,
          before_balance: beforeBalance,
          after_balance: afterBalance,
          debit,
          reversal_id: reversalIdRef,
          settlement_id: settlement.id,
          status: 'started',
        },
      };

      const { error: auditBalanceErr } = await supabase.from('audit_logs').insert(markerPayload);
      if (auditBalanceErr) throw normalizeError(auditBalanceErr);
      balanceDebitLog = { metadata: markerPayload.metadata };
    }

    const shouldApplyDebit = currentBalance !== afterBalance;

    if (shouldApplyDebit) {
      const guideBalancesTable = supabase.from('guide_balances');
      if (!guideBalancesTable || typeof guideBalancesTable.upsert !== 'function') {
        if (!createdFresh) {
          return { skipped: 'already_reversed' };
        }
        throw new Error('guide_balances upsert is not available');
      }

      const { error: balanceUpsertErr } = await guideBalancesTable.upsert(
        { guide_id: settlement.guide_id, balance_twd: afterBalance, updated_at: new Date().toISOString() },
        { onConflict: 'guide_id' }
      );

      if (balanceUpsertErr) throw normalizeError(balanceUpsertErr);
    }

    repaired = true;
  }

  if (hasAuditSelect && !hasReversalCreatedLog) {
    const { error: auditErr } = await supabase.from('audit_logs').insert({
      actor,
      action: 'payout_reversal_created',
      metadata: {
        order_id: orderId,
        guide_id: settlement.guide_id,
        net_twd: settlement.net_twd,
        reversal_id: reversalIdRef,
        settlement_id: settlement.id,
        settled_at: settledAt,
      },
    });

    if (auditErr) throw normalizeError(auditErr);
  }

  if (repaired) {
    return {
      reversed: true,
      repaired: true,
      reversal_id: reversalIdRef,
      before_balance: beforeBalance,
      after_balance: afterBalance,
    };
  }

  return { reversed: true, reversal_id: reversalIdRef, skipped: false };
}

export async function updateGuideProfileByGuideId(guideId, fields) {
  // fields: allowed subset only — display_name, bio, region, languages, specialties, headline,
  // 以及不公開匯款資訊（#1475）：bank_name, account_name, account_number, transfer_note。
  if (!hasSupabaseEnv()) {
    return { ok: true }; // no-op in fixture mode
  }
  const supabase = await getSupabase();
  const allowed = [
    'display_name', 'bio', 'region', 'languages', 'specialties', 'headline',
    'bank_name', 'account_name', 'account_number', 'transfer_note',
  ];
  const update = {};
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(fields, k)) {
      update[k] = fields[k];
    }
  }
  if (Object.keys(update).length === 0) return { ok: true };
  update.updated_at = new Date().toISOString();
  const { error } = await supabase
    .from('guide_profiles')
    .update(update)
    .eq('id', guideId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// #1383 — 訂單改期 gateway（設計：docs/04-tech/04-tech-architecture/13-order-reschedule-design.md）
// in-memory fallback 與 Supabase 同狀態轉移；Supabase approve 的原子性由
// fn_reschedule_booking_atomic RPC 保證（鎖序 orders → bookings → activity_schedules）。
// ─────────────────────────────────────────────────────────────────────────────

function mapRescheduleRow(row, orderRow) {
  return {
    id: row.id,
    orderId: row.order_id,
    status: row.status,
    fromScheduleId: row.from_schedule_id,
    toScheduleId: row.to_schedule_id,
    fromStartAt: row.from_start_at ?? null,
    toStartAt: row.to_start_at ?? null,
    requestedAt: row.requested_at,
    resolvedAt: row.resolved_at ?? null,
    resolver: row.resolver ?? null,
    note: row.note ?? '',
    priorOrderStatus: row.prior_order_status,
    orderStatus: orderRow?.status ?? null,
    order: orderRow ? {
      id: orderRow.id,
      scheduleId: orderRow.schedule_id,
      scheduleStartAt: orderRow.schedule_start_at ?? null,
      peopleCount: orderRow.people_count,
      contactName: orderRow.contact_name ?? null,
    } : null,
  };
}

function scheduleRowToTarget(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    startAt: row.start_at,
    endAt: row.end_at,
    capacity: row.capacity,
    bookedCount: row.booked_count,
  };
}

async function expireRescheduleRowBestEffort(supabase, row, now) {
  try {
    await supabase
      .from('reschedule_requests')
      .update({ status: 'expired', resolved_at: now.toISOString(), updated_at: now.toISOString() })
      .eq('id', row.id)
      .eq('status', 'requested');
    await supabase
      .from('orders')
      .update({ status: row.prior_order_status, updated_at: now.toISOString() })
      .eq('id', row.order_id)
      .eq('status', 'reschedule_requested');
    await insertAuditLogDb(supabase, {
      orderId: row.order_id,
      actor: 'system',
      action: 'reschedule_expired',
      metadata: { rescheduleRequestId: row.id },
    });
    row.status = 'expired';
    row.resolved_at = now.toISOString();
  } catch { /* best-effort lazy expire */ }
}

export async function createRescheduleRequestDb(input = {}) {
  if (!hasSupabaseEnv()) return createRescheduleRequestInMemory(input);

  const orderId = String(input?.orderId || '').trim();
  const requestId = String(input?.requestId || '').trim();
  const toScheduleId = String(input?.toScheduleId || '').trim();
  const contactEmail = String(input?.contactEmail || '').trim();
  if (!orderId || !requestId || !toScheduleId) throw new Error('BAD_REQUEST: orderId/requestId/toScheduleId required');

  const supabase = await getSupabase();
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, status, contact_email, contact_name, schedule_id, people_count, activity_id')
    .eq('id', orderId)
    .maybeSingle();
  if (orderError || !order) throw new Error('ORDER_NOT_FOUND: order not found');
  if (contactEmail && order.contact_email && order.contact_email !== contactEmail) {
    throw new Error('ORDER_NOT_FOUND: order not found');
  }

  const { data: existing } = await supabase
    .from('reschedule_requests')
    .select('*')
    .eq('order_id', orderId)
    .eq('request_id', requestId)
    .maybeSingle();
  if (existing) return mapRescheduleRow(existing, order);

  const now = new Date();
  const { data: priorRows } = await supabase
    .from('reschedule_requests')
    .select('id, order_id, status, requested_at, prior_order_status')
    .eq('order_id', orderId);
  for (const row of priorRows ?? []) {
    if (row.status === 'requested' && isRescheduleRequestExpired(row.requested_at, now)) {
      await expireRescheduleRowBestEffort(supabase, row, now);
    }
  }

  const { data: fromSchedule } = await supabase
    .from('activity_schedules')
    .select('id, status, start_at, end_at, capacity, booked_count')
    .eq('id', order.schedule_id)
    .maybeSingle();

  const verdict = canRequestReschedule({
    orderStatus: order.status,
    scheduleStartAt: fromSchedule?.start_at,
    now,
    approvedCount: (priorRows ?? []).filter((r) => r.status === 'approved').length,
    hasPendingRequest: (priorRows ?? []).some((r) => r.status === 'requested'),
  });
  if (!verdict.ok) throw new Error(`${verdict.code}: ${verdict.message}`);

  const { data: targetRow } = await supabase
    .from('activity_schedules')
    .select('id, status, start_at, end_at, capacity, booked_count, activity_id')
    .eq('id', toScheduleId)
    .maybeSingle();
  if (targetRow && targetRow.activity_id !== order.activity_id) {
    throw new Error('SLOT_NOT_FOUND: target slot belongs to another activity');
  }
  const targetVerdict = isRescheduleTargetValid({
    fromScheduleId: order.schedule_id,
    target: scheduleRowToTarget(targetRow),
    peopleCount: order.people_count,
    now,
  });
  if (!targetVerdict.ok) throw new Error(`${targetVerdict.code}: ${targetVerdict.message}`);

  const { data: inserted, error: insertError } = await supabase
    .from('reschedule_requests')
    .insert({
      order_id: orderId,
      request_id: requestId,
      from_schedule_id: order.schedule_id,
      to_schedule_id: toScheduleId,
      from_start_at: fromSchedule?.start_at ?? null,
      to_start_at: targetRow?.start_at ?? null,
      status: 'requested',
      prior_order_status: order.status,
      requested_at: now.toISOString(),
    })
    .select('*')
    .single();
  if (insertError) {
    // unique (order_id, request_id) 競態 → 冪等回讀
    if (insertError.code === '23505') {
      const { data: raced } = await supabase
        .from('reschedule_requests')
        .select('*')
        .eq('order_id', orderId)
        .eq('request_id', requestId)
        .maybeSingle();
      if (raced) return mapRescheduleRow(raced, order);
    }
    throw new Error(insertError.message);
  }

  const { error: orderUpdateError } = await supabase
    .from('orders')
    .update({ status: 'reschedule_requested', updated_at: now.toISOString() })
    .eq('id', orderId)
    .eq('status', order.status);
  if (orderUpdateError) throw new Error(orderUpdateError.message);

  await insertAuditLogDb(supabase, {
    orderId,
    actor: 'user',
    action: 'reschedule_requested',
    metadata: { rescheduleRequestId: inserted.id, fromScheduleId: order.schedule_id, toScheduleId },
  });

  return mapRescheduleRow(inserted, { ...order, status: 'reschedule_requested' });
}

export async function listRescheduleOptionsDb(input = {}) {
  if (!hasSupabaseEnv()) return listRescheduleOptionsInMemory(input);

  const orderId = String(input?.orderId || '').trim();
  const contactEmail = String(input?.contactEmail || '').trim();
  const supabase = await getSupabase();

  const { data: order, error } = await supabase
    .from('orders')
    .select('id, contact_email, schedule_id, people_count, activity_id')
    .eq('id', orderId)
    .maybeSingle();
  if (error || !order) throw new Error('ORDER_NOT_FOUND: order not found');
  if (contactEmail && order.contact_email && order.contact_email !== contactEmail) {
    throw new Error('ORDER_NOT_FOUND: order not found');
  }

  const now = new Date();
  const { data: rows } = await supabase
    .from('activity_schedules')
    .select('id, status, start_at, end_at, capacity, booked_count')
    .eq('activity_id', order.activity_id)
    .eq('status', 'open')
    .gt('start_at', now.toISOString())
    .order('start_at', { ascending: true });

  return (rows ?? [])
    .filter((row) => isRescheduleTargetValid({
      fromScheduleId: order.schedule_id,
      target: scheduleRowToTarget(row),
      peopleCount: order.people_count,
      now,
    }).ok)
    .map((row) => ({
      id: row.id,
      startAt: row.start_at,
      endAt: row.end_at,
      capacityLeft: Number(row.capacity ?? 0) > 0 ? Number(row.capacity) - Number(row.booked_count ?? 0) : null,
    }));
}

export async function decideRescheduleRequestDb(input = {}) {
  if (!hasSupabaseEnv()) return decideRescheduleRequestInMemory(input);

  const requestId = String(input?.requestId || '').trim();
  const action = String(input?.action || '').trim();
  const resolver = String(input?.resolver || 'guide').trim();
  const note = String(input?.note || '').trim();
  if (!['approve', 'reject'].includes(action)) throw new Error('BAD_REQUEST: invalid action');

  const supabase = await getSupabase();
  const { data: row, error } = await supabase
    .from('reschedule_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle();
  if (error || !row) throw new Error('REQUEST_NOT_FOUND: reschedule request not found');

  const now = new Date();
  if (row.status === 'requested' && isRescheduleRequestExpired(row.requested_at, now)) {
    await expireRescheduleRowBestEffort(supabase, row, now);
  }
  if (row.status !== 'requested') throw new Error(`REQUEST_NOT_PENDING: request is ${row.status}`);

  if (action === 'reject') {
    const { error: updError } = await supabase
      .from('reschedule_requests')
      .update({ status: 'rejected', resolver, note: note || null, resolved_at: now.toISOString(), updated_at: now.toISOString() })
      .eq('id', requestId)
      .eq('status', 'requested');
    if (updError) throw new Error(updError.message);
    await supabase
      .from('orders')
      .update({ status: row.prior_order_status, updated_at: now.toISOString() })
      .eq('id', row.order_id)
      .eq('status', 'reschedule_requested');
    await insertAuditLogDb(supabase, {
      orderId: row.order_id,
      action: 'reschedule_rejected',
      metadata: { rescheduleRequestId: row.id, note },
    });
    const { data: orderRow } = await supabase
      .from('orders')
      .select('id, status, schedule_id, people_count, contact_name')
      .eq('id', row.order_id)
      .maybeSingle();
    return mapRescheduleRow({ ...row, status: 'rejected', resolver, note, resolved_at: now.toISOString() }, orderRow);
  }

  // approve — 原子性交給 RPC（鎖定/容量檢查/雙場次轉移/狀態回復/audit 同一交易）
  const { error: rpcError } = await supabase.rpc('fn_reschedule_booking_atomic', {
    p_request_id: requestId,
    p_resolver: resolver,
  });
  if (rpcError) throw new Error(rpcError.message);

  const { data: updatedRow } = await supabase
    .from('reschedule_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle();
  const { data: orderRow } = await supabase
    .from('orders')
    .select('id, status, schedule_id, people_count, contact_name')
    .eq('id', row.order_id)
    .maybeSingle();
  return mapRescheduleRow(updatedRow ?? row, orderRow);
}

export async function withdrawRescheduleRequestDb(input = {}) {
  if (!hasSupabaseEnv()) return withdrawRescheduleRequestInMemory(input);

  const requestId = String(input?.requestId || '').trim();
  const contactEmail = String(input?.contactEmail || '').trim();
  const supabase = await getSupabase();

  const { data: row, error } = await supabase
    .from('reschedule_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle();
  if (error || !row) throw new Error('REQUEST_NOT_FOUND: reschedule request not found');

  const { data: order } = await supabase
    .from('orders')
    .select('id, status, contact_email, schedule_id, people_count, contact_name')
    .eq('id', row.order_id)
    .maybeSingle();
  if (!order) throw new Error('ORDER_NOT_FOUND: order not found');
  if (contactEmail && order.contact_email && order.contact_email !== contactEmail) {
    throw new Error('REQUEST_NOT_FOUND: reschedule request not found');
  }

  const now = new Date();
  if (row.status === 'requested' && isRescheduleRequestExpired(row.requested_at, now)) {
    await expireRescheduleRowBestEffort(supabase, row, now);
  }
  if (row.status !== 'requested') throw new Error(`REQUEST_NOT_PENDING: request is ${row.status}`);

  const { error: updError } = await supabase
    .from('reschedule_requests')
    .update({ status: 'withdrawn', resolved_at: now.toISOString(), updated_at: now.toISOString() })
    .eq('id', requestId)
    .eq('status', 'requested');
  if (updError) throw new Error(updError.message);
  await supabase
    .from('orders')
    .update({ status: row.prior_order_status, updated_at: now.toISOString() })
    .eq('id', row.order_id)
    .eq('status', 'reschedule_requested');
  await insertAuditLogDb(supabase, {
    orderId: row.order_id,
    actor: 'user',
    action: 'reschedule_withdrawn',
    metadata: { rescheduleRequestId: row.id },
  });
  return mapRescheduleRow({ ...row, status: 'withdrawn', resolved_at: now.toISOString() }, { ...order, status: row.prior_order_status });
}

export async function listGuideRescheduleRequestsDb(input = {}) {
  if (!hasSupabaseEnv()) return listGuideRescheduleRequestsInMemory(input);

  const guideId = String(input?.guideId || '').trim();
  const supabase = await getSupabase();
  const now = new Date();

  const { data: rows, error } = await supabase
    .from('reschedule_requests')
    .select('*, orders!inner(id, status, schedule_id, people_count, contact_name, activity_id, activities!inner(id, title, guide_id))')
    .order('requested_at', { ascending: false });
  if (error) throw new Error(error.message);

  const result = [];
  for (const row of rows ?? []) {
    const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;
    const activity = order ? (Array.isArray(order.activities) ? order.activities[0] : order.activities) : null;
    if (guideId && activity?.guide_id !== guideId) continue;
    if (row.status === 'requested' && isRescheduleRequestExpired(row.requested_at, now)) {
      await expireRescheduleRowBestEffort(supabase, row, now);
      if (order) order.status = row.prior_order_status;
    }
    result.push({
      ...mapRescheduleRow(row, order),
      activityTitle: activity?.title ?? null,
    });
  }
  return result;
}

// ── Issue #1411: 站內訊息（訂單留言串） ─────────────────────────────────────

/**
 * ownership 解析（Supabase 分支）：
 * - contactEmail 不符 → ORDER_NOT_FOUND（不洩漏存在性）
 * - guideId 不符活動歸屬 → FORBIDDEN
 * - 兩者皆缺 → admin/service-role 路徑，放行
 */
async function fetchOrderForMessages(supabase, { orderId, contactEmail, guideId }) {
  const { data: order, error } = await supabase
    .from('orders')
    .select('id, status, contact_email, contact_name, schedule_id, activity_id, activities(id, title, guide_id), activity_schedules(id, start_at, end_at)')
    .eq('id', String(orderId || '').trim())
    .maybeSingle();
  if (error || !order) throw new Error('ORDER_NOT_FOUND: order not found');
  if (contactEmail && order.contact_email && order.contact_email !== contactEmail) {
    throw new Error('ORDER_NOT_FOUND: order not found');
  }
  const activity = Array.isArray(order.activities) ? order.activities[0] : order.activities;
  if (guideId && activity?.guide_id !== guideId) {
    throw new Error('FORBIDDEN: order belongs to another guide');
  }
  const schedule = Array.isArray(order.activity_schedules) ? order.activity_schedules[0] : order.activity_schedules;
  return { order, activity, schedule };
}

function orderMessageWindowForRow(order, schedule, now) {
  // orders 無 completed_at 欄位 → completed 的 14 天唯讀窗以場次 end_at 起算
  return getOrderMessageWindow({
    orderStatus: order.status,
    scheduleStartAt: schedule?.start_at,
    scheduleEndAt: schedule?.end_at,
    now,
  });
}

export async function listOrderMessagesDb(input = {}) {
  if (!hasSupabaseEnv()) return listOrderMessagesInMemory(input);

  const supabase = await getSupabase();
  const { order, activity, schedule } = await fetchOrderForMessages(supabase, input);
  const window = orderMessageWindowForRow(order, schedule, new Date());

  const { data: rows, error } = await supabase
    .from('order_messages')
    .select('*')
    .eq('order_id', order.id)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);

  return {
    orderId: order.id,
    orderStatus: order.status,
    activityTitle: activity?.title ?? null,
    canView: window.canView,
    canPost: window.canPost,
    messages: (rows ?? []).map(serialiseOrderMessage),
  };
}

export async function createOrderMessageDb(input = {}) {
  if (!hasSupabaseEnv()) return createOrderMessageInMemory(input);

  const role = String(input?.senderRole || '').trim();
  if (!['traveler', 'guide'].includes(role)) throw new Error('BAD_REQUEST: invalid senderRole');
  const verdict = validateOrderMessageBody(input?.body);
  if (!verdict.ok) throw new Error(`${verdict.code}: ${verdict.message}`);

  const supabase = await getSupabase();
  const { order, schedule } = await fetchOrderForMessages(supabase, input);
  const now = new Date();
  const window = orderMessageWindowForRow(order, schedule, now);
  if (!window.canPost) throw new Error('MESSAGE_WINDOW_CLOSED: 此訂單目前無法留言');

  // 通知節流：只需同角色最後一則
  const { data: lastSameRole } = await supabase
    .from('order_messages')
    .select('sender_role, created_at')
    .eq('order_id', order.id)
    .eq('sender_role', role)
    .order('created_at', { ascending: false })
    .limit(1);
  const shouldNotify = shouldNotifyOrderMessage({
    previousMessages: lastSameRole ?? [],
    senderRole: role,
    now,
  });

  const { data: inserted, error: insertError } = await supabase
    .from('order_messages')
    .insert({
      order_id: order.id,
      sender_role: role,
      sender_id: input?.senderId ? String(input.senderId) : null,
      body: verdict.value,
      created_at: now.toISOString(),
    })
    .select('*')
    .single();
  if (insertError) throw new Error(insertError.message);

  return { message: serialiseOrderMessage(inserted), shouldNotify };
}

export async function listGuideMessageThreadsDb(input = {}) {
  if (!hasSupabaseEnv()) return listGuideMessageThreadsInMemory(input);

  const guideId = String(input?.guideId || '').trim();
  const supabase = await getSupabase();
  const now = new Date();

  const { data: rows, error } = await supabase
    .from('order_messages')
    .select('*, orders!inner(id, status, schedule_id, contact_name, activity_id, activities!inner(id, title, guide_id), activity_schedules(id, start_at, end_at))')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);

  const byOrder = new Map();
  for (const row of rows ?? []) {
    const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;
    const activity = order ? (Array.isArray(order.activities) ? order.activities[0] : order.activities) : null;
    if (!order || (guideId && activity?.guide_id !== guideId)) continue;
    if (!byOrder.has(order.id)) byOrder.set(order.id, { order, activity, messages: [] });
    byOrder.get(order.id).messages.push(row);
  }

  const threads = [];
  for (const { order, activity, messages } of byOrder.values()) {
    const last = messages[messages.length - 1];
    const schedule = Array.isArray(order.activity_schedules) ? order.activity_schedules[0] : order.activity_schedules;
    const window = orderMessageWindowForRow(order, schedule, now);
    threads.push({
      orderId: order.id,
      orderStatus: order.status,
      activityTitle: activity?.title ?? null,
      contactName: order.contact_name ?? null,
      scheduleStartAt: schedule?.start_at ?? null,
      lastMessage: serialiseOrderMessage(last),
      messageCount: messages.length,
      needsReply: last.sender_role === 'traveler',
      canPost: window.canPost,
    });
  }

  // 待回覆優先，再依最後留言時間新→舊
  return threads.sort((a, b) => {
    if (a.needsReply !== b.needsReply) return a.needsReply ? -1 : 1;
    return String(b.lastMessage.createdAt).localeCompare(String(a.lastMessage.createdAt));
  });
}

// ── 首頁精選設定（admin 選擇編輯精選／更多精選行程） ──────────────────────
// singleton row（id='default'），shape 契約見 tests/api/homepage-featured-contract.test.mjs

const HOMEPAGE_FEATURED_EMPTY = { editorPickSlug: null, moreFeaturedSlugs: [], editorPickCopy: {}, moreFeaturedCopy: {}, updatedAt: null, updatedBy: null };

function asPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export async function getHomepageFeaturedDb() {
  if (!hasSupabaseEnv()) return getHomepageFeaturedFallback();

  const supabase = await getSupabase();
  const fullSelect = 'editor_pick_slug, more_featured_slugs, editor_pick_copy, more_featured_copy, updated_at, updated_by';
  let { data, error } = await supabase
    .from('homepage_featured_settings')
    .select(fullSelect)
    .limit(1)
    .maybeSingle();

  // 文案 migration 未套用（欄位不存在）→ 退回不含 copy 的 select，回空 copy。
  if (error && isMissingHomepageFeaturedCopyColumn(error)) {
    ({ data, error } = await supabase
      .from('homepage_featured_settings')
      .select('editor_pick_slug, more_featured_slugs, updated_at, updated_by')
      .limit(1)
      .maybeSingle());
  }

  if (error) {
    // migration 未套用（表不存在）時 fail-open 回未設定狀態：首頁照常渲染預設，
    // admin 頁面也能載入（儲存時才以可執行訊息提示套用 migration）。
    if (isMissingHomepageFeaturedTable(error)) {
      return { ...HOMEPAGE_FEATURED_EMPTY };
    }
    const err = new Error(error.message);
    err.code = error.code;
    throw err;
  }
  if (!data) return { ...HOMEPAGE_FEATURED_EMPTY };
  return {
    editorPickSlug: data.editor_pick_slug ?? null,
    moreFeaturedSlugs: Array.isArray(data.more_featured_slugs) ? data.more_featured_slugs.map(String) : [],
    editorPickCopy: asPlainObject(data.editor_pick_copy),
    moreFeaturedCopy: asPlainObject(data.more_featured_copy),
    updatedAt: data.updated_at ?? null,
    updatedBy: data.updated_by ?? null,
  };
}

export async function setHomepageFeaturedDb(input = {}) {
  const actor = String(input?.actor || 'admin');
  const validSlugs = Array.isArray(input?.validSlugs) ? input.validSlugs : [];
  const { editorPickSlug, moreFeaturedSlugs, errors } = normalizeHomepageFeatured(input, validSlugs);
  if (errors.length > 0) {
    const err = new Error(errors.join('；'));
    err.code = 'HOMEPAGE_FEATURED_INVALID';
    throw err;
  }

  // 文案覆寫：清洗後僅保留有效欄位/slug（更多精選 copy 限定本次選取的 slug）。
  const editorPickCopy = editorPickSlug ? sanitizeEditorPickCopy(input?.editorPickCopy) : {};
  const moreFeaturedCopy = sanitizeMoreFeaturedCopy(input?.moreFeaturedCopy, moreFeaturedSlugs);

  if (!hasSupabaseEnv()) return setHomepageFeaturedFallback({ editorPickSlug, moreFeaturedSlugs, editorPickCopy, moreFeaturedCopy, actor });

  const before = await getHomepageFeaturedDb();
  const supabase = await getSupabase();
  const payload = {
    id: 'default',
    editor_pick_slug: editorPickSlug,
    more_featured_slugs: moreFeaturedSlugs,
    editor_pick_copy: editorPickCopy,
    more_featured_copy: moreFeaturedCopy,
    updated_at: new Date().toISOString(),
    updated_by: actor,
  };
  let { error } = await supabase.from('homepage_featured_settings').upsert(payload);

  // 文案 migration 未套用（copy 欄位不存在）→ 退回只寫 slug 欄位，仍能儲存選取。
  if (error && isMissingHomepageFeaturedCopyColumn(error)) {
    const { editor_pick_copy, more_featured_copy, ...slugOnly } = payload;
    ({ error } = await supabase.from('homepage_featured_settings').upsert(slugOnly));
  }

  if (error) {
    // 表不存在（migration 未套用）→ 以可執行繁中訊息提示 operator，而非丟英文原訊息。
    if (isMissingHomepageFeaturedTable(error)) {
      const err = new Error(HOMEPAGE_FEATURED_TABLE_MISSING_MESSAGE);
      err.code = 'HOMEPAGE_FEATURED_TABLE_MISSING';
      throw err;
    }
    const err = new Error(error.message);
    err.code = error.code;
    throw err;
  }

  const after = await getHomepageFeaturedDb();
  await insertAuditLogDb(supabase, {
    actor,
    action: 'homepage_featured_update',
    metadata: { actorRole: 'admin', before, after },
  }).catch(() => {}); // audit 失敗不阻斷設定本身
  return after;
}

// ---------------------------------------------------------------------------
// LINE user binding (line_user_mapping) — Supabase path.
// In-memory fallback lives in line-binding.mjs (which only calls these when
// hasSupabaseEnv() is true). Resolution mirrors listMyOrdersDb's user_id-first,
// contact_email-fallback convention.
// ---------------------------------------------------------------------------

function mapLineMappingRow(row) {
  if (!row) return null;
  return {
    lineUserId: row.line_user_id,
    userId: row.user_id ?? null,
    contactEmail: row.contact_email ?? null,
    displayName: row.display_name ?? null,
    isBlocked: !!row.is_blocked,
    boundAt: row.bound_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export async function upsertLineMappingDb({ lineUserId, userId, contactEmail, displayName } = {}) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await getSupabase();
  const now = new Date().toISOString();
  const row = { line_user_id: lineUserId, updated_at: now };
  if (userId !== undefined) row.user_id = userId ?? null;
  if (contactEmail !== undefined) {
    row.contact_email = contactEmail ? String(contactEmail).trim().toLowerCase() : null;
  }
  if (displayName !== undefined) row.display_name = displayName ?? null;
  const { data, error } = await supabase
    .from('line_user_mapping')
    .upsert(row, { onConflict: 'line_user_id' })
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return mapLineMappingRow(data);
}

export async function getLineMappingByLineUserIdDb(lineUserId) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('line_user_mapping')
    .select('*')
    .eq('line_user_id', lineUserId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return mapLineMappingRow(data);
}

export async function setLineBlockedDb(lineUserId, blocked) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('line_user_mapping')
    .update({ is_blocked: !!blocked, updated_at: new Date().toISOString() })
    .eq('line_user_id', lineUserId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return mapLineMappingRow(data);
}

export async function markLineWebhookEventDb(webhookEventId, meta = {}) {
  if (!hasSupabaseEnv()) return { firstTime: true };
  const supabase = await getSupabase();
  // Insert; a unique-violation on the PK means we've already seen this event.
  const { error } = await supabase
    .from('line_webhook_events')
    .insert({
      webhook_event_id: webhookEventId,
      event_type: meta.eventType ?? null,
      line_user_id: meta.lineUserId ?? null,
    });
  if (error) {
    // 23505 = unique_violation (duplicate delivery)
    if (error.code === '23505') return { firstTime: false };
    throw new Error(error.message);
  }
  return { firstTime: true };
}

export async function getLineUserIdForOrderDb(order) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await getSupabase();
  const userId = order?.userId ?? order?.user_id ?? null;
  const email = (order?.contactEmail ?? order?.contact_email ?? '').toString().trim().toLowerCase();

  // user_id is the primary key; contact_email is the guest fallback.
  if (userId) {
    const { data, error } = await supabase
      .from('line_user_mapping')
      .select('line_user_id')
      .eq('user_id', userId)
      .eq('is_blocked', false)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data?.line_user_id) return data.line_user_id;
  }
  if (email) {
    const { data, error } = await supabase
      .from('line_user_mapping')
      .select('line_user_id')
      .eq('contact_email', email)
      .eq('is_blocked', false)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data?.line_user_id) return data.line_user_id;
  }
  return null;
}

/** Mint a one-time traveler LINE bind code (clears the traveler's prior codes). */
export async function createLineBindCodeDb({ code, userId, contactEmail, expiresAt } = {}) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await getSupabase();
  if (userId) await supabase.from('line_bind_code').delete().eq('user_id', userId);
  if (contactEmail) await supabase.from('line_bind_code').delete().eq('contact_email', contactEmail);
  const { error } = await supabase
    .from('line_bind_code')
    .insert({ code, user_id: userId ?? null, contact_email: contactEmail ?? null, expires_at: expiresAt });
  if (error) throw new Error(error.message);
  return { code, userId: userId ?? null, contactEmail: contactEmail ?? null, expiresAt };
}

/**
 * Atomically consume a traveler bind code: returns { userId, contactEmail, expired }
 * or null when the code does not exist. The row is always deleted (single-use).
 */
export async function consumeLineBindCodeDb(code) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('line_bind_code')
    .delete()
    .eq('code', code)
    .select('user_id, contact_email, expires_at')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const expired = new Date(data.expires_at).getTime() <= Date.now();
  return { userId: data.user_id ?? null, contactEmail: data.contact_email ?? null, expired };
}

// ---------------------------------------------------------------------------
// Guide ↔ LINE binding (guide_line_mapping + guide_line_bind_code) — Supabase.
// In-memory fallback lives in guide-line-binding.mjs. Used for per-guide push.
// ---------------------------------------------------------------------------

function mapGuideLineRow(row) {
  if (!row) return null;
  return {
    guideId: row.guide_id,
    lineUserId: row.line_user_id,
    displayName: row.display_name ?? null,
    isBlocked: !!row.is_blocked,
    boundAt: row.bound_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

/** Upsert the guide's LINE binding (idempotent on guide_id). */
export async function upsertGuideLineMappingDb({ guideId, lineUserId, displayName } = {}) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await getSupabase();
  const now = new Date().toISOString();
  const row = {
    guide_id: guideId,
    line_user_id: lineUserId,
    is_blocked: false,
    updated_at: now,
  };
  if (displayName !== undefined) row.display_name = displayName ?? null;
  const { data, error } = await supabase
    .from('guide_line_mapping')
    .upsert(row, { onConflict: 'guide_id' })
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return mapGuideLineRow(data);
}

/** Resolve a guide to their LINE userId, or null if unbound/blocked. */
export async function getLineUserIdForGuideDb(guideId) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('guide_line_mapping')
    .select('line_user_id')
    .eq('guide_id', guideId)
    .eq('is_blocked', false)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.line_user_id ?? null;
}

/** Fetch the guide's binding row (for console status). */
export async function getGuideBindingDb(guideId) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('guide_line_mapping')
    .select('*')
    .eq('guide_id', guideId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return mapGuideLineRow(data);
}

/** Flag a guide binding blocked/unblocked by line_user_id. */
export async function setGuideLineBlockedDb(lineUserId, blocked) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('guide_line_mapping')
    .update({ is_blocked: !!blocked, updated_at: new Date().toISOString() })
    .eq('line_user_id', lineUserId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return mapGuideLineRow(data);
}

/** Store a one-time guide binding code (replaces the guide's prior codes). */
export async function createGuideBindCodeDb({ code, guideId, expiresAt } = {}) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await getSupabase();
  // Clear outstanding codes for this guide so only the latest is valid.
  await supabase.from('guide_line_bind_code').delete().eq('guide_id', guideId);
  const { error } = await supabase
    .from('guide_line_bind_code')
    .insert({ code, guide_id: guideId, expires_at: expiresAt });
  if (error) throw new Error(error.message);
  return { code, guideId, expiresAt };
}

/**
 * Atomically consume a binding code: returns { guideId, expired } or null when
 * the code does not exist. The row is always deleted (single-use).
 */
export async function consumeGuideBindCodeDb(code) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('guide_line_bind_code')
    .delete()
    .eq('code', code)
    .select('guide_id, expires_at')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const expired = new Date(data.expires_at).getTime() <= Date.now();
  return { guideId: data.guide_id, expired };
}

/** Resolve an order's activity → owning guide_id (for per-guide push). */
export async function getGuideIdForOrderDb({ activityId } = {}) {
  if (!hasSupabaseEnv() || !activityId) return null;
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('activities')
    .select('guide_id')
    .eq('id', activityId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.guide_id ?? null;
}

// ---------------------------------------------------------------------------
// Telegram chat binding (telegram_chat_mapping + telegram_bind_code +
// telegram_webhook_events) — Supabase. In-memory fallback in telegram-binding.mjs.
// ---------------------------------------------------------------------------

function mapTelegramRow(row) {
  if (!row) return null;
  return {
    role: row.role,
    subjectId: row.subject_id ?? null,
    contactEmail: row.contact_email ?? null,
    chatId: row.chat_id,
    displayName: row.display_name ?? null,
    isBlocked: !!row.is_blocked,
    boundAt: row.bound_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

/** Upsert a Telegram binding (idempotent on (role, subject_id)). */
export async function upsertTelegramMappingDb({ role, subjectId, contactEmail, chatId, displayName } = {}) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await getSupabase();
  const now = new Date().toISOString();
  const row = { role, subject_id: subjectId ?? null, chat_id: chatId, is_blocked: false, updated_at: now };
  if (contactEmail !== undefined) row.contact_email = contactEmail ? String(contactEmail).trim().toLowerCase() : null;
  if (displayName !== undefined) row.display_name = displayName ?? null;
  const { data, error } = await supabase
    .from('telegram_chat_mapping')
    .upsert(row, { onConflict: 'role,subject_id' })
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return mapTelegramRow(data);
}

export async function getTelegramChatForGuideDb(guideId) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('telegram_chat_mapping')
    .select('chat_id')
    .eq('role', 'guide').eq('subject_id', guideId).eq('is_blocked', false)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.chat_id ?? null;
}

export async function getTelegramChatForTravelerDb({ userId, contactEmail } = {}) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await getSupabase();
  if (userId) {
    const { data, error } = await supabase
      .from('telegram_chat_mapping')
      .select('chat_id')
      .eq('role', 'traveler').eq('subject_id', userId).eq('is_blocked', false)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data?.chat_id) return data.chat_id;
  }
  if (contactEmail) {
    const { data, error } = await supabase
      .from('telegram_chat_mapping')
      .select('chat_id')
      .eq('role', 'traveler').eq('contact_email', contactEmail).eq('is_blocked', false)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data?.chat_id) return data.chat_id;
  }
  return null;
}

export async function setTelegramBlockedDb(chatId, blocked) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('telegram_chat_mapping')
    .update({ is_blocked: !!blocked, updated_at: new Date().toISOString() })
    .eq('chat_id', chatId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return mapTelegramRow(data);
}

/** Store a one-time Telegram binding code (replaces the subject's prior codes). */
export async function createTelegramBindCodeDb({ code, role, subjectId, contactEmail, expiresAt } = {}) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await getSupabase();
  let del = supabase.from('telegram_bind_code').delete().eq('role', role);
  del = subjectId == null ? del.is('subject_id', null) : del.eq('subject_id', subjectId);
  await del;
  const { error } = await supabase
    .from('telegram_bind_code')
    .insert({ code, role, subject_id: subjectId ?? null, contact_email: contactEmail ?? null, expires_at: expiresAt });
  if (error) throw new Error(error.message);
  return { code };
}

/** Atomically consume a Telegram bind code (single-use). */
export async function consumeTelegramBindCodeDb(code) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('telegram_bind_code')
    .delete()
    .eq('code', code)
    .select('role, subject_id, contact_email, expires_at')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const expired = new Date(data.expires_at).getTime() <= Date.now();
  return { role: data.role, subjectId: data.subject_id, contactEmail: data.contact_email, expired };
}

export async function markTelegramUpdateDb(updateId) {
  if (!hasSupabaseEnv()) return { firstTime: true };
  const supabase = await getSupabase();
  const { error } = await supabase.from('telegram_webhook_events').insert({ update_id: String(updateId) });
  if (error) {
    if (error.code === '23505') return { firstTime: false };
    throw new Error(error.message);
  }
  return { firstTime: true };
}

// ---------------------------------------------------------------------------
// Notification matrix (notification_event_settings) — Supabase singleton row.
// Stores a sparse override map { "event:recipient:channel": boolean } in a
// JSONB column; absence of a key means "use default" (= enabled). In-memory
// fallback lives in notification-settings.mjs / store.mjs.
// ---------------------------------------------------------------------------

const NOTIFICATION_SETTINGS_SINGLETON_ID = 'singleton';

/** Read the sparse override map; returns {} when unset / no DB / table absent. */
export async function getNotificationOverridesDb() {
  if (!hasSupabaseEnv()) return {};
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('notification_event_settings')
    .select('overrides')
    .eq('id', NOTIFICATION_SETTINGS_SINGLETON_ID)
    .maybeSingle();
  if (error) {
    // Fail-open before the migration is applied: a missing table = no overrides
    // = matrix defaults all-on (the documented pre-migration behaviour).
    if (isMissingTableError(error)) return {};
    throw new Error(error.message);
  }
  const overrides = data?.overrides;
  return overrides && typeof overrides === 'object' ? overrides : {};
}

/** Merge cell toggles into the override map (idempotent upsert of the singleton). */
export async function setNotificationCellsDb(cells = [], { actor = 'admin' } = {}) {
  if (!hasSupabaseEnv()) return {};
  const supabase = await getSupabase();
  const current = await getNotificationOverridesDb();
  const next = { ...current };
  for (const cell of cells) {
    next[`${cell.event}:${cell.recipient}:${cell.channel}`] = !!cell.enabled;
  }
  const { error } = await supabase
    .from('notification_event_settings')
    .upsert(
      {
        id: NOTIFICATION_SETTINGS_SINGLETON_ID,
        overrides: next,
        updated_by: actor,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );
  if (error) {
    // Unlike reads, writes can't fail-open — the toggle can't persist without
    // the table. Surface an actionable, taggable error for the API to map.
    if (isMissingTableError(error)) {
      throw new Error('notification_settings_migration_missing: notification_event_settings 表尚未建立，請先套用 migration（見 docs/operations/line-telegram-prod-migrations.md）');
    }
    throw new Error(error.message);
  }
  return next;
}
