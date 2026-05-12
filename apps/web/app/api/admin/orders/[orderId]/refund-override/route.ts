/**
 * POST /api/admin/orders/[orderId]/refund-override
 * Issue #309 — Admin refund override endpoint
 *
 * Allows admin to apply a manual refund amount override for an order.
 * Validates input, fetches order (404 if not found), writes audit log, returns result.
 */
import { ok, fail } from '../../../../../../src/lib/api';
import { createClient } from '@supabase/supabase-js';

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
  const { orderId } = await context.params;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return Response.json(fail('INVALID_REQUEST', 'request body must be valid JSON'), { status: 400 });
  }

  const amount = body?.amount;
  const reason = body?.reason;

  // Validate: reason must be non-empty string
  if (typeof reason !== 'string' || reason.trim() === '') {
    return Response.json(fail('INVALID_REQUEST', 'reason must be a non-empty string'), { status: 400 });
  }

  // Validate: amount must be a positive number
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return Response.json(fail('INVALID_REQUEST', 'amount must be a positive number'), { status: 400 });
  }

  const supabase = getServiceClient();

  // Fetch order to verify it exists and get original amount
  const { data: order, error: fetchError } = await supabase
    .from('orders')
    .select('id, total_twd')
    .eq('id', orderId)
    .single();

  if (fetchError || !order) {
    return Response.json(fail('NOT_FOUND', `order ${orderId} not found`), { status: 404 });
  }

  // Validate: amount must not exceed original order amount
  if (amount > order.total_twd) {
    return Response.json(
      fail('INVALID_REQUEST', `amount (${amount}) exceeds original order amount (${order.total_twd})`),
      { status: 400 }
    );
  }

  // Write audit log
  try {
    const { error: auditError } = await supabase.from('audit_logs').insert({
      order_id: orderId,
      actor: 'admin',
      action: 'refund_override',
      metadata: {
        override_amount: amount,
        reason: reason.trim(),
        order_id: orderId,
      },
      created_at: new Date().toISOString(),
    });
    if (auditError) {
      return Response.json(fail('DB_ERROR', auditError.message), { status: 500 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('DB_ERROR', message), { status: 500 });
  }

  return Response.json(ok({ override_amount: amount, reason: reason.trim() }));
}
