/**
 * 退款 → 出帳 ledger 的同步線路（Issue #1777 退款鏈修復）。
 *
 * 為什麼獨立成一支 .mjs 而不是留在 route.ts：
 *   本 repo 的 route 是 .ts、測試是 Node 內建 runner 的 .mjs，無 TS loader，因此
 *   route 只能寫 source-string 測試——#1777 的兩個 P0（F1 覆寫、F2 撞鍵）正是
 *   source-string 測試看不出來的那一類：字串都在、傳的值錯。把決策邏輯搬到
 *   可 import 的模組後，才能用**行為測試**斷言「實際傳了什麼」。
 *
 * 分工（單一 writer 原則，owner 決策 C）：
 *   - 本模組只做兩件事：退款前的「剩餘可退」把關，以及把本次退款額交給 RPC。
 *   - `operations_tracking.refund_amount_twd` 的累加與 ledger 差額由
 *     `fn_apply_refund_adjustment_atomic` 在單一交易內完成——應用層**不得**再
 *     自行 read-modify-write 該欄位（那是 F1 的成因）。
 */

import { applyRefundAdjustmentAtomicDb } from './db-settlement-atomic.mjs';

/** 本次退款額超過「訂單總額 − 累積已退」時的錯誤碼。 */
export const REFUND_EXCEEDS_REMAINING_CODE = 'REFUND_EXCEEDS_REMAINING';

/**
 * 讀取該訂單目前的累積退款額。
 *
 * 這是**退款前**的把關用值，刻意不做任何寫入；真正的累加在 RPC 交易內完成。
 * 讀不到列（尚無 ops 追蹤）視為 0。
 *
 * @param {any} supabase service-role Supabase client
 * @param {string} orderId
 * @returns {Promise<{ok: boolean, cumulativeRefundTwd: number, error?: string}>}
 */
export async function readCumulativeRefundTwd(supabase, orderId) {
  if (!orderId) return { ok: false, cumulativeRefundTwd: 0, error: 'orderId is required' };

  const { data, error } = await supabase
    .from('operations_tracking')
    .select('refund_amount_twd')
    .eq('order_id', orderId)
    .maybeSingle();

  if (error) {
    return { ok: false, cumulativeRefundTwd: 0, error: error.message || 'failed to read operations_tracking' };
  }

  return { ok: true, cumulativeRefundTwd: Number(data?.refund_amount_twd) || 0 };
}

/**
 * 本次退款額是否落在「剩餘可退」之內。
 *
 * 為什麼需要這道關：`resolveRefundAmount`（refund-execute.ts）只驗
 * `refundAmount ≤ total`，沒扣掉已退部分。NT$1,000 的訂單連退兩次 800 都會通過
 * 驗證，累積退款 1,600 > 總額——錢已經從 provider 出去，事後只能人工追。
 *
 * 純函式，無 I/O，方便逐案舉證。
 *
 * @param {{totalTwd: number, cumulativeRefundTwd: number, refundAmountTwd: number}} input
 * @returns {{ok: boolean, remainingTwd: number, reason?: string}}
 */
export function checkRefundWithinRemaining({ totalTwd, cumulativeRefundTwd, refundAmountTwd } = {}) {
  const total = Number(totalTwd) || 0;
  const already = Number(cumulativeRefundTwd) || 0;
  const amount = Number(refundAmountTwd) || 0;
  const remaining = Math.max(0, total - already);

  if (amount <= 0) {
    return { ok: false, remainingTwd: remaining, reason: 'refund amount must be positive' };
  }
  if (amount > remaining) {
    return {
      ok: false,
      remainingTwd: remaining,
      reason: `refund amount ${amount} exceeds remaining refundable ${remaining}`
        + `（訂單總額 ${total}，已退 ${already}）`,
    };
  }
  return { ok: true, remainingTwd: remaining };
}

/**
 * 把「本次退了多少」交給原子 RPC：累積額累加 ＋ ledger 差額 ＋ 餘額同步同交易完成。
 *
 * 呼叫端只需要知道本次金額——累積額、冪等鍵、差額全部由 DB 端在鎖內推導，
 * 應用層無從傳錯（F1／F2 的修法）。
 *
 * @param {any} supabase service-role Supabase client
 * @param {{orderId: string, refundDeltaTwd: number, actor?: string}} input
 * @returns {Promise<{order_id: string, guide_id: string|null, refund_event_id: string,
 *   cumulative_refund_twd: number, target_net_twd: number, previous_net_twd: number,
 *   delta_twd: number, applied: boolean, settled: boolean,
 *   carry_forward_twd: number, balance_after: number, over_refund: boolean}>}
 */
export async function syncRefundToPayoutLedger(supabase, { orderId, refundDeltaTwd, actor = 'refund-execute' } = {}) {
  return applyRefundAdjustmentAtomicDb(supabase, { orderId, refundDeltaTwd, actor });
}
