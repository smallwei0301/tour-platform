import { fail, ok } from '../../../src/lib/api';
import { createOrderDb } from '../../../src/lib/db.mjs';
import { sendOrderConfirmation } from '../../../src/lib/email';
import type { OrderEmailData } from '../../../src/lib/email';
import type { OrderNotifyData } from '../../../src/lib/line-notify';
import { notifyNewOrder } from '../../../src/lib/line-notify';
import { limiters, RateLimiter, createRateLimitResponse } from '../../../src/lib/rate-limit';
import { createClient } from '../../../src/lib/supabase/server';

function statusFromErrorMessage(message: string) {
  if (message.includes('not enough seats') || message.includes('schedule is full')) return 409;
  if (message.includes('not found')) return 404;
  if (message.includes('required') || message.includes('peopleCount')) return 400;
  // #355: Promo code redemption errors
  if (message.includes('EXHAUSTED') || message.includes('ALREADY_REDEEMED')) return 409;
  return 400;
}

function isBookingV2PrimaryTrafficEnabled(): boolean {
  const raw = process.env.BOOKING_V2_PRIMARY ?? process.env.BOOKING_V2;
  return raw === '1' || raw === 'true';
}

function isExplicitLegacyRequest(request: Request): boolean {
  const url = new URL(request.url);
  const mode = url.searchParams.get('mode');
  const source = url.searchParams.get('source');
  const legacyHeader = request.headers.get('x-legacy-order-path');
  return mode === 'legacy' || source === 'legacy' || legacyHeader === '1';
}

export async function POST(request: Request) {
  const bookingV2Primary = isBookingV2PrimaryTrafficEnabled();
  const isLegacyOptIn = isExplicitLegacyRequest(request);

  if (bookingV2Primary && !isLegacyOptIn) {
    return Response.json(
      fail('ORDER_ROUTE_LEGACY_ONLY', 'legacy order route is disabled for primary traveler traffic'),
      {
        status: 410,
        headers: {
          'x-order-route-mode': 'legacy-only',
          'x-order-requested-mode': 'auto',
        },
      }
    );
  }

  // 🟡 P10-2: Rate Limiting
  const clientIp = RateLimiter.getClientIp(request);
  const result = limiters.orders.check(clientIp);

  const rateLimitResponse = createRateLimitResponse(result);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const body = await request.json().catch((): null => null);

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
    // #355: Extract promoCode from body and pass through to createOrderDb
    const promoCode = typeof body?.promoCode === 'string' ? body.promoCode.trim() || undefined : undefined;
    const order = await createOrderDb({ ...body, userId, promoCode });

    // 🔔 Fire-and-forget: 訂單建立確認 email + LINE 通知
    const orderRecord = order as Record<string, unknown>;
    const notifyData: OrderEmailData & OrderNotifyData & { contactPhone?: string } = {
      orderId: order.id as string,
      activityTitle: (orderRecord.title as string | undefined) || body?.experienceSlug || '行程',
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
      void sendOrderConfirmation(notifyData).then((emailResult) => {
        if (!emailResult.ok) {
          console.warn('[orders][email] non-blocking failure', {
            orderId: order.id,
            code: emailResult.errorCode,
            message: emailResult.errorMessage,
          });
        }
      });
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
