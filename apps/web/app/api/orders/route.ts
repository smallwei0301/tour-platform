import { fail, ok } from '../../../src/lib/api'";
import { createOrderDb } from '../../../src/lib/db.mjs'";
import { sendOrderConfirmation } from '../../../src/lib/email'";
import { notifyNewOrder } from '../../../src/lib/line-notify'";
import { limiters, RateLimiter, createRateLimitResponse } from '../../../src/lib/rate-limit'";
import { createClient } from '../../../src/lib/supabase/server'";

function statusFromErrorMessage(message: string) {
  if (message.includes('not enough seats') || message.includes('schedule is full')) return 409;
  if (message.includes('not found')) return 404;
  if (message.includes('required') || message.includes('peopleCount')) return 400;
  return 400;
}

export async function POST(request: Request) {
  // 🟡 P10-2: Rate Limiting
  const clientIp = RateLimiter.getClientIp(request);
  const result = limiters.orders.check(clientIp);

  const rateLimitResponse = createRateLimitResponse(result);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const body = await request.json().catch(() => null);

  // 🔐 Phase 9: 嘗試獲取已登入用戶的 user_id（非必須，允許訪客下單）
  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    // 未登入或 session 過期，允許繼續以訪客身份下單
  }

  try {
    const order = await createOrderDb({ ...body, userId });

    // 🔔 Fire-and-forget: 訂單建立確認 email + LINE 通知
    const notifyData = {
      orderId: order.id,
      activityTitle: order.title || body?.experienceSlug || '行程',
      scheduleDate: order.scheduleStartAt
        ? new Date(order.scheduleStartAt).toLocaleDateString('zh-TW')
        : null,
      peopleCount: order.peopleCount,
      totalTwd: order.totalTwd,
      contactName: order.contactName,
      contactEmail: order.contactEmail,
      contactPhone: order.contactPhone,
    };

    if (order.contactEmail) {
      sendOrderConfirmation(notifyData).catch(() => {}); // 絕對不阻塞 response
    }

    // LINE Notify 通知管理員/導遊
    notifyNewOrder(notifyData).catch(() => {});

    return Response.json(ok(order));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    const status = statusFromErrorMessage(message);
    return Response.json(fail('INVALID_REQUEST', message), { status });
  }
}
