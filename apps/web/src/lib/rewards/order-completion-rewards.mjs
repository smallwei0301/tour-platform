// @ts-check
/**
 * Issue #1594 — 訂單完成獎勵：發點（冪等）＋站內通知。
 * 由「完成」seam 呼叫（auto-complete sweep、guide check-in redeem）。
 * 一律 best-effort：任何失敗都不得影響訂單完成主流程。
 * 冪等由 earnPointsForOrderDb 的唯一約束 (order_id, reason='earn_order') 保證，
 * 故重跑 sweep / 重複完成都只發一次點；通知只在「首次真的發點」時送出。
 */
import { earnPointsForOrderDb } from '../db-points.mjs';
import { createNotification } from '../db-notifications.mjs';

/**
 * @param {{ userId?: string|null, orderId: string, paidTwd?: number|null, activityTitle?: string|null, now?: string }} input
 * @returns {Promise<{ earned: number }>}
 */
export async function grantCompletionRewards({ userId, orderId, paidTwd, activityTitle, now } = /** @type {any} */ ({})) {
  const uid = String(userId || '').trim();
  const oid = String(orderId || '').trim();
  const paid = Number(paidTwd) || 0;
  if (!uid || !oid || paid <= 0) return { earned: 0 };

  try {
    const r = await earnPointsForOrderDb({ userId: uid, orderId: oid, paidTwd: paid, now });
    if (r.earned > 0 && !r.alreadyEarned) {
      await createNotification({
        userId: uid,
        type: 'order_status',
        title: '行程完成，點數已入帳',
        body: `「${activityTitle || '您的行程'}」完成，獲得 ${r.earned} 點回饋，可於下次訂購折抵。`,
        linkPath: '/me/notifications',
        now,
      });
    }
    return { earned: r.earned || 0 };
  } catch {
    return { earned: 0 };
  }
}
