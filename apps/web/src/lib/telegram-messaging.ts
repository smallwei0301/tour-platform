/**
 * Telegram order-notification client — Tour Platform.
 *
 * Separate from the system-alert bot (telegram-notify.ts / TELEGRAM_ALERT_*).
 * Order/event notifications use their own bot (TELEGRAM_BOT_TOKEN) that guides
 * and travelers add as a contact. Fire-and-forget: never throws.
 *
 * Kill-switch: TELEGRAM_NOTIFY_ENABLED (default OFF) gates every send.
 *
 * Env:
 * - TELEGRAM_BOT_TOKEN      — order-notification bot token
 * - TELEGRAM_ORDER_CHAT_ID  — admin/ops group chat id for order events
 */

import { isTelegramNotifyEnabled } from '../config/feature-flags.mjs';

const TELEGRAM_API_BASE = 'https://api.telegram.org';

export type TelegramSendStatus = 'sent' | 'skipped' | 'failed';
export interface TelegramSendResult {
  status: TelegramSendStatus;
  reason?: string;
  error?: string;
}

/** Send a plain-text Telegram message to a chat id. Honours the kill-switch. */
export async function sendTelegramMessage(chatId: string, text: string): Promise<TelegramSendResult> {
  if (!isTelegramNotifyEnabled()) {
    return { status: 'skipped', reason: 'telegram_disabled' };
  }
  const token = process.env.TELEGRAM_BOT_TOKEN || '';
  if (!token) {
    return { status: 'skipped', reason: 'no_bot_token' };
  }
  const to = String(chatId || '').trim();
  if (!to) {
    return { status: 'skipped', reason: 'no_recipient' };
  }
  try {
    const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: to, text, disable_web_page_preview: true }),
    });
    if (response.ok) return { status: 'sent' };
    // 403 = bot blocked / not started by the recipient — treat as skip, not failure.
    if (response.status === 403) return { status: 'skipped', reason: 'forbidden' };
    return { status: 'failed', error: `Telegram error: ${response.status}` };
  } catch (err) {
    return { status: 'failed', error: err instanceof Error ? err.message : String(err) };
  }
}

/** Push a plain-text notification to the admin/ops order group. */
export async function pushTelegramToAdmin(text: string): Promise<TelegramSendResult> {
  const chatId = process.env.TELEGRAM_ORDER_CHAT_ID || '';
  if (!chatId) return { status: 'skipped', reason: 'no_admin_chat' };
  return sendTelegramMessage(chatId, text);
}
