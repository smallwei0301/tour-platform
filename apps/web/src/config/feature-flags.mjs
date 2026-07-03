function isTruthy(value) {
  if (!value) return false;
  const normalized = String(value).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

// Booking V2 flags（isBookingV2Enabled / isBookingV2ShellEnabled）已於 #1407 階段三退場：
// legacy booking 已退役，V2 為唯一路徑，不再有 flag 可回滾（退役紀錄見
// docs/operations/booking-v2-rollback-runbook.md）。

/**
 * LINE Messaging API for ops/admin notifications (migrated off the retired LINE Notify).
 * Default: OFF — rollout per docs/operations/issue-179-line-liff-rollout-support-sop.md.
 */
export function isLineMessagingEnabled(env = process.env) {
  return isTruthy(env.LINE_MESSAGING_ENABLED);
}

/**
 * Per-traveler LINE push (booking/payment/cancel/refund/reminder).
 * Default: OFF. Requires LINE_MESSAGING_ENABLED + a resolvable line_user_id binding.
 */
export function isLinePushEnabled(env = process.env) {
  return isTruthy(env.LINE_PUSH_ENABLED);
}

/**
 * Per-guide LINE push (notify the assigned guide on their own LINE).
 * Default: OFF. Requires LINE_MESSAGING_ENABLED + a guide_line_mapping binding.
 */
export function isLineGuidePushEnabled(env = process.env) {
  return isTruthy(env.LINE_GUIDE_PUSH_ENABLED);
}

/**
 * Real LIFF login on the /booking/line entry (idToken verification + binding).
 * Default: OFF — flag off keeps the legacy query-param handoff for instant rollback.
 */
export function isLineLiffEnabled(env = process.env) {
  return isTruthy(env.NEXT_PUBLIC_LINE_LIFF_ENABLED);
}

/**
 * LINE Login 作為平台登入方式（#1526，C′ 後端 idToken 橋接）。
 * Default: OFF — flag off 時登入頁不顯示「用 LINE 登入」、`/api/auth/line` 回停用，
 * 現有 Google 登入完全不受影響（即時 rollback）。開啟前 operator 需在 Supabase
 * Dashboard 確認 provider／設 LINE channel callback／Vercel env 設
 * LINE_LOGIN_CHANNEL_ID/SECRET（見 docs/operations/line-login-setup.md）。
 */
export function isLineLoginEnabled(env = process.env) {
  return isTruthy(env.NEXT_PUBLIC_LINE_LOGIN_ENABLED);
}

/**
 * 自動連結「LINE 已驗證 email」到既有同 email 帳號（#1526 合併策略第 3 點）。
 * Default: OFF — 首發只記 log 不自動併帳，防搶號；觀察誤併率後再開。
 */
export function isLineLoginAutoLinkEmailEnabled(env = process.env) {
  return isTruthy(env.LINE_LOGIN_AUTOLINK_VERIFIED_EMAIL);
}

/**
 * Telegram order-event notifications (admin group + guide/traveler push).
 * Default: OFF. Uses the order-notification bot (TELEGRAM_BOT_TOKEN), separate
 * from the system-alert bot (TELEGRAM_ALERT_*).
 */
export function isTelegramNotifyEnabled(env = process.env) {
  return isTruthy(env.TELEGRAM_NOTIFY_ENABLED);
}

/** Per-guide Telegram order push (requires TELEGRAM_NOTIFY_ENABLED + a binding). Default OFF. */
export function isTelegramGuideNotifyEnabled(env = process.env) {
  return isTruthy(env.TELEGRAM_GUIDE_NOTIFY_ENABLED);
}

/** Per-traveler (optional) Telegram order push (requires a binding). Default OFF. */
export function isTelegramTravelerNotifyEnabled(env = process.env) {
  return isTruthy(env.TELEGRAM_TRAVELER_NOTIFY_ENABLED);
}

/**
 * 導遊商店預約流程（Guide Shop，issue #1475）。
 * 商店三頁（/guides/[slug]/shop、/shop/book、/shop/orders）在 flag off 時 notFound()。
 * Default: OFF — 上線前先以 NEXT_PUBLIC_GUIDE_SHOP_ENABLED=1 開啟。
 */
export function isGuideShopEnabled(env = process.env) {
  return isTruthy(env.NEXT_PUBLIC_GUIDE_SHOP_ENABLED);
}

/**
 * 匯款（手動查帳）付款方式（issue #1475）。
 * 控制付款步驟是否顯示「自行匯款」選項與 checkout provider='transfer' 分支。
 * Default: OFF。
 */
export function isTransferPaymentEnabled(env = process.env) {
  return isTruthy(env.NEXT_PUBLIC_TRANSFER_PAYMENT_ENABLED);
}

export const __internal = { isTruthy };
