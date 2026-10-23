/**
 * #1923 — 評論邀請 sweep：把 sendReviewInvitation 的回傳值轉成「計數增量＋要寫入
 * review_invitations 的列」。純函式，不碰 DB／email。
 *
 * 背景：sendReviewInvitation 失敗時不 throw，而是回 { ok:false, status, errorCode, ... }。
 * 舊 route 沒讀回傳值就當成功，導致失敗也被記成 sent。
 *
 * DB CHECK（20260604_issue1174_review_invitations.sql）：
 *   status ∈ sent | failed | suppressed；initiated_by ∈ admin_manual | cron
 * 注意 evaluateReviewInvitationIdempotency 只看 status==='sent'，suppressed 並不會阻止
 * 重寄，所以 NO_RECIPIENT 也寫 failed（誠實反映「未寄出」），不使用 suppressed。
 *
 * 隱私：failure_reason 只放 errorCode，不放 email 或 errorMessage。
 */

export const SWEEP_INITIATED_BY = 'cron';

/** provider 未設定是環境問題，不是該訂單的問題：計入 failed，但不寫列（避免每天累積假失敗紀錄）。 */
const NO_ROW_ERROR_CODES = new Set(['EMAIL_PROVIDER_NOT_CONFIGURED']);

/**
 * @param {{ result: any, orderId: string, nowIso: string }} input
 * @returns {{ countDelta: { sent: number, failed: number }, row: Record<string, any> | null }}
 */
export function planSweepDelivery({ result, orderId, nowIso }) {
  if (result && result.ok === true) {
    const row = {
      order_id: orderId,
      status: 'sent',
      initiated_by: SWEEP_INITIATED_BY,
      sent_at: nowIso,
    };
    if (typeof result.messageId === 'string' && result.messageId) {
      row.provider_message_id = result.messageId;
    }
    return { countDelta: { sent: 1, failed: 0 }, row };
  }

  const errorCode =
    typeof result?.errorCode === 'string' && result.errorCode ? result.errorCode : 'EMAIL_SEND_FAILED';

  if (NO_ROW_ERROR_CODES.has(errorCode)) {
    return { countDelta: { sent: 0, failed: 1 }, row: null };
  }

  return {
    countDelta: { sent: 0, failed: 1 },
    row: {
      order_id: orderId,
      status: 'failed',
      initiated_by: SWEEP_INITIATED_BY,
      failed_at: nowIso,
      failure_reason: errorCode,
    },
  };
}
