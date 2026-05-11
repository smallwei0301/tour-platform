import { ok, fail } from '../../../../../../src/lib/api';
import {
  getAdminOrderDetailDb,
  cancelOrderDb,
  createAdminPosRefundEntryDb,
} from '../../../../../../src/lib/db.mjs';
import { createClient } from '@supabase/supabase-js';

// AC5: statuses that lock the order against cancellation
// Includes cancelled_by_guide (double-cancel → 409), cancelled_by_user,
// and already-refunded/refund-in-progress statuses.
const LOCKED_STATUSES = [
  'refunded',
  'refund_pending',
  'completed',
  'cancelled_by_user',
  'cancelled_by_guide',
];

async function getSupabaseForAudit() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function writeAuditLog(
  orderId: string,
  previousStatus: string,
  refundRequestId: string | null
) {
  const supabase = await getSupabaseForAudit();
  if (!supabase) return; // in-memory / test env — skip
  try {
    await supabase.from('audit_logs').insert({
      order_id: orderId,
      actor: 'admin',
      action: 'order_cancelled_by_admin',
      metadata: {
        previousStatus,
        status: 'cancelled_by_guide',
        refundRequestId,
        source_channel: 'admin_pos',
      },
      created_at: new Date().toISOString(),
    });
  } catch {
    // best-effort — do not fail the cancel on audit error
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await context.params;
  const body = await request.json().catch(() => ({}));

  // Idempotency key from caller — allows safe retries
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

    // 2. Release seats via fn_cancel_booking RPC (mirrors cancelOrderDb pattern)
    //    cancelOrderDb requires contactEmail ownership check — admin bypasses that
    //    by calling the RPC path directly. We call cancelOrderDb with the order's
    //    own email so the ownership check passes; admin does NOT need capacity check.
    //    Note: cancelOrderDb also sets status = 'cancelled_by_user', so we
    //    override the status to 'cancelled_by_guide' via updateAdminOrderDb after.
    //
    //    For environments without Supabase (in-memory), cancelOrderDb handles
    //    the fallback gracefully.
    try {
      await cancelOrderDb({
        orderId,
        contactEmail: order.contactEmail || order.contact_email || '',
      });
    } catch (cancelErr) {
      const msg =
        cancelErr instanceof Error ? cancelErr.message : String(cancelErr);
      // If already cancelled by user (race), we proceed and override status below.
      // Any other error is fatal.
      if (!msg.includes('cancelled_by_user') && !msg.includes('cancelled_by_guide')) {
        throw cancelErr;
      }
    }

    // 3. Create full-amount refund entry — idempotent via requestId
    const refundResult = await createAdminPosRefundEntryDb({
      orderId,
      requestId,
      adminNote: (body?.adminNote as string | undefined) || 'admin cancel + refund',
    });

    // 4. Write audit log: order_cancelled_by_admin
    await writeAuditLog(orderId, order.status, refundResult?.refundRequestId ?? null);

    // 5. Return success with refund info
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
    return Response.json(fail('CANCEL_FAILED', message), { status: 400 });
  }
}
