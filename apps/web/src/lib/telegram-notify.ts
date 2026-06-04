/**
 * Telegram Alert Notify — 系統錯誤告警通知
 * Issue #1215 — Migrate incident alerting bus from LINE Notify to Telegram
 *
 * Fire-and-forget: never throws. Silently skips when env vars are absent.
 * Only handles system-error alerts; order notifications remain in line-notify.ts.
 *
 * Required env vars:
 *   TELEGRAM_ALERT_BOT_TOKEN — Telegram bot token for incident alerts
 *   TELEGRAM_ALERT_CHAT_ID   — Telegram chat/channel ID to post alerts into
 */

const TELEGRAM_API_BASE = 'https://api.telegram.org';

/**
 * Send a system-error alert to the configured Telegram chat.
 * Fire-and-forget: resolves without throwing even on network errors.
 *
 * @param context  Source/location of the error (e.g. 'ecpay_callback')
 * @param error    Short error description
 * @param details  Optional additional metadata (logged as JSON)
 */
export async function notifySystemError(
  context: string,
  error: string,
  details?: Record<string, unknown>
): Promise<void> {
  const token = process.env.TELEGRAM_ALERT_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ALERT_CHAT_ID;

  // No-token guard — skip silently when env vars are absent
  if (!token || !chatId) {
    return;
  }

  const detailStr = details
    ? `\n📦 詳情: ${JSON.stringify(details, null, 2).slice(0, 500)}`
    : '';

  const text = [
    '⚠️ 系統錯誤通知',
    '',
    `📍 位置: ${context}`,
    `❌ 錯誤: ${error.slice(0, 200)}${detailStr}`,
    `⏰ 時間: ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`,
    '',
    '請儘速檢查',
  ].join('\n');

  try {
    await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch {
    // fire-and-forget — swallow all errors
  }
}
