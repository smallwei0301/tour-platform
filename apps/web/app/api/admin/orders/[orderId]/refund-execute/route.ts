/**
 * POST /api/admin/orders/[orderId]/refund-execute
 * Issue #369 — ECPay AllRefund API client + admin execute endpoint
 *
 * Executes a full ECPay refund (Action=R / AllRefund) for a confirmed order
 * that is in refund_pending status.
 *
 * AC2: admin-only (isAdminAuthorized → 401), validates refund_pending status
 * AC3: on success, persists status=refunded, refunded_amount, refunded_at, ecpay_refund_trade_no
 * AC4: idempotency — if ecpay_refund_trade_no already set, returns alreadyRefunded:true without calling ECPay
 * AC5: cash orders (no trade_no) — skip ECPay, require reason, mark refunded directly
 */
import { fail } from '../../../../../../src/lib/api';
import { isAdminAuthorized } from '../../../../../../src/lib/admin-auth.mjs';
import {
  getAdminSecurityState,
  getRequiredAdminToken,
} from '../../../../../../src/lib/admin-session.mjs';
import { requestAllRefund, requestEcpayDoAction, queryEcpayTradeInfo } from '../../../../../../src/lib/ecpay';
import { createClient } from '@supabase/supabase-js';
import { executeRefund, executeEcpayReversal } from '../../../../../../src/lib/refund-execute';
import { recordRefundReversalDb } from '../../../../../../src/lib/db.mjs';
import { recordIncident } from '../../../../../../src/lib/incidents';

function parseCookie(req: Request, key: string) {
  const cookie = req.headers.get('cookie') || '';
  const parts = cookie.split(';').map((s) => s.trim());
  const hit = parts.find((p) => p.startsWith(`${key}=`));
  return hit ? decodeURIComponent(hit.slice(key.length + 1)) : '';
}

function getServiceClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ orderId: string }> }
) {
  // AC2: admin auth guard
  const token = parseCookie(request, 'admin_token');
  const email = parseCookie(request, 'admin_email');
  const expiresAt = parseCookie(request, 'admin_session_expires_at');
  const sessionVersion = Number(
    parseCookie(request, 'admin_session_version') || 0
  );

  const security = getAdminSecurityState();
  const auth = isAdminAuthorized({
    token,
    email,
    expiresAt,
    requiredToken: getRequiredAdminToken(process.env.ADMIN_ACCESS_TOKEN),
    allowlistRaw: process.env.ADMIN_EMAIL_ALLOWLIST,
    expectedSessionVersion: security.sessionVersion,
    sessionVersion,
  });

  if (!auth.ok) {
    return Response.json(
      fail('UNAUTHORIZED', auth.reason || 'unauthorized'),
      { status: 401 }
    );
  }

  const { orderId } = await context.params;

  const supabase = getServiceClient();

  // Fetch order
  const { data: order, error: fetchError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (fetchError || !order) {
    return Response.json(
      fail('NOT_FOUND', `order ${orderId} not found`),
      { status: 404 }
    );
  }

  // AC2: order must be in refund_pending status
  if (order.status !== 'refund_pending') {
    return Response.json(
      fail('INVALID_STATUS', 'order must be refund_pending to execute refund'),
      { status: 409 }
    );
  }

  // Parse body (required for cash orders; optional for ECPay orders)
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // body is optional for ECPay orders
  }

  const resolveLatestReversiblePayment = async (targetOrderId: string) => {
    const { data, error } = await supabase
      .from('payments')
      .select('id, order_id, merchant_trade_no, trade_no, status, provider_status, amount_twd, created_at')
      .eq('order_id', targetOrderId)
      .eq('provider', 'ecpay')
      .in('status', ['pending', 'authorized', 'paid'])
      .order('created_at', { ascending: false })
      .limit(2);

    if (error) return { payment: null, ambiguous: false };
    const rows = Array.isArray(data) ? data : [];
    if (rows.length !== 1) {
      return { payment: null, ambiguous: rows.length > 1 };
    }
    return { payment: rows[0] as any, ambiguous: false };
  };

  const latestReversiblePayment = await resolveLatestReversiblePayment(order.id);
  const shouldUseEcpayReversal = Boolean(latestReversiblePayment.payment) || latestReversiblePayment.ambiguous || Boolean(order.trade_no);

  const outcome = shouldUseEcpayReversal
    ? await executeEcpayReversal({
      order: order as any,
      body,
      resolveLatestReversiblePayment: async () => latestReversiblePayment,
      queryTradeInfo: async (merchantTradeNo) => queryEcpayTradeInfo({ merchantTradeNo }),
      requestDoAction: async ({ merchantTradeNo, tradeNo, totalAmount, reason, action }) => requestEcpayDoAction({
        merchantTradeNo,
        tradeNo,
        totalAmount,
        reason,
        action,
      }),
      persistReversal: async ({
        orderId: targetOrderId,
        paymentId,
        paymentMerchantTradeNo,
        eventType,
        providerStatus,
        reversedTradeNo,
        refundedAmountTwd,
      }) => {
        const now = new Date().toISOString();

        const paymentPatch: Record<string, unknown> = {
          status: eventType === 'authorization_voided' ? 'voided' : 'refunded',
          provider_status: providerStatus,
          trade_no: reversedTradeNo,
          updated_at: now,
        };
        if (eventType === 'authorization_voided') {
          paymentPatch.voided_at = now;
        } else {
          paymentPatch.refunded_at = now;
          paymentPatch.refunded_amount_twd = refundedAmountTwd;
        }

        const paymentResult = await supabase
          .from('payments')
          .update(paymentPatch)
          .eq('id', paymentId)
          .select('id');

        if (paymentResult.error) {
          return { error: { message: paymentResult.error.message || 'failed to update payment' }, data: [], count: 0 };
        }

        if (typeof paymentResult.count === 'number' && paymentResult.count < 1) {
          return { error: { message: 'payment update affected 0 rows' }, data: [], count: 0 };
        }

        if (!Array.isArray(paymentResult.data) || paymentResult.data.length === 0) {
          return { error: { message: 'payment update returned no rows' }, data: [], count: 0 };
        }

        const orderResult = await supabase
          .from('orders')
          .update({
            status: 'refunded',
            payment_status: eventType === 'authorization_voided' ? 'voided' : 'refunded',
            refunded_at: now,
            refunded_amount: refundedAmountTwd ?? 0,
            ecpay_refund_trade_no: reversedTradeNo,
          })
          .eq('id', targetOrderId)
          .select('id');

        if (orderResult.error) {
          return { error: { message: orderResult.error.message || 'failed to update order' }, data: [], count: 0 };
        }

        if (typeof orderResult.count === 'number' && orderResult.count < 1) {
          return { error: { message: 'order update affected 0 rows' }, data: [], count: 0 };
        }

        if (!Array.isArray(orderResult.data) || orderResult.data.length === 0) {
          return { error: { message: 'order update returned no rows' }, data: [], count: 0 };
        }

        const eventResult = await supabase
          .from('payment_events')
          .insert({
            payment_id: paymentId,
            order_id: targetOrderId,
            provider: 'ecpay',
            event_type: eventType,
            merchant_trade_no: paymentMerchantTradeNo || null,
            trade_no: reversedTradeNo,
            payload: { source: 'admin_refund_execute', mode: eventType },
          })
          .select('id');

        if (eventResult.error) {
          return { error: { message: eventResult.error.message || 'failed to insert payment event' }, data: [], count: 0 };
        }

        if (typeof eventResult.count === 'number' && eventResult.count < 1) {
          return { error: { message: 'payment event insert affected 0 rows' }, data: [], count: 0 };
        }

        if (!Array.isArray(eventResult.data) || eventResult.data.length === 0) {
          return { error: { message: 'payment event insert returned no rows' }, data: [], count: 0 };
        }

        try {
          await recordRefundReversalDb(supabase, { orderId: targetOrderId, actor: 'refund-execute' });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'failed to record refund reversal';
          return { error: { message }, data: [], count: 0 };
        }

        return { error: null, data: [{ id: targetOrderId }], count: 1 };
      },
      recordIncident: ({ message, metadata }) => {
        void recordIncident({
          source: 'admin_refund_execute',
          severity: 'warn',
          category: 'payment',
          message,
          metadata: { orderId, ...metadata },
        });
      },
    })
    : await executeRefund({
      order: order as any,
      body,
      requestAllRefund,
      updateOrder: async (targetOrderId, payload) => {
        const { data, error, count } = await supabase
          .from('orders')
          .update(payload)
          .eq('id', targetOrderId)
          .select('id');
        return { error, data, count };
      },
      postRefundHook: async (refundedOrderId) => {
        await recordRefundReversalDb(supabase, { orderId: refundedOrderId, actor: 'refund-execute' });
      },
    });

  return Response.json(outcome.body, { status: outcome.status });
}
