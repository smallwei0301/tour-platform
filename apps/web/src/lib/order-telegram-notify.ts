// Order-event Telegram fan-out (#302b notification architecture).
//
// Increment 1: notifies the ADMIN/ops group (TELEGRAM_ORDER_CHAT_ID) for every
// order event. Guide/traveler per-person Telegram push is added with the
// Telegram binding (webhook + /start) increment.
//
// Fire-and-forget: never throws; gated by TELEGRAM_NOTIFY_ENABLED (default OFF).

import { pushTelegramToAdmin } from './telegram-messaging';
import { buildOrderEventTelegramText, type OrderEventKind } from './telegram-messages';

export async function dispatchOrderEventTelegram(params: {
  orderId: string;
  kind: OrderEventKind;
  activityTitle: string;
  scheduleDate?: string | null;
  peopleCount?: number;
  totalTwd?: number;
  reason?: string;
}): Promise<void> {
  try {
    const text = buildOrderEventTelegramText(params.kind, params, 'admin');
    await pushTelegramToAdmin(text);
  } catch {
    /* fire-and-forget */
  }
}
