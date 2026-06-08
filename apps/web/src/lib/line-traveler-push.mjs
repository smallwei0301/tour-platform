// Per-traveler LINE push orchestration — Tour Platform (#302b)
//
// Single "resolve → skip → push" entry point shared by the booking, payment,
// cancel, and refund hooks. Fire-and-forget friendly: never throws, returns a
// PushResult-style object the caller can ignore or log.
//
// Gating order:
//   1. LINE_PUSH_ENABLED off          → skipped (push_disabled)   [no network]
//   2. no resolvable line_user_id     → skipped (no_line_binding) [no network]
//   3. otherwise compose + pushMessage (which also honours LINE_MESSAGING_ENABLED)

import { isLinePushEnabled } from '../config/feature-flags.mjs';
import { getLineUserIdForOrder } from './line-binding.mjs';
import { pushMessage } from './line-messaging.ts';
import { buildTravelerMessage } from './line-messages.ts';

/**
 * @param {{ kind: string, orderId: string, activityTitle?: string,
 *   scheduleDate?: string|null, peopleCount?: number, totalTwd?: number,
 *   reason?: string, userId?: string, contactEmail?: string }} input
 * @returns {Promise<{ status: 'sent'|'skipped'|'failed', reason?: string, error?: string }>}
 */
export async function pushTravelerOrderEvent(input = {}) {
  const { kind } = input;
  if (!isLinePushEnabled()) {
    return { status: 'skipped', reason: 'push_disabled' };
  }

  const lineUserId = await getLineUserIdForOrder({
    userId: input.userId,
    contactEmail: input.contactEmail,
  });
  if (!lineUserId) {
    return { status: 'skipped', reason: 'no_line_binding' };
  }

  const messages = buildTravelerMessage(kind, {
    orderId: input.orderId,
    activityTitle: input.activityTitle,
    scheduleDate: input.scheduleDate,
    peopleCount: input.peopleCount,
    totalTwd: input.totalTwd,
    reason: input.reason,
  });

  return pushMessage(lineUserId, messages);
}
