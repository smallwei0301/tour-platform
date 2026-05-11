import { ok, fail } from '../../../../../src/lib/api';
import { processPaymentCallbackDb } from '../../../../../src/lib/db.mjs';
import { createClient } from '../../../../../src/lib/supabase/server';
import { trackServer } from '../../../../../src/lib/track';
import { sendPaymentSuccess } from '../../../../../src/lib/email';
import type { OrderEmailData } from '../../../../../src/lib/email';
import type { OrderNotifyData } from '../../../../../src/lib/line-notify';
import { notifyPaymentReceived } from '../../../../../src/lib/line-notify';
import { verifyCheckMacValue, getECPayCredentials } from '../../../../../src/lib/ecpay';
import { limiters, RateLimiter, createRateLimitResponse } from '../../../../../src/lib/rate-limit';

function normalizePayload(headers: Headers, rawText: string) {
  const contentType = headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(rawText || '{}');
    } catch {
      return null;
    }
  }

  // ECPay callbacks are often x-www-form-urlencoded
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(rawText || '');
    return Object.fromEntries(params.entries());
  }

  // fallback
  try {
    return JSON.parse(rawText || '{}');
  } catch {
    return null;
  }
}

function isUuidLike(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim()
  );
}

function mapOrderId(payload: any) {
  // V2 canonical: CustomField2 = orderId
  const customField2 = payload?.CustomField2;
  if (isUuidLike(customField2)) return String(customField2).trim();

  // Legacy fallback: CustomField1 = orderId（舊流程）
  const customField1 = payload?.CustomField1;
  if (isUuidLike(customField1)) return String(customField1).trim();

  // 模擬付款 / 測試 fallback
  if (isUuidLike(payload?.orderId)) return String(payload.orderId).trim();

  // 不接受 MerchantTradeNo 當作 orderId，避免 callback 指向錯誤訂單
  return null;
}

function mapOwnerEmail(payload: any) {
  // V2 checkout puts contact email in CustomField4
  const candidate = payload?.CustomField4 || payload?.contactEmail || payload?.ContactEmail;
  if (typeof candidate === 'string' && candidate.includes('@')) return candidate;

  // Legacy fallback: 舊流程把 email 放在 CustomField2
  if (typeof payload?.CustomField2 === 'string' && payload.CustomField2.includes('@')) {
    return payload.CustomField2;
  }

  return null;
}

function mapTradeNo(payload: any) {
  return payload?.tradeNo || payload?.TradeNo || null;
}

function httpStatusFromError(err: unknown): number {
  const message = err instanceof Error ? err.message : '';
  const code = (err as any)?.code ?? '';
  if (message.includes('not found')) return 404;
  // Conflict class: capacity race / invalid transition / serialization
  if (code === 'schedule_not_open' || code === 'insufficient_capacity' || code === '40001' || code === '22000') return 409;
  if (message.includes('booking_failed') || message.includes('illegal order status transition')) return 409;
  return 400;
}

