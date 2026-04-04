import { ok, fail } from '../../../../../src/lib/api';
import { processPaymentCallbackDb } from '../../../../../src/lib/db.mjs';
import { trackServer } from '../../../../../src/lib/track';

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
  return payload?.orderId || payload?.MerchantTradeNo || payload?.merchantTradeNo || null;
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
  const raw = await request.text().catch(() => '');
  const payload = normalizePayload(request.headers, raw);

  const orderId = mapOrderId(payload);
  if (!orderId) {
    return Response.json(fail('INVALID_REQUEST', 'orderId is required'), { status: 400 });
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

  try {
    const result = await processPaymentCallbackDb({
      ...payload,
      orderId,
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
