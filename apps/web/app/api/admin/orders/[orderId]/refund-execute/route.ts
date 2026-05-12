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
import { requestAllRefund } from '../../../../../../src/lib/ecpay';
import { createClient } from '@supabase/supabase-js';
import { executeRefund } from '../../../../../../src/lib/refund-execute';

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

  const outcome = await executeRefund({
    order: order as any,
    body,
    requestAllRefund,
    updateOrder: async (orderId, payload) => {
      const { data, error, count } = await supabase
        .from('orders')
        .update(payload)
        .eq('id', orderId)
        .select('id');
      return { error, data, count };
    },
  });

  return Response.json(outcome.body, { status: outcome.status });
}
