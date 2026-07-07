/**
 * GET/POST /api/v2/orders/[orderId]/refund-requests — 退款申請（#1649 Phase 2）
 *
 * legacy /api/me/orders/[orderId]/refund-requests 的 v2 對應，行為等價：
 * - GET：訂單退款申請列表。
 * - POST：提交退款申請（requestId 冪等）；政策快照 best-effort；
 *   REFUND_AUTO_EXECUTE=true 時嘗試 ECPay AllRefund 自動退款（失敗不阻斷，
 *   訂單停留 refund_pending 由 admin 處理）；申請/完成通知全通路扇出。
 *
 * Auth：登入旅客；CSRF route 內顯式驗證（middleware 不涵蓋 /api/v2 非 admin）。
 */
import { validateCsrf } from '../../../../../../src/lib/csrf.mjs';
import { jsonOk, jsonError } from '../../../../../../src/lib/api-response';
import { handleRouteError } from '../../../../../../src/lib/route-error';
import { parseBody } from '../../../../../../src/lib/validation/parse-body';
import { RefundRequestBodySchema } from '../../../../../../src/lib/validation/traveler-order-schemas';
import { getTravelerIdentity } from '../../../../../../src/lib/v2/traveler-auth';
import { createRefundRequestDb, listRefundRequestsDb, getMyOrderDetailDb, recordRefundReversalDb, hasSupabaseEnv } from '../../../../../../src/lib/db.mjs';
import { createClient } from '../../../../../../src/lib/supabase/server';
import { createServiceRoleClient } from '../../../../../../src/lib/supabase/service';
import { sendRefundRequested, sendRefundExecuted } from '../../../../../../src/lib/email';
import type { OrderEmailData } from '../../../../../../src/lib/email';
import type { OrderNotifyData } from '../../../../../../src/lib/line-notify';
import { notifyRefundRequest, notifyRefundExecuted } from '../../../../../../src/lib/line-notify';
import { pushTravelerOrderEvent } from '../../../../../../src/lib/line-traveler-push.mjs';
import { pushGuideOrderEvent } from '../../../../../../src/lib/line-guide-push.mjs';
import { dispatchOrderEventEmails } from '../../../../../../src/lib/order-email-notify';
import { dispatchOrderEventTelegram } from '../../../../../../src/lib/order-telegram-notify.mjs';
import { calculateRefundAmount } from '../../../../../../src/lib/refund-policy';
import type { RefundPolicy, RefundResult } from '../../../../../../src/lib/refund-policy';
import { REFUND_AUTO_EXECUTE, executeRefund } from '../../../../../../src/lib/refund-execute';
import { requestAllRefund } from '../../../../../../src/lib/ecpay';

