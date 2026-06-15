import { ok, fail } from '../../../../../src/lib/api';
import { getMyOrderDetailDb, cancelOrderDb } from '../../../../../src/lib/db.mjs';
import { createClient } from '../../../../../src/lib/supabase/server';
import { sendOrderCancellation } from '../../../../../src/lib/email';
import type { OrderEmailData } from '../../../../../src/lib/email';
import type { OrderNotifyData } from '../../../../../src/lib/line-notify';
import { notifyOrderCancelled } from '../../../../../src/lib/line-notify';
import { pushTravelerOrderEvent } from '../../../../../src/lib/line-traveler-push.mjs';
import { pushGuideOrderEvent } from '../../../../../src/lib/line-guide-push.mjs';

export async function GET(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Allow guest access via contactEmail query param (order-status-by-email pattern)
    const url = new URL(request.url);
    const guestEmail = url.searchParams.get('contactEmail') || '';

    const contactEmail = user?.email || guestEmail;
    if (!contactEmail) {
      return Response.json(fail('UNAUTHORIZED', '請先登入'), { status: 401 });
    }

    const row = await getMyOrderDetailDb({ orderId, contactEmail });
    return Response.json(ok(row));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    const status = message.includes('not found') ? 404 : 400;
    return Response.json(fail('INVALID_REQUEST', message), { status });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;
  const body = await request.json().catch((): null => null);
  const action = body?.action || '';

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user?.email) {
      return Response.json(fail('UNAUTHORIZED', '請先登入'), { status: 401 });
    }

    if (action === 'cancel') {
      // 先查訂單詳情（取 email 通知用）
      const orderBefore = await getMyOrderDetailDb({ orderId, contactEmail: user.email }).catch((): null => null);

      const result = await cancelOrderDb({ orderId, contactEmail: user.email });

      // 🔔 Fire-and-forget: 訂單取消 email + LINE 通知
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
            console.warn('[me-order-cancel][email] non-blocking failure', {
              orderId,
              code: emailResult.errorCode,
              message: emailResult.errorMessage,
            });
          }
        });
        notifyOrderCancelled(notifyData).catch(() => {});
        // 旅客取消推播（未綁定/未開旗標時自動 skip）
        void pushTravelerOrderEvent({
          kind: 'order_cancelled',
          orderId,
          activityTitle: notifyData.activityTitle,
          scheduleDate: notifyData.scheduleDate,
          peopleCount: notifyData.peopleCount,
          totalTwd: notifyData.totalTwd,
          userId: user.id,
          contactEmail: user.email,
        }).catch(() => {});
        // 導遊推播：通知負責該團的導遊（未綁定 / 未開旗標自動 skip）
        void pushGuideOrderEvent({
          kind: 'guide_order_cancelled',
          orderId,
          experienceId: orderBefore.experienceId,
          activityTitle: notifyData.activityTitle,
          scheduleDate: notifyData.scheduleDate,
          peopleCount: notifyData.peopleCount,
          totalTwd: notifyData.totalTwd,
        }).catch(() => {});
      }

      return Response.json(ok(result));
    }

    return Response.json(fail('INVALID_REQUEST', `unknown action: ${action}`), { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    const status = message.includes('not found') ? 404 : 400;
    return Response.json(fail('INVALID_REQUEST', message), { status });
  }
}
