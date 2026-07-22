// @ts-check
/**
 * midao2 新需求 → 導遊 LINE 推播（spec §7）。
 * 沿用 guide-line-binding 解析 line_user_id；fire-and-forget：永不 throw、失敗只回狀態。
 * 文案不落旅客聯絡資訊（PII 原則，spec §6）。
 */
import { getLineUserIdForGuide } from './guide-line-binding.mjs';
import { pushMessage } from './line-messaging.ts';

/** @param {{requestNo:string, travelerName:string, activityTitle?:string|null, preferredDate:string, participantsCount:number}} i */
export function buildMidaoRequestPushText(i) {
  const service = i.activityTitle ? `・${i.activityTitle}` : '';
  return `🔔 新需求 #${i.requestNo}：${i.travelerName}${service}・${i.preferredDate}・${i.participantsCount} 位。請開啟 midao2 後台查看並回覆。`;
}

/**
 * @param {{guideId:string, requestNo:string, travelerName:string, activityTitle?:string|null, preferredDate:string, participantsCount:number}} input
 * @returns {Promise<{status:'sent'|'skipped'|'failed', reason?:string}>}
 */
export async function notifyGuideNewMidaoRequest(input) {
  try {
    const lineUserId = await getLineUserIdForGuide(input.guideId);
    if (!lineUserId) return { status: 'skipped', reason: 'no_guide_binding' };
    const result = await pushMessage(lineUserId, [{ type: 'text', text: buildMidaoRequestPushText(input) }]);
    return result?.status === 'sent' ? { status: 'sent' } : { status: result?.status ?? 'failed', reason: result?.reason ?? result?.error };
  } catch (err) {
    return { status: 'failed', reason: err instanceof Error ? err.message : 'push_error' };
  }
}
