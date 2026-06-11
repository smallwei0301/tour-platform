/**
 * Issue #1387 — 旅客 profile 驗證與通知偏好（純函式，離線可測）。
 */

const PHONE_RE = /^(09\d{8}|\+8869\d{8})$/;
const DISPLAY_NAME_MAX = 50;

/** 交易類信件（訂單/付款/退款/行程後評論邀請/訂單留言通知）— 不受行銷 opt-out 影響。 */
export const TRANSACTIONAL_EMAIL_KINDS = Object.freeze([
  'order_confirmation',
  'payment_receipt',
  'refund_update',
  'review_invitation',
  'order_message',
]);

/**
 * @param {{ displayName?: unknown, phone?: unknown, marketingEmailOptIn?: unknown }} input
 * @returns {{ ok: true, value: { displayName: string, phone: string, marketingEmailOptIn: boolean|null } }
 *          | { ok: false, error: { code: string, message: string } }}
 */
export function validateTravelerProfileInput(input = {}) {
  const displayName = String(input.displayName ?? '').trim();
  if (displayName.length > DISPLAY_NAME_MAX) {
    return { ok: false, error: { code: 'INVALID_DISPLAY_NAME', message: `顯示名稱最長 ${DISPLAY_NAME_MAX} 字` } };
  }

  const rawPhone = String(input.phone ?? '').replace(/[\s-]/g, '');
  if (rawPhone && !PHONE_RE.test(rawPhone)) {
    return { ok: false, error: { code: 'INVALID_PHONE', message: '電話格式須為 09xxxxxxxx 或 +8869xxxxxxxx' } };
  }

  return {
    ok: true,
    value: {
      displayName,
      phone: rawPhone,
      marketingEmailOptIn:
        input.marketingEmailOptIn === undefined ? null : Boolean(input.marketingEmailOptIn),
    },
  };
}

/**
 * 行銷信遵守 opt-in；交易信一律寄送。無 profile 視為未表態（opt-out 模型 → 可寄）。
 * @param {string} kind
 * @param {{ marketingEmailOptIn?: boolean }|null|undefined} profile
 */
export function shouldSendEmailKind(kind, profile) {
  if (TRANSACTIONAL_EMAIL_KINDS.includes(kind)) return true;
  if (!profile || profile.marketingEmailOptIn == null) return true;
  return Boolean(profile.marketingEmailOptIn);
}
