/**
 * #1493 — 付款期限通知 wrapper。
 * 補齊收件人資訊後呼叫 email.ts 交易信。一律 best-effort：任何失敗不得影響主流程
 * （呼叫端 fire-and-forget）。
 */
import { lookupOrderContext } from './reschedule-notify';
import { sendPaymentDeadlineNotice, sendUnpaidOrderCancelledNotice } from './email';

/** 建立訂單／開放付款時：通知旅客付款連結與截止時間。 */
export async function notifyPaymentDeadlineSet(input: {
  orderId?: string | null;
  paymentDeadlineAt?: string | null;
}): Promise<void> {
  if (!input?.orderId || !input?.paymentDeadlineAt) return;
  const ctx = await lookupOrderContext(input.orderId);
  if (!ctx?.contactEmail) return;
  await sendPaymentDeadlineNotice({
    to: ctx.contactEmail,
    activityTitle: ctx.activityTitle,
    contactName: ctx.contactName,
    orderId: input.orderId,
    paymentDeadlineAt: input.paymentDeadlineAt,
  });
}

/** 逾時自動取消後：通知旅客訂單已取消、名額已釋出。 */
export async function notifyUnpaidOrderCancelled(input: {
  orderId?: string | null;
}): Promise<void> {
  if (!input?.orderId) return;
  const ctx = await lookupOrderContext(input.orderId);
  if (!ctx?.contactEmail) return;
  await sendUnpaidOrderCancelledNotice({
    to: ctx.contactEmail,
    activityTitle: ctx.activityTitle,
    contactName: ctx.contactName,
    orderId: input.orderId,
  });
}
