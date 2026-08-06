/**
 * #1649 Phase 6：實作自 legacy 路徑（app/api/admin/orders/[orderId]/refund-execute）整體搬遷至 v2 命名空間。
 * legacy 路徑已退役刪除；行為與測試契約以本檔為準。
 */
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
import { reportRouteError } from '../../../../../../../src/lib/route-error';
import { fail } from '../../../../../../../src/lib/api';
import { isAdminAuthorized, pickAdminCredentials } from '../../../../../../../src/lib/admin-auth.mjs';
import {
  getAdminSecurityState,
  getRequiredAdminToken,
} from '../../../../../../../src/lib/admin-session.mjs';
import { requestAllRefund, requestEcpayDoAction, queryEcpayTradeInfo } from '../../../../../../../src/lib/ecpay';
import { createClient } from '@supabase/supabase-js';
import { executeRefund, executeEcpayReversal, resolvePartialRefundStatus } from '../../../../../../../src/lib/refund-execute';
import { recordRefundReversalDb } from '../../../../../../../src/lib/db.mjs';
import { recordIncident } from '../../../../../../../src/lib/incidents';
import { dispatchOrderEventTelegram } from '../../../../../../../src/lib/order-telegram-notify.mjs';
import { pushTravelerOrderEvent } from '../../../../../../../src/lib/line-traveler-push.mjs';
import { pushGuideOrderEvent } from '../../../../../../../src/lib/line-guide-push.mjs';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../../../../../../src/config/supabase-service-env.mjs';
import {
  readCumulativeRefundTwd,
  checkRefundWithinRemaining,
  syncRefundToPayoutLedger,
  REFUND_EXCEEDS_REMAINING_CODE,
} from '../../../../../../../src/lib/settlement/refund-payout-sync.mjs';