export async function GET(_request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;

  try {
    const rows = await listRefundRequestsDb({ orderId });
    return jsonOk(rows);
  } catch (err) {
    return handleRouteError(err, { route: 'v2/orders/refund-requests/list' });
  }
}

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const csrfError = validateCsrf(request);
  if (csrfError) return csrfError;

  const { orderId } = await context.params;

  const parsed = await parseBody(request, RefundRequestBodySchema);
  if (!parsed.ok) return parsed.response;
  const { requestId, reason, note } = parsed.data;

  try {
    // 以 session email 為準（不信任 body.contactEmail）
    const user = await getTravelerIdentity();
    if (!user?.email) {
      return jsonError('UNAUTHORIZED', 'Please login first', 401);
    }

    // Compute policy_snapshot: non-blocking — failure stores null, does not abort submission
    let policySnapshot: (RefundResult & { policy_version: string }) | null = null;
    try {
      const order = await getMyOrderDetailDb({ orderId, contactEmail: user.email }).catch((): null => null);
      const tourStartAt = order?.scheduleStartAt;
      const totalTwd = order?.totalTwd;

      if (tourStartAt && typeof totalTwd === 'number' && hasSupabaseEnv()) {
        type PolicyRow = { version: string; tiers: RefundPolicy['tiers'] };
        const supabase = await createClient();
        const { data: policyRow } = await supabase
          .from('refund_policies')
          .select('version, tiers')
          .eq('is_active', true)
          .limit(1)
          .maybeSingle() as { data: PolicyRow | null };

        if (policyRow?.tiers) {
          const result = calculateRefundAmount(
            totalTwd,
            new Date(tourStartAt),
            { version: policyRow.version, tiers: policyRow.tiers }
          );
          policySnapshot = { ...result, policy_version: policyRow.version };
        }
      }
    } catch (snapshotErr) {
      console.warn('[v2-refund-request][policy-snapshot] non-blocking failure', {
        orderId,
        error: snapshotErr instanceof Error ? snapshotErr.message : String(snapshotErr),
      });
    }

    const created = await createRefundRequestDb({
      orderId,
      requestId,
      reason,
      note,
      contactEmail: user.email,
      policySnapshot,
    });

    // Auto-execute refund when REFUND_AUTO_EXECUTE=true（default off）
    // Non-blocking：失敗只記 warning，不外傳——訂單停留 refund_pending 由 admin 處理。
    let autoExecuted = false;
    if (REFUND_AUTO_EXECUTE && hasSupabaseEnv()) {
      try {
        const refundableAmount = policySnapshot?.refundable_amount ?? null;
        const svcClient = createServiceRoleClient();
        const { data: orderRow, error: fetchErr } = await svcClient
          .from('orders')
          .select('*')
          .eq('id', orderId)
          .single();

        if (fetchErr || !orderRow) {
          console.warn('[v2-refund-auto-execute] Failed to fetch order row', { orderId });
        } else if (!orderRow.trade_no) {
          // Guard — only credit-card orders (must have trade_no)
          console.info('[v2-refund-auto-execute] Skipped: no trade_no (cash/ATM/CVS order)', { orderId });
        } else if (!policySnapshot?.eligible || !(refundableAmount !== null && refundableAmount > 0)) {
          console.info('[v2-refund-auto-execute] Skipped: ineligible or zero amount', {
            orderId,
            eligible: policySnapshot?.eligible,
            refundableAmount,
          });
        } else {
          console.info('[v2-refund-auto-execute] Triggering ECPay AllRefund', { orderId, refundableAmount });
          const execResult = await executeRefund({
            order: orderRow as Parameters<typeof executeRefund>[0]['order'],
            body: { reason },
            requestAllRefund,
            updateOrder: async (oid, payload) => {
              const { data, error, count } = await svcClient
                .from('orders')
                .update(payload)
                .eq('id', oid)
                .select('id');
              return { error, data, count };
            },
            postRefundHook: async (refundedOrderId) => {
              await recordRefundReversalDb(svcClient, { orderId: refundedOrderId, actor: 'refund-auto-execute' });
            },
          });
          if (execResult.status === 200) {
            autoExecuted = true;
            // Sync refund_requests to terminal 'refunded' state (mirrors orders update above)
            const now = new Date().toISOString();
            await svcClient
              .from('refund_requests')
              .update({
                status: 'refunded',
                approved_at: now,
                refunded_at: now,
                admin_note: '[auto-execute] ECPay AllRefund succeeded',
              })
              .eq('id', created.id)
              .eq('status', 'requested'); // guard: only advance if still in initial state
          } else {
            console.warn('[v2-refund-auto-execute] ECPay returned non-200', { orderId, status: execResult.status });
          }
        }
      } catch (autoExecErr) {
        console.warn('[v2-refund-auto-execute] Auto-execute failed, leaving refund_pending:', autoExecErr);
      }
    }

    // Fire-and-forget: email + LINE + Telegram（auto-execute 成功與否決定通知種類）
    const order = await getMyOrderDetailDb({ orderId, contactEmail: user.email }).catch((): null => null);
    if (order) {
      const notifyData: OrderEmailData & OrderNotifyData & { reason?: string; note?: string } = {
        orderId,
        activityTitle: order.title || '行程',
        scheduleDate: null,
        peopleCount: order.peopleCount,
        totalTwd: order.totalTwd,
        contactName: order.contactName || undefined,
        contactEmail: user.email,
        reason,
        note,
      };
      const travelerPushBase = {
        orderId,
        activityTitle: notifyData.activityTitle,
        scheduleDate: notifyData.scheduleDate,
        peopleCount: notifyData.peopleCount,
        totalTwd: notifyData.totalTwd,
        reason,
        userId: user.id ?? undefined,
        contactEmail: user.email,
      };
      const guidePushBase = {
        orderId,
        experienceId: order.experienceId,
        activityTitle: notifyData.activityTitle,
        scheduleDate: notifyData.scheduleDate,
        peopleCount: notifyData.peopleCount,
        totalTwd: notifyData.totalTwd,
        reason,
      };
      if (autoExecuted) {
        void sendRefundExecuted(notifyData).catch(() => {});
        notifyRefundExecuted(notifyData).catch(() => {});
        void pushTravelerOrderEvent({ ...travelerPushBase, kind: 'refund_executed' }).catch(() => {});
        void pushGuideOrderEvent({ ...guidePushBase, kind: 'guide_refund_executed' }).catch(() => {});
        void dispatchOrderEventEmails({
          orderId, kind: 'refund_executed', activityTitle: notifyData.activityTitle,
          scheduleDate: notifyData.scheduleDate, peopleCount: notifyData.peopleCount, totalTwd: notifyData.totalTwd,
        }).catch(() => {});
        void dispatchOrderEventTelegram({
          orderId, kind: 'refund_executed', activityTitle: notifyData.activityTitle,
          scheduleDate: notifyData.scheduleDate, peopleCount: notifyData.peopleCount, totalTwd: notifyData.totalTwd,
          experienceId: order.experienceId, userId: user.id ?? undefined, contactEmail: user.email,
        }).catch(() => {});
      } else {
        void sendRefundRequested(notifyData).then((emailResult) => {
          if (!emailResult.ok) {
            console.warn('[v2-refund-request][email] non-blocking failure', {
              orderId,
              code: emailResult.errorCode,
              message: emailResult.errorMessage,
            });
          }
        });
        notifyRefundRequest(notifyData).catch(() => {});
        void pushTravelerOrderEvent({ ...travelerPushBase, kind: 'refund_requested' }).catch(() => {});
        void pushGuideOrderEvent({ ...guidePushBase, kind: 'guide_refund_requested' }).catch(() => {});
        void dispatchOrderEventEmails({
          orderId, kind: 'refund_requested', activityTitle: notifyData.activityTitle,
          scheduleDate: notifyData.scheduleDate, peopleCount: notifyData.peopleCount, totalTwd: notifyData.totalTwd,
        }).catch(() => {});
        void dispatchOrderEventTelegram({
          orderId, kind: 'refund_requested', activityTitle: notifyData.activityTitle,
          scheduleDate: notifyData.scheduleDate, peopleCount: notifyData.peopleCount, totalTwd: notifyData.totalTwd,
          experienceId: order.experienceId, userId: user.id ?? undefined, contactEmail: user.email,
        }).catch(() => {});
      }
    }

    return jsonOk(created);
  } catch (err) {
    // 與 legacy 等價：業務規則拒絕（資格/狀態/重複）以原訊息回 400，不進 incident。
    const message = err instanceof Error ? err.message : 'unknown error';
    const status = message.includes('not found') ? 404 : 400;
    return jsonError('INVALID_REQUEST', message, status);
  }
}
