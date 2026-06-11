/**
 * #1411 — 訂單留言通知 wrapper：補齊收件人資訊後呼叫 email.ts 交易信。
 * 一律 best-effort：任何失敗不得影響留言主流程（呼叫端已 fire-and-forget）。
 * 節流（同訂單同角色 15 分鐘）由 gateway 計算，這裡只負責寄送。
 */
import { lookupOrderContext } from './reschedule-notify';
import { sendOrderMessageNotice } from './email';

type OrderMessageResult = {
  message: { orderId: string; senderRole: string; body: string };
  shouldNotify: boolean;
};

/** traveler 發言 → 通知嚮導（無嚮導 email 時靜默略過）。 */
export async function notifyGuideOfOrderMessage(result: OrderMessageResult): Promise<void> {
  if (!result.shouldNotify) return;
  const ctx = await lookupOrderContext(result.message.orderId);
  if (!ctx?.guideEmail) return;
  await sendOrderMessageNotice({
    to: ctx.guideEmail,
    activityTitle: ctx.activityTitle,
    orderId: result.message.orderId,
    senderLabel: ctx.contactName ? `旅客 ${ctx.contactName}` : '旅客',
    preview: result.message.body,
    threadPath: '/guide/messages',
  });
}

/** guide 回覆 → 通知旅客。 */
export async function notifyTravelerOfOrderMessage(result: OrderMessageResult): Promise<void> {
  if (!result.shouldNotify) return;
  const ctx = await lookupOrderContext(result.message.orderId);
  if (!ctx?.contactEmail) return;
  await sendOrderMessageNotice({
    to: ctx.contactEmail,
    activityTitle: ctx.activityTitle,
    orderId: result.message.orderId,
    senderLabel: '您的嚮導',
    preview: result.message.body,
    threadPath: `/me/orders/${result.message.orderId}`,
  });
}
