/**
 * 結算與出款的原子寫入層（Issue #1777 Phase 2，owner 決策 C）。
 *
 * 這是 settlement／payout confirm 的**唯一 writer**：兩支函式各自把整組寫入
 * 交給資料庫端的單一交易（fn_record_settlement_atomic／fn_confirm_payout_atomic），
 * 應用層不再做 read-modify-write。
 *
 * 為什麼不放進 db.mjs：strangler 硬規則（#1385／#1570）——新的資料存取函式
 * 一律開領域檔，db.mjs 有只降不升的行數天花板 guard。
 *
 * fail-closed 契約：RPC 不存在（migration 尚未套用）時，兩支函式都拋出可辨識
 * 的錯誤，呼叫端據此中止並記錄；**絕不**退回舊的非原子路徑。寧可停擺也不要
 * 重複扣款或漏加餘額——這正是 #1777 要修的問題。
 */

/** RPC 尚未套用到資料庫時的可辨識錯誤碼。 */
export const RPC_MISSING_CODE = 'SETTLEMENT_RPC_NOT_DEPLOYED';

/** PostgREST 對「找不到函式」的錯誤碼。 */
const PGRST_FN_NOT_FOUND = 'PGRST202';

function isMissingFunctionError(error) {
  if (!error) return false;
  if (error.code === PGRST_FN_NOT_FOUND) return true;
  const message = String(error.message ?? '');
  return /could not find the function|does not exist/i.test(message)
    && /fn_record_settlement_atomic|fn_confirm_payout_atomic|fn_apply_refund_adjustment_atomic/i.test(message);
}

/**
 * 退款事件的確定性冪等鍵。
 *
 * 用「訂單 + 本次退款後的累積退款總額」而非隨機 id：同一次退款重送會得到相同
 * 的鍵（因此不重複記帳），而第二次部分退款因累積額不同而得到新鍵（因此各自
 * 留下一筆差額分錄）。這正是 #1777 要的冪等語意，且不需要外部事件 id。
 *
 * @param {string} orderId
 * @param {number} cumulativeRefundTwd 本次退款完成後的累積退款總額
 * @returns {string}
 */
export function buildRefundEventId(orderId, cumulativeRefundTwd) {
  return `${orderId}:cum:${Number(cumulativeRefundTwd) || 0}`;
}

function toError(error, fallbackMessage) {
  if (isMissingFunctionError(error)) {
    const err = new Error(
      `${RPC_MISSING_CODE}: 原子結算 RPC 尚未套用至資料庫，已中止以避免非原子寫入。`
      + '請先套用 migration 20260729160000_issue1777_atomic_settlement_and_payout_confirm.sql。',
    );
    err.code = RPC_MISSING_CODE;
    return err;
  }
  const err = new Error(error?.message ?? fallbackMessage);
  if (error?.code) err.code = error.code;
  return err;
}

/** PostgREST 對 RETURNS TABLE 的單列結果可能回陣列或物件，統一取第一列。 */
function firstRow(data) {
  if (Array.isArray(data)) return data[0] ?? null;
  return data ?? null;
}

/**
 * 原子寫入一批結算分錄與對應的導遊餘額增額。
 *
 * 冪等：以 payout_items 的 UNIQUE(order_id, settlement_kind) 為準，重送不會
 * 產生第二筆分錄，也不會重複累加餘額（DB 端只在真正插入新列時才動餘額）。
 * 資格於交易內重驗（completed／已實收／無 hold／未全額退款），JS 端讀取後
 * 才被標記爭議的訂單會被擋在 rejected 而非入帳。
 *
 * @param {any} supabase service-role Supabase client
 * @param {Array<{order_id: string, guide_id: string, gmv_twd: number,
 *   commission_twd: number, net_twd: number, rules_version?: string}>} items
 * @param {string|null} [settledAt] ISO 時間戳；省略則由 DB 用 now()
 * @returns {Promise<{settled_count: number, skipped_existing: number,
 *   rejected_ineligible: number, guides_updated: number, rejected_order_ids: string[]}>}
 */
