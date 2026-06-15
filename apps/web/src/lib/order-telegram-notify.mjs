// Order-event Telegram fan-out (#302b notification architecture).
//
// Sends an order event to three audiences via the order-notification bot:
//   - admin/ops group   (TELEGRAM_ORDER_CHAT_ID; always, when notify enabled)
//   - the owning guide   (TELEGRAM_GUIDE_NOTIFY_ENABLED + a guide binding)
//   - the traveler       (TELEGRAM_TRAVELER_NOTIFY_ENABLED + a traveler binding)
//
// Fire-and-forget: never throws; each leg self-skips when unbound / flag off.
// Authored as .mjs so the full fan-out is unit-testable (routes import it
// extensionless, resolved by the Next bundler).

import {
  isTelegramGuideNotifyEnabled,
  isTelegramTravelerNotifyEnabled,
} from '../config/feature-flags.mjs';
import { sendTelegramMessage, pushTelegramToAdmin } from './telegram-messaging.ts';
import { buildOrderEventTelegramText } from './telegram-messages.ts';
import { getTelegramChatForGuide, getTelegramChatForTraveler } from './telegram-binding.mjs';
import { getGuideIdForOrder } from './line-guide-push.mjs';

/**
 * @param {{ orderId: string, kind: string, activityTitle?: string,
 *   scheduleDate?: string|null, peopleCount?: number, totalTwd?: number,
 *   reason?: string, activityId?: string, experienceId?: string,
 *   userId?: string, contactEmail?: string }} params
 */
export async function dispatchOrderEventTelegram(params = {}) {
  const { kind } = params;

  // 1. Admin/ops group (env chat id).
  try {
    await pushTelegramToAdmin(buildOrderEventTelegramText(kind, params, 'admin'));
  } catch { /* fire-and-forget */ }

  // 2. Owning guide (per-guide binding).
  if (isTelegramGuideNotifyEnabled()) {
    try {
      const guideId = await getGuideIdForOrder({ activityId: params.activityId, experienceId: params.experienceId });
      const chatId = guideId ? await getTelegramChatForGuide(guideId) : null;
      if (chatId) await sendTelegramMessage(chatId, buildOrderEventTelegramText(kind, params, 'guide'));
    } catch { /* fire-and-forget */ }
  }

  // 3. Traveler (optional per-traveler binding).
  if (isTelegramTravelerNotifyEnabled()) {
    try {
      const chatId = await getTelegramChatForTraveler({ userId: params.userId, contactEmail: params.contactEmail });
      if (chatId) await sendTelegramMessage(chatId, buildOrderEventTelegramText(kind, params, 'traveler'));
    } catch { /* fire-and-forget */ }
  }
}