function getServiceClient() {
  return createClient(
    getSupabaseUrl()!,
    getSupabaseServiceRoleKey()!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

/**
 * 本次退款額（TWD）。`refundAmount` 省略 → 全額（沿用 back-compat 行為）；
 * 傳了但不是正整數 → 回 null，交由 executor 的既有驗證回錯（不在此改變錯誤碼）。
 */
function resolveRequestedRefundTwd(
  refundAmount: number | string | null | undefined,
  totalTwd: number,
): number | null {
  if (refundAmount == null || refundAmount === '') return totalTwd;
  const parsed = Number(refundAmount);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
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
    // #1598：未預期例外上報（fire-and-forget，不改變回應行為）。
    void reportRouteError(err, { route: 'v2/admin/orders/[orderId]/refund-execute' });
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

  // Optional partial-refund amount (TWD). Omitted → full total_twd (back-compat).
  // Validation (positive integer ≤ total) is enforced inside the executors.
  const refundAmount = body?.refundAmount as number | string | null | undefined;

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

  // 部分退款須把訂單還原成「可結算」狀態（見 resolvePartialRefundStatus）。退款前狀態
  // 在訂單進入 refund_pending 時記入 audit_logs.metadata.previousOrderStatus；讀回最近一筆
  // refund_requested log 還原之，讓未退部分仍撥款給導遊。讀失敗則 fallback completed。
  let previousOrderStatus: string | null = null;
  try {
    const { data: refundLog } = await supabase
      .from('audit_logs')
      .select('metadata')
      .eq('order_id', order.id)
      .eq('action', 'refund_requested')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const prev = (refundLog?.metadata as { previousOrderStatus?: unknown } | null)?.previousOrderStatus;
    previousOrderStatus = typeof prev === 'string' ? prev : null;
  } catch {
    previousOrderStatus = null;
  }
  const partialTargetStatus = resolvePartialRefundStatus(previousOrderStatus);

  // #1777：本次退款額必須落在「訂單總額 − 累積已退」之內。
  // resolveRefundAmount（refund-execute.ts）只驗 `≤ total`，沒扣掉已退部分——
  // NT$1,000 的訂單連退兩次 800 都會過關，累積 1,600 > 總額，而錢已經從 provider
  // 出去了。這道關擋在呼叫 provider **之前**。
  //
  // 只在「已有累積退款」時介入，維持既有錯誤碼與行為不變（純加法變更）：
  // 首次退款的金額驗證仍由 executor 負責。累積額讀取失敗時放行——擋掉所有退款
  // 的代價高於這個競態風險，且 RPC 端仍會對超額累積留下
  // `refund_exceeds_order_total` 稽核作為後手。
  const priorRefund = await readCumulativeRefundTwd(supabase, orderId);
  if (!priorRefund.ok) {
    void recordIncident({
      source: 'admin_refund_execute',
      severity: 'warn',
      category: 'payment',
      message: 'failed to read cumulative refund before refund; remaining-amount guard skipped',
      metadata: { orderId, error: priorRefund.error },
    });
  } else if (priorRefund.cumulativeRefundTwd > 0) {
    const requestedRefundTwd = resolveRequestedRefundTwd(refundAmount, Number(order.total_twd) || 0);
    if (requestedRefundTwd != null) {
      const remaining = checkRefundWithinRemaining({
        totalTwd: Number(order.total_twd) || 0,
        cumulativeRefundTwd: priorRefund.cumulativeRefundTwd,
        refundAmountTwd: requestedRefundTwd,
      });
      if (!remaining.ok) {
        return Response.json(
          fail(REFUND_EXCEEDS_REMAINING_CODE, remaining.reason || 'refund amount exceeds remaining refundable'),
          { status: 409 },
        );
      }
    }
  }

  const latestReversiblePayment = await resolveLatestReversiblePayment(order.id);
  const shouldUseEcpayReversal = Boolean(latestReversiblePayment.payment) || latestReversiblePayment.ambiguous || Boolean(order.trade_no);

  const outcome = shouldUseEcpayReversal
    ? await executeEcpayReversal({
      order: order as any,
      body,
      refundAmount,
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
        partial,
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
    // #1598：未預期例外上報（fire-and-forget，不改變回應行為）。
    void reportRouteError(err, { route: 'v2/admin/orders/[orderId]/refund-execute' });
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

        // orders 真實 schema 只有 status + payment_status；refunded_amount / refunded_at /
        // ecpay_refund_trade_no 皆不存在（無 migration、無讀取點），寫入會 500。退款明細
        // （時間/trade_no/金額）已寫入 payments + payment_events；部分退款金額另記入
        // operations_tracking.refund_amount_twd（出帳真正讀的欄位）。
        // status：部分退刷（Action=R + partial）保持可結算狀態（還原退款前狀態），讓未退
        // 部分仍撥款給導遊；全額退款 / void（授權未請款，一律全額）維持 refunded。
        const orderResult = await supabase
          .from('orders')
          .update({
            status:
              eventType !== 'authorization_voided' && partial
                ? partialTargetStatus
                : 'refunded',
            // partial Action=R → partially_refunded；void/full → voided/refunded。
            payment_status:
              eventType === 'authorization_voided'
                ? 'voided'
                : partial
                ? 'partially_refunded'
                : 'refunded',
            updated_at: now,
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
      refundAmount,
      partialTargetStatus,
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

  // 出帳同步（#1777，owner 決策 B／C）：把**本次**退款額交給原子 RPC。
  //
  // RPC 在單一交易＋單一 `orders FOR UPDATE` 鎖內完成三件事：
  //   1. operations_tracking.refund_amount_twd += 本次金額（出帳真正讀的欄位）
  //   2. 以交易內累積額推導冪等鍵，追加 ledger 差額分錄
  //   3. 同步導遊餘額；餘額轉負則留 carry-forward 稽核（不靜默截成 0）
  //
  // 應用層刻意**不**自行讀寫 refund_amount_twd：先前的
  // `.update({ refund_amount_twd: 本次金額 })` 是覆寫而非累加，兩次部分退款只會
  // 留下最後一次的金額（導遊被多撥）；而以本次金額組冪等鍵又會讓兩次等額部分
  // 退款撞同一把鍵（第二次差額被吃掉）。兩者都是 #1777 的 P0。
  //
  // 冪等重放（alreadyRefunded）不進入本區塊；void 視為全額退款記 total。
  if (outcome.status === 200 && outcome.body && (outcome.body as { ok?: boolean }).ok) {
    const data = ((outcome.body as { data?: Record<string, unknown> }).data) ?? {};
    if (!data.alreadyRefunded) {
      let refundDeltaTwd: number | null = null;
      if (typeof data.refundedAmount === 'number') {
        refundDeltaTwd = data.refundedAmount;
      } else if (data.mode === 'authorization_voided') {
        // 授權尚未請款的全額 void：等同全額退款，記入訂單總額。
        // （void 要求尚未請款，因此不可能有前置的部分退款，累加語意仍正確。）
        refundDeltaTwd = Number(order.total_twd) || 0;
      }

      if (refundDeltaTwd != null) {
        try {
          const sync = await syncRefundToPayoutLedger(supabase, {
            orderId,
            refundDeltaTwd,
            actor: 'refund-execute',
          });

          if (sync.over_refund) {
            void recordIncident({
              source: 'admin_refund_execute',
              severity: 'error',
              category: 'payment',
              message: 'cumulative refund now exceeds order total (remaining-amount guard was bypassed)',
              metadata: {
                orderId,
                refundDeltaTwd,
                cumulativeRefundTwd: sync.cumulative_refund_twd,
                orderTotalTwd: Number(order.total_twd) || 0,
              },
            });
          }

          if (sync.carry_forward_twd > 0) {
            void recordIncident({
              source: 'admin_refund_execute',
              severity: 'warn',
              category: 'payment',
              message: 'refund exceeded settled balance; guide balance is negative and must be recovered',
              metadata: {
                orderId,
                refundDeltaTwd,
                carryForwardTwd: sync.carry_forward_twd,
                balanceAfter: sync.balance_after,
              },
            });
          }
        } catch (syncErr) {
          // 退款本身已成功（provider 端已出款），不因帳務同步失敗而回滾。
          // 注意：累積額與 ledger 差額在**同一交易**內，失敗代表**兩者皆未寫入**——
          // 因此需要人工補登，而非只是「ledger 可能過時」。
          void recordIncident({
            source: 'admin_refund_execute',
            severity: 'error',
            category: 'payment',
            message: 'refund executed but refund_amount_twd accumulation and payout ledger adjustment both failed'
              + ' (single transaction; manual backfill required before next settlement)',
            metadata: {
              orderId,
              refundDeltaTwd,
              error: syncErr instanceof Error ? syncErr.message : String(syncErr),
            },
          });
        }
      }
    }
  }

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
