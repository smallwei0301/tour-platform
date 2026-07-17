/**
 * 三種預約模式 — request 申請建立時通知導遊的 email 模板。
 * 獨立於 email.ts（architecture ratchet：email.ts 已達行數天花板 863，模板類新增改落領域子資料夾）。
 * import 帶 .ts 副檔名（tsconfig allowImportingTsExtensions）讓 node --test 可直接 runtime import。
 */
import { wrapEmail, sendEmailWithContract, formatSlotTime, type EmailDeliveryResult } from '../email.ts';
import { getSiteBaseUrl } from '../../config/env.ts';

export interface BookingApprovalRequestedNoticeData {
  to: string;
  activityTitle: string;
  contactName?: string;
  orderId?: string;
  startAt?: string | null;
  peopleCount?: number;
  totalTwd?: number;
}

/** 旅客送出 request 預約申請 → 通知導遊儘速審核（先審核後付款，未審核前旅客不會付款）。 */
export async function sendBookingApprovalRequested(data: BookingApprovalRequestedNoticeData): Promise<EmailDeliveryResult> {
  const subject = `新預約申請待審核 — ${data.activityTitle}`;
  const reviewUrl = `${getSiteBaseUrl()}/guide/bookings`;
  const html = wrapEmail(subject, `
    <h1 style="font-size:20px;font-weight:800;color:#111827;margin:0 0 8px;">有新的預約申請 🙋</h1>
    <p style="font-size:14px;color:#374151;margin:0 0 12px;">
      旅客 ${data.contactName || ''} 送出「${data.activityTitle}」的預約申請：
    </p>
    <p style="font-size:14px;color:#374151;margin:0 0 4px;">預約時段：${formatSlotTime(data.startAt)}</p>
    <p style="font-size:14px;color:#374151;margin:0 0 4px;">人數：${data.peopleCount || 1} 人</p>
    <p style="font-size:14px;color:#374151;margin:0 0 16px;">金額：NT$ ${(data.totalTwd || 0).toLocaleString()}</p>
    <p style="font-size:13px;color:#6b7280;margin:0 0 16px;">
      此行程採「先審核後付款」：旅客尚未付款，通過審核後才會收到付款通知；婉拒則直接取消申請。
    </p>
    <a href="${reviewUrl}"
       style="display:inline-block;background:#0f766e;color:#fff;font-weight:700;padding:10px 18px;border-radius:8px;text-decoration:none;">
      前往審核 →
    </a>
  `);
  return sendEmailWithContract({ fn: 'sendBookingApprovalRequested', to: data.to, subject, html, orderId: data.orderId });
}
