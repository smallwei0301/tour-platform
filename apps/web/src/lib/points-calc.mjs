// @ts-check
/**
 * Issue #1594 — 點數/會員（純函式計算）。
 *
 * agent 選定預設（owner 可調，見 #1594 決策留言）：模式 A 點數回饋、回饋率 1%、效期 12 個月、
 * 單筆折抵上限＝訂單金額 30%。餘額永遠由 append-only ledger 加總（含效期），不存快照。
 * 純函式收 ledger entries 與時間為參數，方便單測；不碰 DB／不需 migration。
 */

export const POINTS_CONFIG = Object.freeze({
  earnRate: 0.01, // 1% 回饋（無條件捨去到整數點）
  expiryMonths: 12,
  redeemMaxRatio: 0.3, // 單筆折抵上限＝訂單金額 30%
});

/**
 * 訂單完成時的回饋點數（無條件捨去；退款金額不回饋）。
 * @param {number} paidTwd - 實付金額（不含點數折抵部分）
 * @returns {number}
 */
export function calcEarnedPoints(paidTwd) {
  const paid = Math.max(0, Math.trunc(Number(paidTwd) || 0));
  return Math.floor(paid * POINTS_CONFIG.earnRate);
}

/**
 * 可用餘額（排除已過期的正向 entries）＝ Σ(未過期 delta)，下限 0。
 * ledger 為 append-only：earn 為正（帶 expiresAt）、redeem/expire/退款回收 為負。
 * @param {Array<{ delta: number, expiresAt?: string | null }>} entries
 * @param {string} now - ISO
 * @returns {number}
 */
export function availableBalance(entries, now) {
  const t = Date.parse(String(now ?? ''));
  const list = Array.isArray(entries) ? entries : [];
  let bal = 0;
  for (const e of list) {
    const delta = Math.trunc(Number(e?.delta) || 0);
    if (delta > 0) {
      const exp = e?.expiresAt ? Date.parse(String(e.expiresAt)) : NaN;
      if (Number.isFinite(exp) && Number.isFinite(t) && exp <= t) continue; // 已過期的回饋不計
    }
    bal += delta;
  }
  return Math.max(0, bal);
}

/**
 * 本筆訂單可折抵的最大點數＝min(可用餘額, 訂單金額 × 上限比例)。
 * @param {number} balance
 * @param {number} orderTwd
 * @returns {number}
 */
export function maxRedeemable(balance, orderTwd) {
  const b = Math.max(0, Math.trunc(Number(balance) || 0));
  const order = Math.max(0, Math.trunc(Number(orderTwd) || 0));
  return Math.min(b, Math.floor(order * POINTS_CONFIG.redeemMaxRatio));
}
