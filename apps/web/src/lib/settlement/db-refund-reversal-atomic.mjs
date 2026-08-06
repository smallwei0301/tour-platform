/**
 * 退款紅沖的原子寫入層（Issue #1777 F4，owner 決策 C）。
 *
 * 取代 `db.mjs` 裡那支約 250 行的 `recordRefundReversalDb` 實作 —— 它是本 issue
 * 四個缺口裡唯一沒被改掉的應用層 read-modify-write，而且仍在 live 退款路徑上。
 *
 * 舊實作的核心問題：讀 `guide_balances` → 在 JS 算新餘額 → 寫回**絕對值**。
 *   - 併發 writer 會互相蓋掉（lost update）；
 *   - 新餘額是從可能過期的讀值＋audit marker 的歷史值湊出來的，湊法有三個分支；
 *   - reversal 分錄寫成功但餘額扣失敗時，重跑會走 already_reversed →「餘額永久
 *     漏扣」。舊版用 `status: 'started'` 的 audit marker 想補這個洞，但 marker
 *     機制本身也不是原子的。
 *
 * 新實作把整包交給 `fn_record_refund_reversal_atomic`：與 `orders FOR UPDATE`
 * 同交易，冪等直接由 `payout_items` 的部分唯一索引判定（只有真正插入新分錄才動
 * 餘額），餘額改成 SQL 層 `balance + delta`。marker 機制因此整個消失。
 *
 * 回傳形狀刻意與舊版逐字相容（呼叫端與既有測試不需要改判定邏輯）：
 *   - `{ skipped: 'pre_settlement' }`   尚未結算，零寫入
 *   - `{ skipped: 'already_reversed' }` 已紅沖，零寫入、不重複扣款
 *   - `{ reversed: true, repaired: true, reversal_id, before_balance, after_balance }`
 */

import { RPC_MISSING_CODE } from './db-settlement-atomic.mjs';

const RPC_NAME = 'fn_record_refund_reversal_atomic';
const PGRST_FN_NOT_FOUND = 'PGRST202';

function isMissingFunctionError(error) {
  if (!error) return false;
  if (error.code === PGRST_FN_NOT_FOUND) return true;
  const message = String(error.message ?? '');
  return /could not find the function|does not exist/i.test(message)
    && new RegExp(RPC_NAME, 'i').test(message);
}

function toError(error) {
  if (isMissingFunctionError(error)) {
    const err = new Error(
      `${RPC_MISSING_CODE}: 原子紅沖 RPC 尚未套用至資料庫，已中止以避免非原子寫入。`
      + '請先套用 migration 20260804103000_issue1777_atomic_refund_reversal.sql。',
    );
    err.code = RPC_MISSING_CODE;
    return err;
  }
  const err = new Error(error?.message ?? 'refund reversal rpc failed');
  if (error?.code) err.code = error.code;
  return err;
}

/** PostgREST 對純量回傳可能包成陣列，統一取第一筆。 */
function firstRow(data) {
  if (Array.isArray(data)) return data[0] ?? null;
  return data ?? null;
}

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * 原子紅沖：reversal 分錄、餘額扣減、兩筆 audit 於單一交易同成同敗。
 *
 * 冪等：已有 reversal 分錄時回 `{ skipped: 'already_reversed' }` 且**不動餘額**。
 * 餘額允許扣成負數（carry-forward，#449 既有語意），刻意不截斷成 0。
 *
 * @param {any} supabase service-role Supabase client
 * @param {{orderId: string, actor?: string}} input
 * @returns {Promise<{skipped: string} | {reversed: true, repaired: true,
 *   reversal_id: string, before_balance: number, after_balance: number}>}
 */
export async function recordRefundReversalAtomicDb(supabase, { orderId, actor = 'system' } = {}) {
  if (!orderId) throw new Error('orderId is required');

  const { data, error } = await supabase.rpc(RPC_NAME, {
    p_order_id: orderId,
    p_actor: actor ?? 'system',
  });

  if (error) throw toError(error);

  const row = firstRow(data);
  if (!row) throw new Error(`${RPC_NAME} returned no row`);

  switch (row.outcome) {
    case 'pre_settlement':
      return { skipped: 'pre_settlement' };
    case 'already_reversed':
      return { skipped: 'already_reversed' };
    case 'reversed':
      return {
        reversed: true,
        repaired: true,
        reversal_id: String(row.reversal_id),
        before_balance: toNumber(row.before_balance),
        after_balance: toNumber(row.after_balance),
      };
    default:
      throw new Error(`${RPC_NAME} returned unknown outcome: ${String(row.outcome)}`);
  }
}
