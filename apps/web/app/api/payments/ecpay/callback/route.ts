import { ok, fail } from '../../../../../src/lib/api';
import { processPaymentCallbackDb } from '../../../../../src/lib/db.mjs';

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

export async function POST(request: Request) {
  const raw = await request.text().catch(() => '');
  const payload = normalizePayload(request.headers, raw);

  const orderId = mapOrderId(payload);
  if (!orderId) {
    return Response.json(fail('INVALID_REQUEST', 'orderId is required'), { status: 400 });
  }

  try {
    const result = await processPaymentCallbackDb({
      ...payload,
      orderId,
      tradeNo: mapTradeNo(payload)
    });

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
    const status = message.includes('not found') ? 404 : 400;
    return Response.json(fail('INVALID_REQUEST', message), { status });
  }
}
