/**
 * Issue #1565 — 電子憑證核銷資格判斷（純函式，可脫離 Supabase 單測）。
 *
 * 導遊掃碼/輸碼核銷時，把訂單 confirmed → completed。
 * - 只有訂單所屬導遊可核銷（orderGuideId === requestingGuideId）。
 * - 只有 confirmed 可核銷；completed 視為「已核銷」（冪等 no-op，非錯誤）。
 * - 其餘狀態（pending_payment/paid/cancelled/refund…）不可核銷。
 */
export function evaluateRedeemEligibility({ status, orderGuideId, requestingGuideId } = {}) {
  if (orderGuideId != null && requestingGuideId != null && String(orderGuideId) !== String(requestingGuideId)) {
    return { ok: false, alreadyRedeemed: false, reason: 'not_owner' };
  }
  if (status === 'completed') {
    return { ok: false, alreadyRedeemed: true, reason: 'already_redeemed' };
  }
  if (status !== 'confirmed') {
    return { ok: false, alreadyRedeemed: false, reason: 'not_confirmed' };
  }
  return { ok: true, alreadyRedeemed: false, reason: 'eligible' };
}
