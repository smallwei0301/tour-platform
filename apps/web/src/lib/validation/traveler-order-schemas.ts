/**
 * v2 traveler order routes 的 request body schemas（#1649 Phase 2，#1600 準則）。
 *
 * 原則：schema 是「收緊」不是「改變」——以 legacy /api/me/orders/** 手寫驗證的
 * 實際接受範圍為基準先鎖現狀；業務規則（窗口、資格、冪等）仍由 db gateway 把關。
 */
import { z } from 'zod';

/** POST /api/v2/orders/:orderId/refund-requests */
export const RefundRequestBodySchema = z.object({
  requestId: z.string().trim().min(1, 'requestId is required').max(128),
  reason: z.string().max(200).optional(),
  note: z.string().max(2000).optional(),
});

/** POST /api/v2/orders/:orderId/reschedule-requests */
export const RescheduleRequestBodySchema = z.object({
  requestId: z.string().trim().min(1, 'requestId 為必填').max(128),
  toScheduleId: z.string().trim().min(1, 'toScheduleId 為必填').max(128),
});

/** POST /api/v2/orders/:orderId/messages（長度上限與 UI maxLength=1000 對齊） */
export const OrderMessageBodySchema = z.object({
  body: z.string().trim().min(1, '留言內容不可為空').max(1000),
});
