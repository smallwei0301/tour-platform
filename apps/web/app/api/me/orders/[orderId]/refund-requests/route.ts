import { ok, fail } from '../../../../../../src/lib/api';
import { createRefundRequestDb, listRefundRequestsDb, getMyOrderDetailDb } from '../../../../../../src/lib/db.mjs';
import { createClient } from '../../../../../../src/lib/supabase/server';
import { sendRefundRequested } from '../../../../../../src/lib/email';
import type { OrderEmailData } from '../../../../../../src/lib/email';
import type { OrderNotifyData } from '../../../../../../src/lib/line-notify';
import { notifyRefundRequest } from '../../../../../../src/lib/line-notify';

export async function GET(_request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;

  try {
    const rows = await listRefundRequestsDb({ orderId });
    return Response.json(ok(rows));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;
  const body = await request.json().catch(() => ({}));

  try {
    // 從 session 取得 email（不再依賴 body.contactEmail）
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user?.email) {
      return Response.json(fail('UNAUTHORIZED', '請先登入'), { status: 401 });
    }

    const requestId = String(body?.requestId || '').trim();
    if (!requestId) {
      return Response.json(fail('INVALID_REQUEST', 'requestId is required'), { status: 400 });
    }

    const created = await createRefundRequestDb({
      orderId,
      requestId,
      reason: body?.reason,
      note: body?.note,
      contactEmail: user.email, // 以 session email 為準
    });

    // 🔔 Fire-and-forget: 退款申請收到 email + LINE 通知
    const order = await getMyOrderDetailDb({ orderId, contactEmail: user.email }).catch((): null => null);
    if (order) {
      const notifyData: OrderEmailData & OrderNotifyData & { reason?: string; note?: string } = {
        orderId,
        activityTitle: order.title || '行程',
        scheduleDate: null,
        peopleCount: order.peopleCount,
        totalTwd: order.totalTwd,
        contactName: order.contactName || undefined,
        contactEmail: user.email,
        reason: body?.reason,
        note: body?.note,
      };
      void sendRefundRequested(notifyData).then((emailResult) => {
        if (!emailResult.ok) {
          console.warn('[refund-request][email] non-blocking failure', {
            orderId,
            code: emailResult.errorCode,
            message: emailResult.errorMessage,
          });
        }
      });
      notifyRefundRequest(notifyData).catch(() => {});
    }

    return Response.json(ok(created));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    const status = message.includes('not found') ? 404 : 400;
    return Response.json(fail('INVALID_REQUEST', message), { status });
  }
}
