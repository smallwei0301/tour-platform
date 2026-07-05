// @ts-check
/**
 * Issue #1591 / #1594 — checkout 加購＋點數折抵的下單期套用（strangler 子資料夾，
 * 從 app/api/v2/bookings/draft/route.ts 抽出，讓 route 只留最小接線）。
 *
 * 核心規則：**server 一律以 DB 快照重算金額，不信任前端數字**。
 * - 加購：persistOrderAddonsDb 以 activity_addons 現價重算、只落成功項；小計加進總額。
 * - 點數：redeemPointsForOrderDb 夾在 min(餘額, 訂單×30%)，扣點寫 ledger（冪等），
 *   折抵金額落 orders.discount_amount 並下修 total_twd。
 * 任何一步失敗一律 fail-soft：訂單本體不因加購/折抵失敗而中斷。
 */
import { persistOrderAddonsDb } from '../db-addons.mjs';
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
 * 下單後套用加購＋點數折抵，回傳更新後的訂單總額（已寫回 DB）。fail-soft。
 * @param {{
 *   supabase: any, orderId: string, activityId: string, participants: number,
 *   travelerId?: string|null, totalAmount: number,
 *   addonSelections?: unknown, redeemPoints?: unknown,
 * }} input
 * @returns {Promise<{ totalAmount: number, addonTotal: number, redeemed: number }>}
 */
export async function applyOrderExtras({
  supabase, orderId, activityId, participants, travelerId, totalAmount,
  addonSelections, redeemPoints,
} = /** @type {any} */ ({})) {
  let total = Number(totalAmount) || 0;
  let addonTotal = 0;
  let redeemed = 0;

  // #1591 加購：DB 快照重算 → 併入總額。ECPay checkout 讀 orders.total_twd。
  const sels = normalizeAddonSelections(addonSelections);
  if (sels.length > 0) {
    try {
      const addonResult = await persistOrderAddonsDb({
        orderId, activityId, selections: sels, peopleCount: participants,
      });
      addonTotal = Number(addonResult?.total) || 0;
      if (addonTotal > 0) {
        total += addonTotal;
        await supabase.from('orders').update({ total_twd: total }).eq('id', orderId);
      }
    } catch (addonErr) {
      console.error('[order-extras] addon persist failed (non-fatal):', addonErr);
    }
  }

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

  return { totalAmount: total, addonTotal, redeemed };
}
