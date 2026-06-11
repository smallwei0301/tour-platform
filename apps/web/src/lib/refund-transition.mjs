/**
 * Issue #1385 — admin refund 動作的狀態機（純函式，離線可單測）。
 * db.mjs（Supabase）與 admin.mjs（in-memory fallback）共用同一份轉移規則。
 *
 * 已知分歧（保持零行為變更，另開 issue 追蹤）：reject 時 fallback 依
 * hasPaidAt 回 'paid' 或 'pending_payment'，Supabase 分支歷史行為固定傳
 * hasPaidAt:true（一律回 'paid'）— 未付款訂單在 production 會被誤標 paid。
 */

/**
 * @param {'approve'|'reject'|'process'|'complete'} action
 * @param {{ now: string, hasPaidAt: boolean }} ctx
 * @returns {{
 *   refundStatus: string,
 *   orderStatus: string,
 *   refundPatch: { status: string, approved_at?: string, refunded_at?: string },
 *   completesPayment: boolean,
 * }}
 */
export function resolveAdminRefundTransition(action, { now, hasPaidAt }) {
  switch (action) {
    case 'approve':
      return {
        refundStatus: 'approved',
        orderStatus: 'refund_pending',
        refundPatch: { status: 'approved', approved_at: now },
        completesPayment: false,
      };
    case 'reject':
      return {
        refundStatus: 'rejected',
        orderStatus: hasPaidAt ? 'paid' : 'pending_payment',
        refundPatch: { status: 'rejected' },
        completesPayment: false,
      };
    case 'process':
      return {
        refundStatus: 'processing',
        orderStatus: 'refund_pending',
        refundPatch: { status: 'processing' },
        completesPayment: false,
      };
    case 'complete':
      return {
        refundStatus: 'refunded',
        orderStatus: 'refunded',
        refundPatch: { status: 'refunded', refunded_at: now },
        completesPayment: true,
      };
    default:
      throw new Error('invalid refund action');
  }
}
