import { ok, fail } from '../../../../../src/lib/api';
import { getMyOrderDetailDb, cancelOrderDb } from '../../../../../src/lib/db.mjs';
import { createClient } from '../../../../../src/lib/supabase/server';
import { sendOrderCancellation } from '../../../../../src/lib/email';
import { notifyOrderCancelled } from '../../../../../src/lib/line-notify';

const API_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, ms = API_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('API timeout')), ms)),
  ]);
}

export async function GET(_request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;

  try {
    const supabase = await withTimeout(createClient());
    const { data: { user } } = await withTimeout(supabase.auth.getUser());

    if (!user?.email) {
      return Response.json(fail('UNAUTHORIZED', '請先登入'), { status: 401 });
    }

    const row = await withTimeout(getMyOrderDetailDb({ orderId, contactEmail: user.email }));
    return Response.json(ok(row));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    const status = message.toLowerCase().includes('timeout') ? 504 : (message.includes('not found') ? 404 : 400);
    const code = status === 504 ? 'UPSTREAM_TIMEOUT' : 'INVALID_REQUEST';
    return Response.json(fail(code, message), { status });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;
  const body = await request.json().catch(() => null);
  const action = body?.action || '';

  try {
    const supabase = await withTimeout(createClient());
    const { data: { user } } = await withTimeout(supabase.auth.getUser());

    if (!user?.email) {
      return Response.json(fail('UNAUTHORIZED', '請先登入'), { status: 401 });
    }

    if (action === 'cancel') {
      // 先查訂單詳情（取 email 通知用）
      const orderBefore: any = await withTimeout(getMyOrderDetailDb({ orderId, contactEmail: user.email })).catch(() => null);

      const result = await withTimeout(cancelOrderDb({ orderId, contactEmail: user.email }));

      // 🔔 Fire-and-forget: 訂單取消 email + LINE 通知
      if (orderBefore) {
        const notifyData = {
          orderId,
          activityTitle: orderBefore.title || '行程',
          scheduleDate: null,
          peopleCount: orderBefore.peopleCount,
          totalTwd: orderBefore.totalTwd,
          contactName: orderBefore.contactName || undefined,
          contactEmail: user.email,
        };
        sendOrderCancellation(notifyData).catch(() => {}); // 絕對不阻塞 response
        notifyOrderCancelled(notifyData).catch(() => {});
      }

      return Response.json(ok(result));
    }

    return Response.json(fail('INVALID_REQUEST', `unknown action: ${action}`), { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    const status = message.toLowerCase().includes('timeout') ? 504 : (message.includes('not found') ? 404 : 400);
    const code = status === 504 ? 'UPSTREAM_TIMEOUT' : 'INVALID_REQUEST';
    return Response.json(fail(code, message), { status });
  }
}
