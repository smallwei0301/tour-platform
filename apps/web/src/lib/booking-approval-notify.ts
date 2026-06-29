/**
 * 三種預約模式 — request plan 導遊審核結果通知 wrapper。
 * 補齊收件人資訊後呼叫 email.ts 交易信。一律 best-effort：任何失敗不得影響審核主流程
 * （呼叫端已 fire-and-forget）。
 */
import { lookupOrderContext } from './reschedule-notify';
import { sendBookingApprovalApproved, sendBookingApprovalRejected } from './email';

type ApprovalResult = {
  bookingId: string;
  bookingNo?: string;
  orderId?: string | null;
  status?: string;
  guideApprovalStatus?: string;
  paymentDeadlineAt?: string | null; // #1493
};

/** 導遊審核決定 → 通知旅客（approve：請付款；reject：婉拒）。 */
export async function notifyBookingApprovalDecided(
  result: ApprovalResult,
  action: string,
): Promise<void> {
  if (!result?.orderId) return;
  const ctx = await lookupOrderContext(result.orderId);
  if (!ctx?.contactEmail) return;

  if (action === 'approve') {
    await sendBookingApprovalApproved({
      to: ctx.contactEmail,
      activityTitle: ctx.activityTitle,
      contactName: ctx.contactName,
      orderId: result.orderId,
      paymentDeadlineAt: result.paymentDeadlineAt ?? null,
    });
    return;
  }

  await sendBookingApprovalRejected({
    to: ctx.contactEmail,
    activityTitle: ctx.activityTitle,
    contactName: ctx.contactName,
    orderId: result.orderId,
  });
}
