/**
 * 嚮導申請通知 fan-out：有人送出 /guide/apply 後同時通知管理者兩個管道。
 *
 *   1. Email    → ADMIN_EMAIL_ALLOWLIST 全員，內含申請表所有欄位（含未填的）
 *   2. Telegram → TELEGRAM_ORDER_CHAT_ID（營運群組），同一份欄位清單的純文字版
 *
 * 一律 best-effort：任一管道失敗（未設 env、Resend 掛掉、TG API 錯誤）都不得
 * 影響申請送出主流程 —— 申請者已經填完表單，不能因為我們的通知寄不出去就讓他
 * 看到「申請失敗」。故每一腿各自 try/catch，整個函式永不 throw。
 *
 * 沒有額外的 feature flag：兩個管道都靠「env 有沒有設」自然 self-skip
 * （無 ADMIN_EMAIL_ALLOWLIST → 回空陣列；無 TELEGRAM_ORDER_CHAT_ID →
 * pushTelegramToAdmin 回 skipped）。通知矩陣（notification-settings）目前
 * 只涵蓋訂單事件，故不套用於此。
 */
import { pushTelegramToAdmin } from '../telegram-messaging.ts';
import { sendGuideApplicationNotification } from './admin-email.ts';
import { buildGuideApplicationTelegramText } from './telegram-text.ts';
import type { GuideApplicationLike } from './summary.ts';

export async function notifyAdminOfGuideApplication(
  app: GuideApplicationLike,
): Promise<void> {
  // 兩腿並行：其中一腿慢／失敗不拖累另一腿（allSettled 永不 reject）。
  await Promise.allSettled([
    (async () => {
      try {
        await sendGuideApplicationNotification(app);
      } catch {
        // best-effort：寄信失敗不影響申請送出
      }
    })(),
    (async () => {
      try {
        await pushTelegramToAdmin(buildGuideApplicationTelegramText(app));
      } catch {
        // best-effort：TG 推送失敗不影響申請送出
      }
    })(),
  ]);
}
