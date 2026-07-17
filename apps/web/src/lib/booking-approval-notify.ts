/**
 * 三種預約模式 — request plan 導遊審核結果通知 wrapper。
 * 補齊收件人資訊後呼叫 email.ts 交易信。一律 best-effort：任何失敗不得影響審核主流程
 * （呼叫端已 fire-and-forget）。
 */
import { lookupOrderContext } from './reschedule-notify';
import { sendBookingApprovalApproved, sendBookingApprovalRejected } from './email';
import { sendBookingApprovalRequested } from './booking-approval/request-email.ts';
import { pushGuideOrderEvent } from './line-guide-push.mjs';

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

type ApprovalRequestedInput = {
  orderId?: string | null;
  activityId?: string | null;
  activityTitle?: string;
  startAt?: string | null;
  peopleCount?: number;
  totalTwd?: number;
};

/** 旅客建立 request 預約申請 → 通知導遊（email＋LINE push，均 best-effort、不影響建單）。 */
export async function notifyBookingApprovalRequested(input: ApprovalRequestedInput): Promise<void> {
  if (!input?.orderId) return;
  const scheduleDate = input.startAt ? String(input.startAt).replace('T', ' ').slice(0, 16) : undefined;

  // LINE push：line-guide-push 自行處理 flag／通知矩陣／導遊綁定三層 gating，永不 throw。
  void pushGuideOrderEvent({
    kind: 'guide_approval_requested',
    orderId: input.orderId,
    activityId: input.activityId ?? undefined,
    activityTitle: input.activityTitle,
    scheduleDate,
    peopleCount: input.peopleCount,
    totalTwd: input.totalTwd,
  }).catch(() => {});

  const ctx = await lookupOrderContext(input.orderId);
  if (!ctx?.guideEmail) return;
  await sendBookingApprovalRequested({
    to: ctx.guideEmail,
    activityTitle: input.activityTitle || ctx.activityTitle,
    contactName: ctx.contactName,
    orderId: input.orderId,
    startAt: input.startAt,
    peopleCount: input.peopleCount,
    totalTwd: input.totalTwd,
  });
}
