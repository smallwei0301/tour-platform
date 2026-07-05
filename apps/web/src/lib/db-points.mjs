// @ts-check
/**
 * Issue #1594 — 點數 ledger 資料存取（strangler 領域檔，不進 db.mjs）。
 *
 * 計算邏輯在 points-calc.mjs（純函式）。此檔負責讀 ledger、發點（冪等）、折抵。
 * 餘額永遠由 availableBalance(ledger) 得出，不存快照。
 */
import { hasSupabaseEnv, getSupabase } from './db.mjs';
import { calcEarnedPoints, availableBalance, maxRedeemable, POINTS_CONFIG } from './points-calc.mjs';

/** in-memory fallback（測試 seam）。 */
/** @type {Array<{ id: string, user_id: string, delta: number, reason: string, order_id: string|null, expires_at: string|null, created_at: string }>} */
const _memLedger = [];
let _memSeq = 0;
export function __resetMemLedger() { _memLedger.length = 0; _memSeq = 0; }
export function __getMemLedger() { return _memLedger.slice(); }

function addMonthsIso(iso, months) {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

/**
 * 使用者可用餘額（排除過期）。
 * @param {{ userId: string, now?: string }} input
 * @returns {Promise<number>}
 */
export async function getPointsBalanceDb({ userId, now } = /** @type {any} */ ({})) {
  const uid = String(userId || '').trim();
  if (!uid) return 0;
  const nowIso = now || new Date().toISOString();
  const entries = await loadLedger(uid);
  return availableBalance(entries, nowIso);
}

/**
 * 訂單完成發點（冪等：同 order 的 earn_order 只發一次）。
 * @param {{ userId: string, orderId: string, paidTwd: number, now?: string }} input
 * @returns {Promise<{ earned: number, alreadyEarned: boolean }>}
 */
export async function earnPointsForOrderDb({ userId, orderId, paidTwd, now } = /** @type {any} */ ({})) {
  const uid = String(userId || '').trim();
  const oid = String(orderId || '').trim();
  if (!uid || !oid) return { earned: 0, alreadyEarned: false };
  const nowIso = now || new Date().toISOString();
  const earned = calcEarnedPoints(paidTwd);
  if (earned <= 0) return { earned: 0, alreadyEarned: false };

  const entry = {
    user_id: uid, delta: earned, reason: 'earn_order', order_id: oid,
    expires_at: addMonthsIso(nowIso, POINTS_CONFIG.expiryMonths), created_at: nowIso,
  };

  if (!hasSupabaseEnv()) {
    if (_memLedger.some((e) => e.order_id === oid && e.reason === 'earn_order')) {
      return { earned: 0, alreadyEarned: true };
    }
    _memLedger.push({ id: `pts_${String(++_memSeq).padStart(6, '0')}`, ...entry });
    return { earned, alreadyEarned: false };
  }
  const supabase = await getSupabase();
  const { error } = await supabase.from('user_points_ledger').insert(entry);
  // 唯一約束（order_id, reason）→ 重複發點被 DB 擋（冪等）
  if (error) return { earned: 0, alreadyEarned: true };
  return { earned, alreadyEarned: false };
}

/**
 * 折抵：扣點（不超過 min(餘額, 訂單×上限)）。回實際折抵點數。
 * @param {{ userId: string, orderId: string, requestPoints: number, orderTwd: number, now?: string }} input
 * @returns {Promise<{ redeemed: number }>}
 */
export async function redeemPointsForOrderDb({ userId, orderId, requestPoints, orderTwd, now } = /** @type {any} */ ({})) {
  const uid = String(userId || '').trim();
  const oid = String(orderId || '').trim();
  if (!uid || !oid) return { redeemed: 0 };
  const nowIso = now || new Date().toISOString();
  const balance = await getPointsBalanceDb({ userId: uid, now: nowIso });
  const cap = maxRedeemable(balance, orderTwd);
  const redeemed = Math.min(cap, Math.max(0, Math.trunc(Number(requestPoints) || 0)));
  if (redeemed <= 0) return { redeemed: 0 };

  const entry = { user_id: uid, delta: -redeemed, reason: 'redeem_order', order_id: oid, expires_at: null, created_at: nowIso };
  if (!hasSupabaseEnv()) {
    if (_memLedger.some((e) => e.order_id === oid && e.reason === 'redeem_order')) return { redeemed: 0 };
    _memLedger.push({ id: `pts_${String(++_memSeq).padStart(6, '0')}`, ...entry });
    return { redeemed };
  }
  const supabase = await getSupabase();
  const { error } = await supabase.from('user_points_ledger').insert(entry);
  if (error) return { redeemed: 0 };
  return { redeemed };
}

/**
 * @param {string} uid
 * @returns {Promise<Array<{ delta: number, expiresAt: string|null }>>}
 */
async function loadLedger(uid) {
  if (!hasSupabaseEnv()) {
    return _memLedger.filter((e) => e.user_id === uid).map((e) => ({ delta: e.delta, expiresAt: e.expires_at }));
  }
  const supabase = await getSupabase();
  const { data } = await supabase.from('user_points_ledger').select('delta, expires_at').eq('user_id', uid);
  return (Array.isArray(data) ? data : []).map((e) => ({ delta: e.delta, expiresAt: e.expires_at }));
}