export async function recordSettlementAtomicDb(supabase, items, settledAt = null) {
  const payload = Array.isArray(items) ? items : [];
  if (payload.length === 0) {
    return {
      settled_count: 0,
      skipped_existing: 0,
      rejected_ineligible: 0,
      guides_updated: 0,
      rejected_order_ids: [],
    };
  }

  const { data, error } = await supabase.rpc('fn_record_settlement_atomic', {
    p_items: payload,
    p_settled_at: settledAt,
  });

  if (error) throw toError(error, 'settlement rpc failed');

  const row = firstRow(data);
  if (!row) throw new Error('fn_record_settlement_atomic returned no row');

  return {
    settled_count: Number(row.settled_count ?? 0),
    skipped_existing: Number(row.skipped_existing ?? 0),
    rejected_ineligible: Number(row.rejected_ineligible ?? 0),
    guides_updated: Number(row.guides_updated ?? 0),
    rejected_order_ids: row.rejected_order_ids ?? [],
  };
}

/**
 * 原子確認出款：扣餘額、pending→paid、寫 audit 於單一交易完成。
 *
 * 冪等：同一 payout 重送回 `already_paid: true` 且不再扣款。
 * 餘額不足時 DB 端 RAISE（不截斷），錯誤原樣往上拋供 admin 介面顯示。
 *
 * @param {any} supabase service-role Supabase client
 * @param {string} payoutId
 * @param {string|null} confirmedBy
 * @param {string|null} transferRef
 * @returns {Promise<{payout_id: string, guide_id: string, total_twd: number,
 *   state: string, confirmed_at: string, transfer_ref: string|null,
 *   before_balance: number, after_balance: number, already_paid: boolean}>}
 */
export async function confirmPayoutAtomicDb(supabase, payoutId, confirmedBy = 'admin', transferRef = null) {
  if (!payoutId) throw new Error('payoutId is required');

  const { data, error } = await supabase.rpc('fn_confirm_payout_atomic', {
    p_payout_id: payoutId,
    p_confirmed_by: confirmedBy ?? 'admin',
    p_transfer_ref: transferRef ?? null,
  });

  if (error) throw toError(error, 'payout confirm rpc failed');

  const row = firstRow(data);
  if (!row) throw new Error('fn_confirm_payout_atomic returned no row');

  return {
    ...row,
    total_twd: Number(row.total_twd ?? 0),
    before_balance: Number(row.before_balance ?? 0),
    after_balance: Number(row.after_balance ?? 0),
    already_paid: row.already_paid === true,
  };
}

/**
 * 把訂單的 ledger 淨額調整到「未退款有效金額 × 導遊分潤率」，只追加本次差額。
 *
 * 決策 B（owner 2026-07-29）：`max(0, 總額 − 累積退款) × active rate`；
 * 每次退款只記差額，不重複全額紅沖。
 *
 * 冪等：以 refundEventId 為鍵，同一退款事件重送回 `applied: false`。
 * 尚未結算的訂單（無任何 ledger 分錄）不介入——結算前的退款由 sweep 的
 * effective-gmv 直接處理，避免對從未入帳的訂單記出負餘額。
 *
 * @param {any} supabase service-role Supabase client
 * @param {{orderId: string, refundEventId: string, actor?: string}} input
 * @returns {Promise<{order_id: string, guide_id: string|null, target_net_twd: number,
 *   previous_net_twd: number, delta_twd: number, applied: boolean,
 *   carry_forward_twd: number, balance_after: number}>}
 */
export async function applyRefundAdjustmentAtomicDb(supabase, { orderId, refundEventId, actor = 'refund-execute' } = {}) {
  if (!orderId) throw new Error('orderId is required');
  if (!refundEventId) throw new Error('refundEventId is required');

  const { data, error } = await supabase.rpc('fn_apply_refund_adjustment_atomic', {
    p_order_id: orderId,
    p_refund_event_id: refundEventId,
    p_actor: actor,
  });

  if (error) throw toError(error, 'refund adjustment rpc failed');

  const row = firstRow(data);
  if (!row) throw new Error('fn_apply_refund_adjustment_atomic returned no row');

  return {
    ...row,
    target_net_twd: Number(row.target_net_twd ?? 0),
    previous_net_twd: Number(row.previous_net_twd ?? 0),
    delta_twd: Number(row.delta_twd ?? 0),
    carry_forward_twd: Number(row.carry_forward_twd ?? 0),
    balance_after: Number(row.balance_after ?? 0),
    applied: row.applied === true,
  };
}
