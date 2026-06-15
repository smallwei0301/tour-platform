// Per-guide LINE push orchestration — Tour Platform (#302b).
//
// Resolves order → activity → owning guide → that guide's line_user_id and
// pushes a guide-facing message. Parallels line-traveler-push.mjs.
// Fire-and-forget friendly: never throws.
//
// Gating order:
//   1. LINE_GUIDE_PUSH_ENABLED off → skipped (guide_push_disabled)  [no network]
//   2. order has no resolvable guide → skipped (no_guide)           [no network]
//   3. guide has no (unblocked) binding → skipped (no_guide_binding)[no network]
//   4. otherwise compose + pushMessage (also honours LINE_MESSAGING_ENABLED)

import { experiences } from './store.mjs';
import { isLineGuidePushEnabled } from '../config/feature-flags.mjs';
import { getLineUserIdForGuide } from './guide-line-binding.mjs';
import { pushMessage } from './line-messaging.ts';
import { buildGuideMessage } from './line-messages.ts';

function hasSupabaseEnv() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Resolve the guide that owns an order's activity.
 * @param {{ activityId?: string, guideId?: string }} input
 * @returns {Promise<string|null>} guide identifier (UUID in Supabase, slug in-memory)
 */
export async function getGuideIdForOrder(input = {}) {
  if (input.guideId) return input.guideId;
  const activityId = input.activityId ?? input.experienceId ?? null;
  if (!activityId) return null;
  if (hasSupabaseEnv()) {
    const { getGuideIdForOrderDb } = await import('./db.mjs');
    return getGuideIdForOrderDb({ activityId });
  }
  const exp = experiences.find((e) => e.id === activityId);
  return exp?.guideSlug ?? null;
}

/**
 * @param {{ kind: string, orderId: string, activityId?: string, experienceId?: string,
 *   guideId?: string, activityTitle?: string, scheduleDate?: string|null,
 *   peopleCount?: number, totalTwd?: number, reason?: string }} input
 * @returns {Promise<{ status: 'sent'|'skipped'|'failed', reason?: string, error?: string }>}
 */
export async function pushGuideOrderEvent(input = {}) {
  if (!isLineGuidePushEnabled()) {
    return { status: 'skipped', reason: 'guide_push_disabled' };
  }

  const guideId = await getGuideIdForOrder(input);
  if (!guideId) {
    return { status: 'skipped', reason: 'no_guide' };
  }

  const lineUserId = await getLineUserIdForGuide(guideId);
  if (!lineUserId) {
    return { status: 'skipped', reason: 'no_guide_binding' };
  }

  const messages = buildGuideMessage(input.kind, {
    orderId: input.orderId,
    activityTitle: input.activityTitle,
    scheduleDate: input.scheduleDate,
    peopleCount: input.peopleCount,
    totalTwd: input.totalTwd,
    reason: input.reason,
  });

  return pushMessage(lineUserId, messages);
}