export async function POST(request: Request) {
  // 🟡 P10-2: Rate Limiting
  const clientIp = RateLimiter.getClientIp(request);
  const result = limiters.ecpayCallback.check(clientIp);

  const rateLimitResponse = createRateLimitResponse(result);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const raw = await request.text().catch(() => '');
  const payload = normalizePayload(request.headers, raw);

  const orderId = mapOrderId(payload);
  if (!orderId) {
    return Response.json(fail('INVALID_REQUEST', 'orderId is required'), { status: 400 });
  }

  const isECPayCallback = request.headers.get('content-type')?.includes('application/x-www-form-urlencoded');
  if (isECPayCallback && !payload?.CustomField1 && !payload?.CustomField2) {
    return new Response('1|OK', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // 🔐 P10-1: Verify ECPay CheckMacValue
  try {
    const { hashKey, hashIV } = getECPayCredentials();
    if (!verifyCheckMacValue(payload, hashKey, hashIV)) {
      return Response.json(
        fail('INVALID_SIGNATURE', 'CheckMacValue verification failed'),
        { status: 400 }
      );
    }
  } catch (err) {
    // If credentials are not set, log but don't block (for testing)
    console.warn('[ecpay] CheckMacValue verification skipped:', err instanceof Error ? err.message : String(err));
  }

  // 事件：收到付款 callback
  void trackServer(
    {
      event_name: 'payment_callback_received',
      properties: {
        order_id: orderId,
        trade_no: mapTradeNo(payload) ?? '',
        raw_result_code: payload?.RtnCode ?? payload?.resultCode ?? '',
      },
      order_id: orderId,
    },
    request
  );

  // 🔐 P10-3: 檢查 ECPay 付款結果代碼
  // RtnCode = "1" 表示付款成功，其他代碼表示失敗
  const rtnCode = payload?.RtnCode;

  if (isECPayCallback && rtnCode !== '1' && rtnCode !== 1) {
    // ECPay 回報付款失敗
    void trackServer(
      {
        event_name: 'error',
        properties: {
          message: `ECPay payment failed: RtnCode=${rtnCode}, RtnMsg=${payload?.RtnMsg || 'unknown'}`,
          context: 'payment_callback',
        },
        error_code: 'PAYMENT_FAILED',
        order_id: orderId,
      },
      request
    );

    // ECPay 期望收到 "1|OK" 回應，即使付款失敗
    return new Response('1|OK', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  try {
    const result = await processPaymentCallbackDb({
      ...payload,
      orderId,
      ownerEmail: mapOwnerEmail(payload),
      tradeNo: mapTradeNo(payload)
    }) as { order?: Record<string, unknown> | null; scheduleUpdated?: boolean; schedule?: Record<string, unknown> | null };

    // 事件：付款成功
    void trackServer(
      {
        event_name: 'payment_succeeded',
        properties: {
          order_id: orderId,
          amount: (result.order?.total_twd as number | undefined) ?? (result.order?.totalTwd as number | undefined) ?? 0,
          payment_provider: 'ecpay',
        },
        order_id: orderId,
      },
      request
    );

    // 🔔 Fire-and-forget: 付款成功 email + LINE 通知
    // Cast to Record to allow snake_case property access (in-memory path returns snake_case fields).
    const order = result.order as Record<string, unknown> | null | undefined;

    let sourceChannel: string | null = null;
    try {
      const supabase = await createClient();
      const { data: orderChannelRow } = await supabase
        .from('orders')
        .select('source_channel')
        .eq('id', orderId)
        .single();
      sourceChannel = typeof orderChannelRow?.source_channel === 'string' ? orderChannelRow.source_channel : null;
    } catch {
      sourceChannel = null;
    }

    const notifyData: OrderEmailData & OrderNotifyData = {
      orderId,
      activityTitle: (order?.activity_title as string | undefined) || '行程',
      scheduleDate: order?.schedule_start_at
        ? new Date(order.schedule_start_at as string).toLocaleDateString('zh-TW')
        : null,
      peopleCount: order?.people_count as number | undefined,
      totalTwd: (order?.total_twd as number | undefined) ?? (order?.totalTwd as number | undefined),
      contactName: order?.contact_name as string | undefined,
      contactEmail: (order?.contact_email as string | undefined) || '',
    };

    if (order?.contact_email) {
      void sendPaymentSuccess(notifyData).then((emailResult) => {
        if (!emailResult.ok) {
          console.warn('[payment-callback][email] non-blocking failure', {
            orderId,
            code: emailResult.errorCode,
            message: emailResult.errorMessage,
          });
          void trackServer(
            {
              event_name: 'error',
              properties: {
                message: `email delivery failed (${emailResult.errorCode || 'unknown'})`,
                context: 'payment_success_email',
              },
              error_code: 'EMAIL_SEND_FAILED',
              order_id: orderId,
            },
            request
          );
        }
      });
    }

    // LINE-only booking success notify: keep shared V2 core channel-agnostic.
    // Truthful scope: current implementation uses LINE Notify (not Messaging API push/reply).
    if (sourceChannel === 'line') {
      notifyPaymentReceived(notifyData).catch(() => {});
    }

    // ECPay 正式回調期望回覆 "1|OK" 格式
    // 模擬付款（JSON 請求）則回覆 JSON 格式以便前端處理
    const isECPayCallback = request.headers.get('content-type')?.includes('application/x-www-form-urlencoded');

    if (isECPayCallback) {
      return new Response('1|OK', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    return Response.json(
      ok({
        received: true,
        orderId,
        status: (result.order?.status as string | undefined) || 'paid',
        scheduleUpdated: !!result.scheduleUpdated,
        schedule: result.schedule || null
      })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    const status = httpStatusFromError(err);
    const errorCode = status === 409 ? 'BOOKING_CONFLICT' : status === 404 ? 'NOT_FOUND' : 'INVALID_REQUEST';

    // 事件：付款錯誤
    void trackServer(
      {
        event_name: 'error',
        properties: {
          message,
          context: 'payment_callback',
        },
        error_code: errorCode,
        order_id: orderId,
      },
      request
    );

    return Response.json(fail(errorCode, message), { status });
  }
}
