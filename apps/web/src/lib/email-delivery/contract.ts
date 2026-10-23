/**
 * email 寄送契約的純判斷邏輯（#1911）。
 * 從 email.ts 拆出（email.ts 受 architecture-ratchet-guard 行數天花板管制）。
 * 不 import email.ts、不碰 provider／網路，方便單測。
 */

export type EmailFailureCode = 'EMAIL_PROVIDER_NOT_CONFIGURED' | 'EMAIL_SEND_FAILED' | 'NO_GUIDE_EMAIL' | 'NO_RECIPIENT';

/** 沒有收件人永遠不該寄，與 provider 是否設定無關；有收件人回 null。 */
export function checkRecipient(to: unknown): {
  ok: false;
  status: 'skipped';
  errorCode: 'NO_RECIPIENT';
  errorMessage: string;
  retriable: false;
} | null {
  if (typeof to === 'string' && to.trim() !== '') return null;
  return { ok: false, status: 'skipped', errorCode: 'NO_RECIPIENT', errorMessage: 'recipient is empty', retriable: false };
}

/** provider 失敗（throw 或 error 回傳）的統一結果欄位。 */
export function failedDelivery(errorMessage: string) {
  return { ok: false as const, status: 'failed' as const, errorCode: 'EMAIL_SEND_FAILED' as const, errorMessage, retriable: true };
}

/**
 * Resend SDK 失敗通常不 throw，而是回 { data: null, error }。
 * error 存在或缺 data.id 都不算寄出；errorMessage 只取 error.message，不含 header／整個 error 物件。
 */
export function interpretSendResult(
  result: { data?: { id?: string } | null; error?: { message?: unknown } | null } | null | undefined,
) {
  const messageId = result?.data?.id;
  if (!result?.error && messageId) return { ok: true as const, status: 'sent' as const, messageId };
  return failedDelivery(
    result?.error ? String(result.error.message ?? 'unknown provider error') : 'provider returned no message id',
  );
}
