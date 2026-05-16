import { processRefundCallbackDb } from '../../../../../src/lib/db.mjs';
import { verifyCheckMacValue, getECPayCredentials } from '../../../../../src/lib/ecpay';
import { limiters, RateLimiter, createRateLimitResponse } from '../../../../../src/lib/rate-limit';
import { recordIncident } from '../../../../../src/lib/incidents';
import { trackServer } from '../../../../../src/lib/track';
import { createClient } from '../../../../../src/lib/supabase/server';

function normalizePayload(headers: Headers, rawText: string) {
  const contentType = headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(rawText || '{}');
    } catch {
      return null;
    }
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(rawText || '');
    return Object.fromEntries(params.entries());
  }

  try {
    return JSON.parse(rawText || '{}');
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  // Rate limiting — reuse ecpayCallback limiter bucket
  const clientIp = RateLimiter.getClientIp(request);
  const result = limiters.ecpayCallback.check(clientIp);

  const rateLimitResponse = createRateLimitResponse(result);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const raw = await request.text().catch(() => '');
  const payload = normalizePayload(request.headers, raw);

  if (!payload) {
    return new Response('Bad Request', { status: 400 });
  }

  const merchantTradeNo: string = String(payload?.MerchantTradeNo || '').trim();
  const tradeNo: string = String(payload?.TradeNo || payload?.tradeNo || '').trim();

  // 🔐 Verify ECPay CheckMacValue
  try {
    const { hashKey, hashIV } = getECPayCredentials();
    if (!verifyCheckMacValue(payload, hashKey, hashIV)) {
      return new Response('Invalid signature', { status: 400 });
    }
  } catch (err) {
    // If credentials are not set, log but don't block (for testing)
    console.warn(
      '[ecpay-refund-callback] CheckMacValue verification skipped:',
      err instanceof Error ? err.message : String(err)
    );
  }

  // Track refund callback received
  void trackServer(
    {
      event_name: 'refund_callback_received',
      properties: {
        merchant_trade_no: merchantTradeNo,
        trade_no: tradeNo,
        raw_result_code: String(payload?.RtnCode ?? ''),
      },
    },
    request
  );

  const rtnCode = payload?.RtnCode;

  // RtnCode !== '1' means refund failed — record incident, do NOT mutate DB
  if (rtnCode !== '1' && rtnCode !== 1) {
    void recordIncident({
      source: 'ecpay_refund_callback',
      severity: 'error',
      category: 'payment',
      message: `ECPay refund failed: RtnCode=${rtnCode}, RtnMsg=${payload?.RtnMsg || 'unknown'}`,
      metadata: {
        merchantTradeNo,
        tradeNo,
        rtnCode,
        rtnMsg: payload?.RtnMsg || 'unknown',
      },
    });

    // Always return 1|OK to ECPay even on failure
    return new Response('1|OK', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  try {
    const supabase = await createClient();

    // Soft-launch guard — refund_manual_only: skip auto-execution, return OK to ECPay
    {
      const { createClient: createServiceClient } = await import('@supabase/supabase-js');
      const { getControls } = await import('../../../../../src/lib/soft-launch.mjs');
      const svc = createServiceClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
      const controls = await getControls(svc);
      if (controls.refund_manual_only) {
        return new Response('1|OK (refund_manual_only mode)', { status: 200, headers: { 'content-type': 'text/plain' } });
      }
    }

    const dbResult = await processRefundCallbackDb(supabase, {
      merchantTradeNo,
      tradeNo,
      rawPayload: payload,
    });

    if (dbResult.alreadyRefunded) {
      // Idempotent — already processed, no DB side effects
      return new Response('1|OK', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    void trackServer(
      {
        event_name: 'refund_succeeded',
        properties: {
          order_id: dbResult.orderId ?? '',
          refund_request_id: dbResult.refundRequestId ?? '',
          merchant_trade_no: merchantTradeNo,
        },
        order_id: dbResult.orderId ?? '',
      },
      request
    );

    return new Response('1|OK', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';

    void trackServer(
      {
        event_name: 'error',
        properties: {
          message,
          context: 'refund_callback',
        },
        error_code: 'REFUND_CALLBACK_ERROR',
      },
      request
    );

    void recordIncident({
      source: 'ecpay_refund_callback',
      severity: 'error',
      category: 'payment',
      message: `refund callback DB error: ${message}`,
      metadata: { merchantTradeNo, tradeNo },
    });

    // Still return 1|OK to ECPay so it doesn't retry indefinitely
    return new Response('1|OK', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}
