import { ok, fail } from '../../../../../../src/lib/api';
import {
  getAdminOrderDetailDb,
  cancelOrderAdminDb,
  createAdminPosRefundEntryDb,
} from '../../../../../../src/lib/db.mjs';
import { createClient } from '@supabase/supabase-js';

// AC5: statuses that lock the order against cancellation
const LOCKED_STATUSES = [
  'refunded',
  'refund_pending',
  'completed',
  'cancelled_by_user',
  'cancelled_by_guide',
];

async function getSupabaseForAudit() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await context.params;
  const body = await request.json().catch(() => ({}));

  const requestId: string =
    (body?.requestId as string | undefined) ||
    `admin-cancel-${orderId}`;

  try {
    // 1. Fetch order to validate existence and current status
    const order = await getAdminOrderDetailDb({ orderId });

    // AC5: 409 if already in a locked / terminal status
    if (LOCKED_STATUSES.includes(order.status)) {
      return Response.json(
        fail('ORDER_CANCEL_LOCKED', 'cannot cancel order in current status'),
        { status: 409 }
      );
    }

    // 2. Cancel order + release seats via cancelOrderAdminDb
    //    (works for any cancellable status, sets cancelled_by_guide in DB)
    await cancelOrderAdminDb({ orderId });

    // 3. Create full-amount refund entry — idempotent via requestId
    const refundResult = await createAdminPosRefundEntryDb({
      orderId,
      requestId,
      adminNote: (body?.adminNote as string | undefined) || 'admin cancel + refund',
    });

    // 4. Write audit log (best-effort — do not fail the cancel on audit error)
    try {
      const supabase = await getSupabaseForAudit();
      if (supabase) {
        await supabase.from('audit_logs').insert({
          order_id: orderId,
          actor: 'admin',
          action: 'order_cancelled_by_admin',
          metadata: {
            previousStatus: order.status,
            status: 'cancelled_by_guide',
            refundRequestId: refundResult?.refundRequestId ?? null,
            source_channel: 'admin_pos',
          },
          created_at: new Date().toISOString(),
        });
      }
    } catch {/* best-effort */}

    return Response.json(
      ok({
        orderId,
        status: 'cancelled_by_guide',
        refundRequestId: refundResult?.refundRequestId ?? null,
        refundStatus: refundResult?.refundStatus ?? null,
        idempotentReplay: refundResult?.replayedRequest === true,
      })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    if (message.includes('not found')) {
      return Response.json(fail('NOT_FOUND', message), { status: 404 });
    }
    if (message.startsWith('order_cancel_locked:')) {
      return Response.json(fail('ORDER_CANCEL_LOCKED', 'cannot cancel order in current status'), { status: 409 });
    }
    return Response.json(fail('CANCEL_FAILED', message), { status: 400 });
  }
}
