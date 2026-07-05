import { ok, fail } from '../../../../../../src/lib/api';
import { createRefundRequestDb, listRefundRequestsDb, getMyOrderDetailDb, recordRefundReversalDb } from '../../../../../../src/lib/db.mjs';
import { createClient } from '../../../../../../src/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
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
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../../../../../src/config/supabase-service-env.mjs';

export async function GET(_request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;

  try {
    const rows = await listRefundRequestsDb({ orderId });
    return Response.json(ok(rows));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;
  const body = await request.json().catch(() => ({}));

  try {
    // 從 session 取得 email（不再依賴 body.contactEmail）
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user?.email) {
      return Response.json(fail('UNAUTHORIZED', '請先登入'), { status: 401 });
    }

    const requestId = String(body?.requestId || '').trim();
    if (!requestId) {
      return Response.json(fail('INVALID_REQUEST', 'requestId is required'), { status: 400 });
    }

    // Compute policy_snapshot: non-blocking — failure stores null, does not abort submission
    let policySnapshot: (RefundResult & { policy_version: string }) | null = null;
    try {
      const order = await getMyOrderDetailDb({ orderId, contactEmail: user.email }).catch((): null => null);
      const tourStartAt = order?.scheduleStartAt;
      const totalTwd = order?.totalTwd;

      if (tourStartAt && typeof totalTwd === 'number') {
        type PolicyRow = { version: string; tiers: RefundPolicy['tiers'] };
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
      console.warn('[refund-request][policy-snapshot] non-blocking failure', {
        orderId,
        error: snapshotErr instanceof Error ? snapshotErr.message : String(snapshotErr),
      });
    }

    const created = await createRefundRequestDb({
      orderId,
      requestId,
      reason: body?.reason,
      note: body?.note,
      contactEmail: user.email, // 以 session email 為準
      policySnapshot,
    });

    // Auto-execute refund when REFUND_AUTO_EXECUTE=true (default off)
    // Non-blocking: failure logs a warning but does NOT propagate — order stays
    // in refund_pending for admin to handle manually.
    let autoExecuted = false;
    if (REFUND_AUTO_EXECUTE) {
      try {
        const refundableAmount = policySnapshot?.refundable_amount ?? null;
        const svcClient = createServiceClient(
          getSupabaseUrl()!,
          getSupabaseServiceRoleKey()!,
          { auth: { persistSession: false, autoRefreshToken: false } }
        );
        const { data: orderRow, error: fetchErr } = await svcClient
          .from('orders')
          .select('*')
          .eq('id', orderId)
          .single();

        if (fetchErr || !orderRow) {
          console.warn('[refund-auto-execute] Failed to fetch order row', { orderId });
        } else if (!orderRow.trade_no) {
          // Fix 1: Guard — only credit-card orders (must have trade_no)
          console.info('[refund-auto-execute] Skipped: no trade_no (cash/ATM/CVS order)', { orderId });
          // Leave as refund_pending — admin handles non-CC orders
        } else if (!policySnapshot?.eligible || !(refundableAmount !== null && refundableAmount > 0)) {
          // Fix 4: Explicit eligibility + amount check
          console.info('[refund-auto-execute] Skipped: ineligible or zero amount', {
            orderId,
            eligible: policySnapshot?.eligible,
            refundableAmount,
          });
        } else {
          // Proceed with executeRefund
          console.info('[refund-auto-execute] Triggering ECPay AllRefund', { orderId, refundableAmount });
          const execResult = await executeRefund({
            order: orderRow as Parameters<typeof executeRefund>[0]['order'],
            body: { reason: body?.reason },
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
            console.info('[refund-auto-execute] Success', { orderId, rtnCode: (execResult.body as any)?.data?.rtnCode });
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
            console.warn('[refund-auto-execute] ECPay returned non-200', { orderId, status: execResult.status });
          }
        }
      } catch (autoExecErr) {
        console.warn('[refund-auto-execute] Auto-execute failed, leaving refund_pending:', autoExecErr);
      }
    }

    // Fire-and-forget: email + LINE notification
    // Fix 2: Send correct notification based on whether auto-execute succeeded
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
        reason: body?.reason,
        note: body?.note,
      };
      const travelerPushBase = {
        orderId,
        activityTitle: notifyData.activityTitle,
        scheduleDate: notifyData.scheduleDate,
        peopleCount: notifyData.peopleCount,
        totalTwd: notifyData.totalTwd,
        reason: body?.reason,
        userId: user.id,
        contactEmail: user.email,
      };
      // 導遊推播 base：通知負責該團的導遊（未綁定 / 未開 LINE_GUIDE_PUSH_ENABLED 自動 skip）
      const guidePushBase = {
        orderId,
        experienceId: order.experienceId,
        activityTitle: notifyData.activityTitle,
        scheduleDate: notifyData.scheduleDate,
        peopleCount: notifyData.peopleCount,
        totalTwd: notifyData.totalTwd,
        reason: body?.reason,
      };
      if (autoExecuted) {
        // Auto-execute succeeded — send '退款已完成' notification
        void sendRefundExecuted(notifyData).catch(() => {});
        notifyRefundExecuted(notifyData).catch(() => {});
        // 旅客退款完成推播（未綁定/未開旗標時自動 skip）
        void pushTravelerOrderEvent({ ...travelerPushBase, kind: 'refund_executed' }).catch(() => {});
        void pushGuideOrderEvent({ ...guidePushBase, kind: 'guide_refund_executed' }).catch(() => {});
        void dispatchOrderEventEmails({
          orderId, kind: 'refund_executed', activityTitle: notifyData.activityTitle,
          scheduleDate: notifyData.scheduleDate, peopleCount: notifyData.peopleCount, totalTwd: notifyData.totalTwd,
        }).catch(() => {});
        void dispatchOrderEventTelegram({
          orderId, kind: 'refund_executed', activityTitle: notifyData.activityTitle,
          scheduleDate: notifyData.scheduleDate, peopleCount: notifyData.peopleCount, totalTwd: notifyData.totalTwd,
          experienceId: order.experienceId, userId: user.id, contactEmail: user.email,
        }).catch(() => {});
      } else {
        // Normal flow — admin will process
        void sendRefundRequested(notifyData).then((emailResult) => {
          if (!emailResult.ok) {
            console.warn('[refund-request][email] non-blocking failure', {
              orderId,
              code: emailResult.errorCode,
              message: emailResult.errorMessage,
            });
          }
        });
        notifyRefundRequest(notifyData).catch(() => {});
        // 旅客退款申請推播（未綁定/未開旗標時自動 skip）
        void pushTravelerOrderEvent({ ...travelerPushBase, kind: 'refund_requested' }).catch(() => {});
        void pushGuideOrderEvent({ ...guidePushBase, kind: 'guide_refund_requested' }).catch(() => {});
        void dispatchOrderEventEmails({
          orderId, kind: 'refund_requested', activityTitle: notifyData.activityTitle,
          scheduleDate: notifyData.scheduleDate, peopleCount: notifyData.peopleCount, totalTwd: notifyData.totalTwd,
        }).catch(() => {});
        void dispatchOrderEventTelegram({
          orderId, kind: 'refund_requested', activityTitle: notifyData.activityTitle,
          scheduleDate: notifyData.scheduleDate, peopleCount: notifyData.peopleCount, totalTwd: notifyData.totalTwd,
          experienceId: order.experienceId, userId: user.id, contactEmail: user.email,
        }).catch(() => {});
      }
    }

    return Response.json(ok(created));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    const status = message.includes('not found') ? 404 : 400;
    return Response.json(fail('INVALID_REQUEST', message), { status });
  }
}
