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
import { isAdminAuthorized, pickAdminCredentials } from '../../../../../../src/lib/admin-auth.mjs';
import {
  getAdminSecurityState,
  getRequiredAdminToken,
} from '../../../../../../src/lib/admin-session.mjs';
import { requestAllRefund, requestEcpayDoAction, queryEcpayTradeInfo } from '../../../../../../src/lib/ecpay';
import { createClient } from '@supabase/supabase-js';
import { executeRefund, executeEcpayReversal } from '../../../../../../src/lib/refund-execute';
import { recordRefundReversalDb } from '../../../../../../src/lib/db.mjs';
import { recordIncident } from '../../../../../../src/lib/incidents';
import { dispatchOrderEventTelegram } from '../../../../../../src/lib/order-telegram-notify.mjs';
import { pushTravelerOrderEvent } from '../../../../../../src/lib/line-traveler-push.mjs';
import { pushGuideOrderEvent } from '../../../../../../src/lib/line-guide-push.mjs';

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
  const { token, email, expiresAt, sessionVersion, requireSession } = pickAdminCredentials(request);

  const security = getAdminSecurityState();
  const auth = isAdminAuthorized({
    token,
    email,
    expiresAt,
    requiredToken: getRequiredAdminToken(process.env.ADMIN_ACCESS_TOKEN),
    allowlistRaw: process.env.ADMIN_EMAIL_ALLOWLIST,
    expectedSessionVersion: security.sessionVersion,
    sessionVersion: Number(sessionVersion || 0),
    requireSession,
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

  // Repair path: non-refund-pending orders, or refund_pending orders
  // that already have visible reversal evidence (e.g., payment_events) should
  // not re-trigger the provider.
  const canRepairRefundReversalByStatus =
    order.status === 'refunded' ||
    order.ecpay_refund_trade_no ||
    order.payment_status === 'refunded' ||
    order.payment_status === 'voided';

  const hasReversalExecutionEvidence = async () => {
    const { data, error } = await supabase
      .from('payment_events')
      .select('id')
      .eq('order_id', order.id)
      .eq('provider', 'ecpay')
      .in('event_type', ['authorization_voided', 'refunded'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(error.message || 'failed to inspect payment event evidence');
    }

    return !!data;
  };

  const shouldRepairFromEvidence =
    order.status === 'refund_pending' && (await hasReversalExecutionEvidence());

  if (order.status !== 'refund_pending' || shouldRepairFromEvidence) {
    if (!canRepairRefundReversalByStatus && !shouldRepairFromEvidence) {
      return Response.json(
        fail('INVALID_STATUS', 'order must be refund_pending to execute refund'),
        { status: 409 }
      );
    }

    try {
      const repairResult = await recordRefundReversalDb(supabase, {
        orderId: order.id,
        actor: 'refund-execute',
      });

      if (repairResult.reversed) {
        return Response.json(
          {
            ok: true,
            alreadyRefunded: true,
            repaired: repairResult.repaired || false,
            ...repairResult,
          },
          { status: 200 }
        );
      }

      return Response.json(fail('INVALID_STATUS', 'order has no reversal settlement records'), { status: 409 });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'failed to repair refund reversal records';
      return Response.json(fail('DB_UPDATE_FAILED', message), { status: 500 });
    }
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
          provider_status: providerStatus,
          trade_no: reversedTradeNo,
          updated_at: now,
        };

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

        let hasEventRecord = Array.isArray(eventResult.data) && eventResult.data.length > 0;

        if (eventResult.error) {
          const isDuplicateEventError =
            eventResult.error.code === '23505' || /duplicate key/i.test(eventResult.error.message || '');

          if (isDuplicateEventError) {
            const { data: existingEvent, error: eventLookupErr } = await supabase
              .from('payment_events')
              .select('id')
              .eq('payment_id', paymentId)
              .eq('order_id', targetOrderId)
              .eq('provider', 'ecpay')
              .eq('event_type', eventType)
              .eq('trade_no', reversedTradeNo)
              .maybeSingle();

            if (eventLookupErr) {
              return { error: { message: eventLookupErr.message || 'failed to verify existing payment event' }, data: [], count: 0 };
            }
            if (!existingEvent) {
              return { error: { message: eventResult.error.message || 'failed to insert payment event' }, data: [], count: 0 };
            }
            hasEventRecord = true;
          } else {
            return { error: { message: eventResult.error.message || 'failed to insert payment event' }, data: [], count: 0 };
          }
        }

        if (typeof eventResult.count === 'number' && eventResult.count < 1 && !hasEventRecord) {
          return { error: { message: 'payment event insert affected 0 rows' }, data: [], count: 0 };
        }

        if (!hasEventRecord) {
          return { error: { message: 'payment event insert returned no rows' }, data: [], count: 0 };
        }

        try {
          await recordRefundReversalDb(supabase, { orderId: targetOrderId, actor: 'refund-execute' });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'failed to record refund reversal';
          return { error: { message }, data: [], count: 0 };
        }

        const finalPaymentPatch: Record<string, unknown> = {
          status: eventType === 'authorization_voided' ? 'voided' : 'refunded',
          provider_status: providerStatus,
          trade_no: reversedTradeNo,
          updated_at: now,
        };
        if (eventType === 'authorization_voided') {
          finalPaymentPatch.voided_at = now;
        } else {
          finalPaymentPatch.refunded_at = now;
          finalPaymentPatch.refunded_amount_twd = refundedAmountTwd;
        }

        const finalPaymentResult = await supabase
          .from('payments')
          .update(finalPaymentPatch)
          .eq('id', paymentId)
          .select('id');
        if (finalPaymentResult.error) {
          return {
            error: { message: finalPaymentResult.error.message || 'failed to finalize payment status' },
            data: [],
            count: 0,
          };
        }

        if (typeof finalPaymentResult.count === 'number' && finalPaymentResult.count < 1) {
          return {
            error: { message: 'payment finalize update affected 0 rows' },
            data: [],
            count: 0,
          };
        }

        if (!Array.isArray(finalPaymentResult.data) || finalPaymentResult.data.length === 0) {
          return {
            error: { message: 'payment finalize update returned no rows' },
            data: [],
            count: 0,
          };
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

  // 🔔 Fire-and-forget：退款成功時派送 Telegram（管理員群組 + 導遊 + 旅客）。
  // 只在本次真的執行退款成功（200）時發送；前面的修復/冪等重放路徑已提前 return。
  if (outcome.status === 200) {
    void dispatchOrderEventTelegram({
      orderId,
      kind: 'refund_executed',
      peopleCount: order.people_count ?? undefined,
      totalTwd: order.total_twd ?? undefined,
      experienceId: order.activity_id ?? undefined,
      contactEmail: order.contact_email ?? undefined,
    }).catch(() => {});

    // 🔔 同步派送 LINE（旅客 + 導遊）；受後台通知矩陣與綁定/總開關約束，自動 skip。
    void pushTravelerOrderEvent({
      kind: 'refund_executed',
      orderId,
      peopleCount: order.people_count ?? undefined,
      totalTwd: order.total_twd ?? undefined,
      userId: order.user_id ?? undefined,
      contactEmail: order.contact_email ?? undefined,
    }).catch(() => {});
    void pushGuideOrderEvent({
      kind: 'guide_refund_executed',
      orderId,
      experienceId: order.activity_id ?? undefined,
      peopleCount: order.people_count ?? undefined,
      totalTwd: order.total_twd ?? undefined,
    }).catch(() => {});
  }

  return Response.json(outcome.body, { status: outcome.status });
}
