/**
 * request plan 導遊審核（先審核後付款）
 * #1613 db.mjs strangler：整塊自 db.mjs 純搬移（行為零變更；型別債見 #1597）。
 * db.mjs 以 re-export 保持既有 caller 匯入路徑不變。
 */
import { decideApproval } from './booking-type-flow.mjs';
import { computePaymentDeadline } from './payment-deadline.mjs';
import { getSupabase, hasSupabaseEnv } from './supabase-env.mjs';

// ── 三種預約模式：request plan 的導遊審核（先審核後付款） ──────────────────────
//
// guide_approval_status 是與 booking.status 正交的審核維度。request plan 的 draft
// booking 帶 guide_approval_status='pending'；導遊 approve → 'approved'（放行付款，
// booking 維持 draft），reject → 'rejected' 且 booking draft→cancelled、連動 order
// 取消（cancelled_by_guide）。決策合法性由純函式 decideApproval 統一判定。

// In-memory V2 booking registry（feature-scoped；無 Supabase 時的 fallback 與契約測試用）。
const v2BookingApprovalStore = new Map();

export function __seedV2BookingForTest(booking = {}) {
  const id = String(booking.id || `bk_${v2BookingApprovalStore.size + 1}`);
  const row = {
    id,
    booking_no: booking.booking_no ?? `BK-${id}`,
    guide_id: booking.guide_id ?? null,
    order_id: booking.order_id ?? null,
    status: booking.status ?? 'draft',
    guide_approval_status: booking.guide_approval_status ?? 'pending',
    booking_type: booking.booking_type ?? 'request',
    order_status: booking.order_status ?? 'pending_payment',
    order_payment_deadline_at: booking.order_payment_deadline_at ?? null,
    guide_approval_note: null,
    guide_approval_decided_at: null,
  };
  v2BookingApprovalStore.set(id, row);
  return row;
}

export function __resetV2BookingStoreForTest() {
  v2BookingApprovalStore.clear();
}

function decideBookingApprovalInMemory(input = {}) {
  const bookingId = String(input?.bookingId || '').trim();
  const guideId = String(input?.guideId || '').trim();
  const action = String(input?.action || '').trim();
  const note = String(input?.note || '').trim();

  const row = v2BookingApprovalStore.get(bookingId);
  if (!row) throw new Error('BOOKING_NOT_FOUND: booking not found');
  // ownership：不洩漏存在性
  if (guideId && row.guide_id && row.guide_id !== guideId) {
    throw new Error('BOOKING_NOT_FOUND: booking not found');
  }

  const decision = decideApproval({
    bookingStatus: row.status,
    guideApprovalStatus: row.guide_approval_status,
    bookingType: row.booking_type,
    action,
  });
  if (!decision.ok) throw new Error(`${decision.code}: ${decision.messageZh}`);

  row.guide_approval_status = decision.nextGuideApprovalStatus;
  row.guide_approval_note = note || null;
  row.guide_approval_decided_at = new Date().toISOString();
  row.status = decision.nextBookingStatus;
  if (decision.nextBookingStatus === 'cancelled') {
    row.order_status = 'cancelled_by_guide';
  }
  // #1493 approve → 起算 24h 付款期限（與 Supabase 路徑契約一致）。
  let paymentDeadlineAt = null;
  if (decision.nextGuideApprovalStatus === 'approved') {
    paymentDeadlineAt = computePaymentDeadline(row.guide_approval_decided_at);
    row.order_payment_deadline_at = paymentDeadlineAt;
  }
  v2BookingApprovalStore.set(bookingId, row);

  return {
    bookingId,
    bookingNo: row.booking_no,
    orderId: row.order_id ?? null,
    status: row.status,
    guideApprovalStatus: row.guide_approval_status,
    paymentDeadlineAt,
    action,
  };
}

