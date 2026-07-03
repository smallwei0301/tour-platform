/**
 * Issue #1565 — 電子憑證核銷資料層（獨立領域檔，遵守 #1385/#1570 strangler 硬規則：
 * 新資料存取不進 db.mjs 單體）。
 *
 * Supabase 分支與 in-memory fallback 同回傳 shape：
 *   { redeemed: bool, alreadyRedeemed: bool, status: string, reason: string }
 *
 * 冪等：compare-and-swap（eq status confirmed）；已 completed → alreadyRedeemed（非錯誤）。
 * 核銷只翻轉訂單狀態（不動容量），與 db-auto-complete 同性質。
 */
import { hasSupabaseEnv, getSupabase } from './db.mjs';
import { orders as memOrders } from './store.mjs';
import { appendAuditLog, insertAuditLogDb } from './audit-log.mjs';
import { evaluateRedeemEligibility } from './redeem-eligibility.mjs';

const AUDIT_ACTION = 'order_voucher_redeemed';

export async function redeemVoucherDb({ orderId, guideId, now } = {}) {
  const id = String(orderId || '');
  if (!id) throw new Error('orderId is required');
  const nowIso = now ? new Date(now).toISOString() : new Date().toISOString();

  if (!hasSupabaseEnv()) {
    return redeemVoucherInMemory({ orderId: id, guideId, nowIso });
  }

  const supabase = await getSupabase();
  const { data: order, error } = await supabase
    .from('orders')
    .select('id, status, bookings!fk_bookings_order_id(guide_id)')
    .eq('id', id)
    .single();
  if (error || !order) {
    return { redeemed: false, alreadyRedeemed: false, status: null, reason: 'not_found' };
  }
  const booking = Array.isArray(order.bookings) ? order.bookings[0] : order.bookings;
  const orderGuideId = booking?.guide_id ?? null;

  const verdict = evaluateRedeemEligibility({ status: order.status, orderGuideId, requestingGuideId: guideId });
  if (!verdict.ok) {
    return { redeemed: false, alreadyRedeemed: verdict.alreadyRedeemed, status: order.status, reason: verdict.reason };
  }

  const { data: updated, error: updateErr } = await supabase
    .from('orders')
    .update({ status: 'completed', updated_at: nowIso })
    .eq('id', id)
    .eq('status', 'confirmed')
    .select('id');
  if (updateErr) {
    return { redeemed: false, alreadyRedeemed: false, status: order.status, reason: 'update_failed' };
  }
  const didUpdate = Array.isArray(updated) && updated.length > 0;
  if (didUpdate) {
    try {
      await insertAuditLogDb(supabase, {
        orderId: id, actor: 'guide', action: AUDIT_ACTION,
        metadata: { initiatedBy: 'guide-redeem', guideId: guideId ?? null },
      });
    } catch (auditErr) {
      console.error('[voucher-redeem] audit error:', auditErr?.message || auditErr);
    }
  }
  return { redeemed: didUpdate, alreadyRedeemed: false, status: 'completed', reason: didUpdate ? 'redeemed' : 'already_redeemed' };
}

function redeemVoucherInMemory({ orderId, guideId, nowIso }) {
  const order = memOrders.find((o) => o.id === orderId);
  if (!order) return { redeemed: false, alreadyRedeemed: false, status: null, reason: 'not_found' };

  const orderGuideId = order.guideId ?? null;
  const verdict = evaluateRedeemEligibility({ status: order.status, orderGuideId, requestingGuideId: guideId });
  if (!verdict.ok) {
    return { redeemed: false, alreadyRedeemed: verdict.alreadyRedeemed, status: order.status, reason: verdict.reason };
  }
  order.status = 'completed';
  order.updatedAt = nowIso;
  appendAuditLog({
    orderId, actor: 'guide', action: AUDIT_ACTION,
    metadata: { initiatedBy: 'guide-redeem', guideId: guideId ?? null },
  });
  return { redeemed: true, alreadyRedeemed: false, status: 'completed', reason: 'redeemed' };
}
