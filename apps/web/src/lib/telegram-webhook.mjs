// Telegram webhook core handler.
//
// Authored as .mjs so it is unit-testable under node:test (the route.ts wrapper
// uses extensionless imports that only the Next bundler resolves). The route
// stays thin: verify secret header + delegate here + always 200.
//
// Security: Telegram delivers a configurable secret in the
// X-Telegram-Bot-Api-Secret-Token header (set via setWebhook). We compare it
// (constant-time) against TELEGRAM_WEBHOOK_SECRET; mismatches are NOT processed.
//
// PII: only chat_id + the binding subject keys are persisted.

import crypto from 'node:crypto';

import {
  parseStartPayload,
  redeemTelegramBindCode,
  setTelegramBlocked,
  markTelegramUpdateProcessed,
} from './telegram-binding.mjs';
import { sendTelegramMessage } from './telegram-messaging.ts';

/** Constant-time comparison of the webhook secret. */
function verifySecret(secretToken) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET || '';
  if (!expected || !secretToken) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(String(secretToken));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function handleUpdate(update) {
  const { firstTime } = await markTelegramUpdateProcessed(update?.update_id);
  if (!firstTime) return false;

  // Bot blocked / unblocked by the user.
  if (update?.my_chat_member) {
    const chatId = update.my_chat_member?.chat?.id;
    const status = update.my_chat_member?.new_chat_member?.status;
    if (chatId != null && status) {
      const blocked = status === 'kicked' || status === 'left';
      await setTelegramBlocked(String(chatId), blocked);
    }
    return true;
  }

  const message = update?.message ?? update?.edited_message;
  const chatId = message?.chat?.id;
  const text = message?.text;
  if (chatId == null || !text) return true;

  const code = parseStartPayload(text);
  if (!code) return true; // not a binding command

  const result = await redeemTelegramBindCode(code, { chatId: String(chatId) });
  const ack = result.ok
    ? '✅ 綁定成功！之後相關訂單通知會傳到這裡。'
    : '⚠️ 綁定碼無效或已過期，請回後台重新產生綁定連結。';
  // Best-effort ack (no-op unless TELEGRAM_NOTIFY_ENABLED + bot token set).
  await sendTelegramMessage(String(chatId), ack).catch(() => {});
  return true;
}

/**
 * Verify + process a raw Telegram webhook body.
 * @returns {{ verified: boolean, processed: number }}
 */
export async function processTelegramUpdate(rawBody, secretToken) {
  if (!verifySecret(secretToken)) {
    return { verified: false, processed: 0 };
  }
  let update;
  try {
    update = JSON.parse(rawBody || '{}');
  } catch {
    return { verified: true, processed: 0 };
  }
  try {
    const did = await handleUpdate(update);
    return { verified: true, processed: did ? 1 : 0 };
  } catch {
    return { verified: true, processed: 0 };
  }
}
