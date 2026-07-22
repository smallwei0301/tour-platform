/**
 * V2 draft 建單成功後的通知扇出（#1493 付款期限信＋request 導遊審核入口通知）。
 * 全部 fire-and-forget、best-effort：任何失敗不得影響建單回應。
 * 從 draft route 抽出（architecture ratchet：route 已達行數天花板 1207）。
 */
type DraftPostCreateNotifyInput = {
  orderId: string;
  activityId: string;
  activityTitle: string;
  startAt: string;
  peopleCount: number;
  totalTwd: number;
  paymentDeadlineAt: string | null;
  requiresApproval: boolean;
};

export function fireDraftPostCreateNotifications(input: DraftPostCreateNotifyInput): void {
  const { paymentDeadlineAt } = input;
  // #1493 instant/scheduled：建立即起算付款期限 → 主動寄付款連結＋截止時間。
  if (paymentDeadlineAt) {
    void import('../payment-deadline-notify')
      .then(({ notifyPaymentDeadlineSet }) =>
        notifyPaymentDeadlineSet({ orderId: input.orderId, paymentDeadlineAt }))
      .catch((err) => console.error('[payment-deadline-notify] draft fire-and-forget failed:', err));
  }
  // request：通知導遊有新申請待審核——沒有這步導遊只能自己登入後台才會發現。
  if (input.requiresApproval) {
    void import('../booking-approval-notify')
      .then(({ notifyBookingApprovalRequested }) =>
        notifyBookingApprovalRequested({
          orderId: input.orderId,
          activityId: input.activityId,
          activityTitle: input.activityTitle,
          startAt: input.startAt,
          peopleCount: input.peopleCount,
          totalTwd: input.totalTwd,
        }))
      .catch((err) => console.error('[booking-approval-notify] draft fire-and-forget failed:', err));
  }
}