export async function decideBookingApprovalDb(input = {}) {
  if (!hasSupabaseEnv()) return decideBookingApprovalInMemory(input);

  const bookingId = String(input?.bookingId || '').trim();
  const guideId = String(input?.guideId || '').trim();
  const action = String(input?.action || '').trim();
  const note = String(input?.note || '').trim();
  if (!['approve', 'reject'].includes(action)) throw new Error('BAD_REQUEST: invalid action');

  const supabase = await getSupabase();
  const { data: booking, error } = await supabase
    .from('bookings')
    .select('id, booking_no, guide_id, order_id, status, guide_approval_status, activity_plan_id, activity_plans(booking_type)')
    .eq('id', bookingId)
    .maybeSingle();
  if (error || !booking) throw new Error('BOOKING_NOT_FOUND: booking not found');

  // ownership：不洩漏存在性
  if (guideId && booking.guide_id && booking.guide_id !== guideId) {
    throw new Error('BOOKING_NOT_FOUND: booking not found');
  }

  const planRel = Array.isArray(booking.activity_plans)
    ? booking.activity_plans[0]
    : booking.activity_plans;
  const bookingType = planRel?.booking_type;

  const decision = decideApproval({
    bookingStatus: booking.status,
    guideApprovalStatus: booking.guide_approval_status,
    bookingType,
    action,
  });
  if (!decision.ok) throw new Error(`${decision.code}: ${decision.messageZh}`);

  const now = new Date();
  const updatePayload = {
    guide_approval_status: decision.nextGuideApprovalStatus,
    guide_approval_decided_at: now.toISOString(),
    guide_approval_note: note || null,
    updated_at: now.toISOString(),
  };
  if (decision.nextBookingStatus === 'cancelled') {
    updatePayload.status = 'cancelled';
    updatePayload.cancelled_at = now.toISOString();
  }

  // optimistic guard：只在仍為 pending 時更新，避免雙重決策 race
  const { error: updError } = await supabase
    .from('bookings')
    .update(updatePayload)
    .eq('id', bookingId)
    .eq('guide_approval_status', 'pending');
  if (updError) throw new Error(updError.message);

  await supabase.from('booking_status_logs').insert({
    booking_id: bookingId,
    from_status: booking.status,
    to_status: decision.nextBookingStatus,
    actor_user_id: null,
    actor_role: 'guide',
    reason: action === 'approve' ? 'guide_approved' : 'guide_rejected',
    metadata: { guideId, note, bookingType },
  });

  // reject → 連動取消 order（僅未付款的 pending_payment）
  if (decision.nextBookingStatus === 'cancelled' && booking.order_id) {
    await supabase
      .from('orders')
      .update({ status: 'cancelled_by_guide', updated_at: now.toISOString() })
      .eq('id', booking.order_id)
      .eq('status', 'pending_payment');
  }

  // #1493 approve → 開放付款，自此起算 24h 付款期限（request 建立時為 null）。
  let paymentDeadlineAt = null;
  if (decision.nextGuideApprovalStatus === 'approved' && booking.order_id) {
    paymentDeadlineAt = computePaymentDeadline(now.toISOString());
    await supabase
      .from('orders')
      .update({ payment_deadline_at: paymentDeadlineAt, updated_at: now.toISOString() })
      .eq('id', booking.order_id)
      .eq('status', 'pending_payment');
  }

  return {
    bookingId,
    bookingNo: booking.booking_no,
    orderId: booking.order_id ?? null,
    status: decision.nextBookingStatus,
    guideApprovalStatus: decision.nextGuideApprovalStatus,
    paymentDeadlineAt,
    action,
  };
}

/**
 * 導遊「待審核」清單：request plan 仍為 draft + guide_approval_status='pending'。
 */
export async function listGuidePendingApprovalsDb(input = {}) {
  if (!hasSupabaseEnv()) return listGuidePendingApprovalsInMemory(input);

  const guideId = String(input?.guideId || '').trim();
  const supabase = await getSupabase();

  const { data: rows, error } = await supabase
    .from('bookings')
    .select(
      'id, booking_no, start_at, participants, guide_approval_status, status, created_at, ' +
        'activity_id, order_id, activities(title), activity_plans(name), ' +
        'orders!fk_bookings_order_id(contact_name, total_twd)'
    )
    .eq('guide_id', guideId)
    .eq('guide_approval_status', 'pending')
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);

  return (rows ?? []).map((row) => {
    const activity = Array.isArray(row.activities) ? row.activities[0] : row.activities;
    const plan = Array.isArray(row.activity_plans) ? row.activity_plans[0] : row.activity_plans;
    const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;
    return {
      bookingId: row.id,
      bookingNo: row.booking_no,
      tourTitle: activity?.title ?? '',
      planName: plan?.name ?? '',
      guestName: order?.contact_name ?? '未知',
      startAt: row.start_at,
      partySize: row.participants,
      totalTwd: order?.total_twd ?? null,
      createdAt: row.created_at,
    };
  });
}

function listGuidePendingApprovalsInMemory(input = {}) {
  const guideId = String(input?.guideId || '').trim();
  const result = [];
  for (const row of v2BookingApprovalStore.values()) {
    if (row.guide_approval_status !== 'pending' || row.status !== 'draft') continue;
    if (guideId && row.guide_id && row.guide_id !== guideId) continue;
    result.push({
      bookingId: row.id,
      bookingNo: row.booking_no,
      tourTitle: row.tour_title ?? '',
      planName: row.plan_name ?? '',
      guestName: row.guest_name ?? '未知',
      startAt: row.start_at ?? null,
      partySize: row.party_size ?? null,
      totalTwd: row.total_twd ?? null,
      createdAt: row.created_at ?? null,
    });
  }
  return result;
}

