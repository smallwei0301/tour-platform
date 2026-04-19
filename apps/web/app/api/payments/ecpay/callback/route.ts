import { ok, fail } from '../../../../../src/lib/api';
import { processPaymentCallbackDb } from '../../../../../src/lib/db.mjs';
import { trackServer } from '../../../../../src/lib/track';
import { sendPaymentSuccess } from '../../../../../src/lib/email';
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

function mapOrderId(payload: any) {
  // 優先使用 CustomField1（我們存放 orderId 的地方）
  // 然後是直接傳入的 orderId（模擬付款用）
  // 不再接受 MerchantTradeNo 當作 orderId，避免 callback 指向錯誤訂單
  return payload?.CustomField1 || payload?.orderId || null;
}

function mapOwnerEmail(payload: any) {
  return payload?.CustomField2 || payload?.contactEmail || payload?.ContactEmail || null;
}

function mapTradeNo(payload: any) {
  return payload?.tradeNo || payload?.TradeNo || null;
}

function httpStatusFromError(err: unknown): number {
  const message = err instanceof Error ? err.message : '';
  const code = (err as any)?.code ?? '';
  if (message.includes('not found')) return 404;
  // schedule_not_open or insufficient_capacity → 409 Conflict
  if (code === 'schedule_not_open' || code === 'insufficient_capacity') return 409;
  if (message.includes('booking_failed')) return 409;
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
  if (isECPayCallback && !payload?.CustomField1) {
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
    });

    // 事件：付款成功
    void trackServer(
      {
        event_name: 'payment_succeeded',
        properties: {
          order_id: orderId,
          amount: result.order?.total_twd ?? 0,
          payment_provider: 'ecpay',
        },
        order_id: orderId,
      },
      request
    );

    // 🔔 Fire-and-forget: 付款成功 email + LINE 通知
    const order = result.order;
    const notifyData = {
      orderId,
      activityTitle: order?.activity_title || '行程',
      scheduleDate: order?.schedule_start_at
        ? new Date(order.schedule_start_at).toLocaleDateString('zh-TW')
        : null,
      peopleCount: order?.people_count,
      totalTwd: order?.total_twd,
      contactName: order?.contact_name,
      contactEmail: order?.contact_email,
    };

    if (order?.contact_email) {
      sendPaymentSuccess(notifyData).catch(() => {}); // 絕對不阻塞 response
    }

    // LINE Notify 通知管理員/導遊
    notifyPaymentReceived(notifyData).catch(() => {});

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
        status: result.order?.status || 'paid',
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
