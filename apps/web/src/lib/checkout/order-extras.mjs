// @ts-check
/**
 * Issue #1594 — checkout 點數折抵的下單期套用（strangler 子資料夾，
 * 從 app/api/v2/bookings/draft/route.ts 抽出，讓 route 只留最小接線）。
 *
 * 核心規則：**server 一律以 DB 快照重算金額，不信任前端數字**。
 * - 加購已在 #1812 的 atomic materialization RPC 內驗證、快照及併入總額；本檔不再
 *   寫加購，避免 commit 後 fail-soft 路徑重現不一致。
 * - 點數：redeemPointsForOrderDb 夾在 min(餘額, 訂單×30%)，扣點寫 ledger（冪等），
 *   折抵金額落 orders.discount_amount 並下修 total_twd。
 * points 目前仍是 #1813 待收斂的 fail-soft seam。
 */
import { redeemPointsForOrderDb } from '../db-points.mjs';

/**
 * 正規化前端傳入的加購選擇：只取形狀正確項，數量夾 1..99，最多 20 項。金額不在此算。
 * @param {unknown} raw
 * @returns {Array<{ addonId: string, quantity: number }>}
 */
export function normalizeAddonSelections(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s) => !!s && typeof s === 'object'
      && typeof (/** @type {any} */ (s).addonId) === 'string'
      && Number.isInteger(/** @type {any} */ (s).quantity))
    .slice(0, 20)
    .map((s) => ({
      addonId: /** @type {any} */ (s).addonId,
      quantity: Math.max(1, Math.min(99, /** @type {any} */ (s).quantity)),
    }));
}

/**
 * #1812 後僅套用點數折抵，回傳更新後的訂單總額（已寫回 DB）。
 * @param {{
 *   supabase: any, orderId: string, activityId: string, participants: number,
 *   travelerId?: string|null, totalAmount: number, redeemPoints?: unknown,
 * }} input
 * @returns {Promise<{ totalAmount: number, addonTotal: number, redeemed: number }>}
 */
export async function applyOrderExtras({
  supabase, orderId, activityId, participants, travelerId, totalAmount,
  redeemPoints,
} = /** @type {any} */ ({})) {
  let total = Number(totalAmount) || 0;
  let redeemed = 0;

  // #1594 點數折抵：以（base＋加購後）金額為基準，server 夾 min(餘額, 訂單×30%)。僅登入旅客。
  const wantPoints = Math.trunc(Number(redeemPoints) || 0);
  if (travelerId && wantPoints > 0) {
    try {
      const redeemResult = await redeemPointsForOrderDb({
        userId: travelerId, orderId, requestPoints: wantPoints,
        orderTwd: total, now: new Date().toISOString(),
      });
      redeemed = Number(redeemResult?.redeemed) || 0;
      if (redeemed > 0) {
        total = Math.max(0, total - redeemed);
        await supabase.from('orders')
          .update({ total_twd: total, discount_amount: redeemed })
          .eq('id', orderId);
      }
    } catch (redeemErr) {
      console.error('[order-extras] points redeem failed (non-fatal):', redeemErr);
    }
  }

  return { totalAmount: total, addonTotal: 0, redeemed };
}
