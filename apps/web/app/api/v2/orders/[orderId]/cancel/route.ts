/**
 * POST /api/v2/orders/[orderId]/cancel — 旅人取消訂單（#1649 Phase 2）
 *
 * legacy PATCH /api/me/orders/[orderId] { action:'cancel' } 的 v2 對應：
 * 僅 pending_payment 可由旅人取消（規則在 cancelOrderDb），取消後釋放名額
 * （race-safe RPC 優先）＋全通路通知扇出（email／LINE／Telegram，均 fire-and-forget）。
 *
 * Auth：登入旅客（Supabase cookie）。CSRF：middleware 不涵蓋 /api/v2 非 admin 路徑，
 * 故 route 內顯式 validateCsrf（與 v2 redeem route 同模式）。
 */
import { validateCsrf } from '../../../../../../src/lib/csrf.mjs';
import { jsonOk, jsonError } from '../../../../../../src/lib/api-response';
import { handleRouteError } from '../../../../../../src/lib/route-error';
import { getTravelerIdentity } from '../../../../../../src/lib/v2/traveler-auth';
import { getMyOrderDetailDb, cancelOrderDb } from '../../../../../../src/lib/db.mjs';
import { sendOrderCancellation } from '../../../../../../src/lib/email';
import type { OrderEmailData } from '../../../../../../src/lib/email';
import type { OrderNotifyData } from '../../../../../../src/lib/line-notify';
import { notifyOrderCancelled } from '../../../../../../src/lib/line-notify';
import { pushTravelerOrderEvent } from '../../../../../../src/lib/line-traveler-push.mjs';
import { pushGuideOrderEvent } from '../../../../../../src/lib/line-guide-push.mjs';
import { dispatchOrderEventEmails } from '../../../../../../src/lib/order-email-notify';
import { dispatchOrderEventTelegram } from '../../../../../../src/lib/order-telegram-notify.mjs';

export async function POST(
  request: Request,
  context: { params: Promise<{ orderId: string }> }
) {
  const csrfError = validateCsrf(request);
  if (csrfError) return csrfError;

  const { orderId } = await context.params;

  try {
    const user = await getTravelerIdentity();
    if (!user?.email) {
      return jsonError('UNAUTHORIZED', 'Please login first', 401);
    }

    // 先查訂單詳情（取通知資料用）
    const orderBefore = await getMyOrderDetailDb({ orderId, contactEmail: user.email }).catch((): null => null);

    const result = await cancelOrderDb({ orderId, contactEmail: user.email });

    // 🔔 Fire-and-forget: 訂單取消 email + LINE + Telegram 通知（與 legacy cancel 等價）
    if (orderBefore) {
      const notifyData: OrderEmailData & OrderNotifyData = {
        orderId,
        activityTitle: orderBefore.title || '行程',
        scheduleDate: null,
        peopleCount: orderBefore.peopleCount,
        totalTwd: orderBefore.totalTwd,
        contactName: orderBefore.contactName || undefined,
        contactEmail: user.email,
      };
      void sendOrderCancellation(notifyData).then((emailResult) => {
        if (!emailResult.ok) {
          console.warn('[v2-order-cancel][email] non-blocking failure', {
            orderId,
            code: emailResult.errorCode,
            message: emailResult.errorMessage,
          });
        }
      });
      notifyOrderCancelled(notifyData).catch(() => {});
      void pushTravelerOrderEvent({
        kind: 'order_cancelled',
        orderId,
        activityTitle: notifyData.activityTitle,
        scheduleDate: notifyData.scheduleDate,
        peopleCount: notifyData.peopleCount,
        totalTwd: notifyData.totalTwd,
        userId: user.id ?? undefined,
        contactEmail: user.email,
      }).catch(() => {});
      void pushGuideOrderEvent({
        kind: 'guide_order_cancelled',
        orderId,
        experienceId: orderBefore.experienceId,
        activityTitle: notifyData.activityTitle,
        scheduleDate: notifyData.scheduleDate,
        peopleCount: notifyData.peopleCount,
        totalTwd: notifyData.totalTwd,
      }).catch(() => {});
      void dispatchOrderEventEmails({
        orderId,
        kind: 'order_cancelled',
        activityTitle: notifyData.activityTitle,
        scheduleDate: notifyData.scheduleDate,
        peopleCount: notifyData.peopleCount,
        totalTwd: notifyData.totalTwd,
      }).catch(() => {});
      void dispatchOrderEventTelegram({
        orderId,
        kind: 'order_cancelled',
        activityTitle: notifyData.activityTitle,
        scheduleDate: notifyData.scheduleDate,
        peopleCount: notifyData.peopleCount,
        totalTwd: notifyData.totalTwd,
        experienceId: orderBefore.experienceId,
        userId: user.id ?? undefined,
        contactEmail: user.email,
      }).catch(() => {});
    }

    return jsonOk(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    if (message.includes('not found')) {
      return jsonError('NOT_FOUND', 'Order not found', 404);
    }
    if (message.includes('only pending_payment')) {
      return jsonError('CANCEL_NOT_ALLOWED', message, 409);
    }
    return handleRouteError(err, { route: 'v2/orders/cancel', code: 'CANCEL_FAILED', status: 400, message: '取消失敗，請稍後再試' });
  }
}
