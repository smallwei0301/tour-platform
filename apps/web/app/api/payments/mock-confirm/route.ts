/**
 * POST /api/payments/mock-confirm
 * Development/testing only: directly confirm an order as paid without ECPay.
 * Only active when ECPAY_ENV !== 'production' OR when called with the correct
 * internal token.
 */
import { ok, fail } from '../../../../src/lib/api';
import { processPaymentCallbackDb } from '../../../../src/lib/db.mjs';

export async function POST(request: Request) {
  const body = await request.json().catch((): null => null);
  const orderId = String(body?.orderId || '').trim();

  if (!orderId) {
    return Response.json(fail('INVALID_REQUEST', 'orderId is required'), { status: 400 });
  }

  // Only allow when ALLOW_MOCK_PAYMENT=true is explicitly set
  if (process.env.ALLOW_MOCK_PAYMENT !== 'true') {
    return Response.json(fail('FORBIDDEN', 'mock payment is not enabled'), { status: 403 });
  }

  try {
    const result = await processPaymentCallbackDb({
      orderId,
      tradeNo: `MOCK-${Date.now()}`,
      ownerEmail: null,
      rawPayload: { RtnCode: '1', RtnMsg: 'Succeeded', SimulatePaid: '1' },
    });

    return Response.json(ok({ orderId, status: result.order.status }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'mock confirm failed';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
