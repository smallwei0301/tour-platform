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
import { hasSupabaseEnv, getSupabase } from './supabase-env.mjs';
import { orders as memOrders } from './store.mjs';
import { appendAuditLog, insertAuditLogDb } from './audit-log.mjs';
import { evaluateRedeemEligibility } from './redeem-eligibility.mjs';
import { grantCompletionRewards } from './rewards/order-completion-rewards.mjs';
import { shortCodeForOrder } from './voucher-token.mjs';

const AUDIT_ACTION = 'order_voucher_redeemed';

/** 短碼正規化：大小寫不拘、可省略 MID- 前綴、容忍空白與分隔符。 */
export function normalizeVoucherShortCode(input) {
  const raw = String(input || '').toUpperCase().replace(/[\s_]/g, '');
  const body = raw.startsWith('MID-') ? raw.slice(4) : raw.startsWith('MID') ? raw.slice(3) : raw;
  if (!/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/.test(body)) return null;
  return `MID-${body}`;
}

/**
 * #1637 導遊端核銷頁 — 以人類可讀短碼核銷（無法掃碼時的備援）。
 * 只在「該導遊自己的 confirmed/completed 訂單」範圍內比對短碼（ownership 先於比對，
 * 低熵短碼不會跨導遊撞單）；匹配 confirmed → 走 redeemVoucherDb 核銷、completed →
 * alreadyRedeemed、無匹配 → not_found。回傳額外附 orderId＋contactName＋peopleCount
 * 供導遊當場核對旅客身分。
 */
export async function redeemVoucherByShortCodeDb({ code, guideId, now } = {}) {
  const normalized = normalizeVoucherShortCode(code);
  if (!normalized) {
    return { redeemed: false, alreadyRedeemed: false, status: null, reason: 'invalid_code', orderId: null, contactName: null, peopleCount: null };
  }
  const nowIso = now ? new Date(now).toISOString() : new Date().toISOString();

  if (!hasSupabaseEnv()) {
    return redeemByShortCodeInMemory({ normalized, guideId, nowIso });
  }

  const supabase = await getSupabase();
  // 先取該導遊的 booking → order 集合（ownership 範圍），再撈 confirmed/completed 訂單比對短碼。
  const { data: bookingRows, error: bookingErr } = await supabase
    .from('bookings')
    .select('order_id')
    .eq('guide_id', guideId)
    .not('order_id', 'is', null)
    .limit(1000);
  if (bookingErr) throw new Error(bookingErr.message);
  const orderIds = [...new Set((bookingRows ?? []).map((b) => b.order_id))];
  if (orderIds.length === 0) {
    return { redeemed: false, alreadyRedeemed: false, status: null, reason: 'not_found', orderId: null, contactName: null, peopleCount: null };
  }

  const { data: orderRows, error: orderErr } = await supabase
    .from('orders')
    .select('id, status, contact_name, people_count')
    .in('id', orderIds)
    .in('status', ['confirmed', 'completed']);
  if (orderErr) throw new Error(orderErr.message);

  const match = (orderRows ?? []).find((o) => shortCodeForOrder(o.id) === normalized);
  if (!match) {
    return { redeemed: false, alreadyRedeemed: false, status: null, reason: 'not_found', orderId: null, contactName: null, peopleCount: null };
  }

  const extras = { orderId: match.id, contactName: match.contact_name ?? null, peopleCount: match.people_count ?? null };
  if (match.status === 'completed') {
    return { redeemed: false, alreadyRedeemed: true, status: 'completed', reason: 'already_redeemed', ...extras };
  }
  const result = await redeemVoucherDb({ orderId: match.id, guideId, now: nowIso });
  return { ...result, ...extras };
}

function redeemByShortCodeInMemory({ normalized, guideId, nowIso }) {
  // in-memory legacy 模型無 booking→guide 綁定；訂單無 guideId 時 ownership 檢查
  // 由 evaluateRedeemEligibility 的 null-safe 邏輯處理（本地/測試情境）。
  const match = memOrders.find(
    (o) => ['confirmed', 'completed'].includes(o.status) && shortCodeForOrder(o.id) === normalized
  );
  if (!match) {
    return { redeemed: false, alreadyRedeemed: false, status: null, reason: 'not_found', orderId: null, contactName: null, peopleCount: null };
  }
  const extras = { orderId: match.id, contactName: match.contactName ?? null, peopleCount: match.peopleCount ?? null };
  if (match.status === 'completed') {
    return { redeemed: false, alreadyRedeemed: true, status: 'completed', reason: 'already_redeemed', ...extras };
  }
  const result = redeemVoucherInMemory({ orderId: match.id, guideId, nowIso });
  return { ...result, ...extras };
}

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
    .select('id, status, user_id, total_twd, bookings!fk_bookings_order_id(guide_id)')
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
    // #1594 完成獎勵：發點（冪等）＋站內通知，best-effort。
    try {
      await grantCompletionRewards({ userId: order.user_id, orderId: id, paidTwd: order.total_twd, now: nowIso });
    } catch (rewardErr) {
      console.error('[voucher-redeem] reward error:', rewardErr?.message || rewardErr);
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
