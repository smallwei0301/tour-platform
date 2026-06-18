import { NextRequest } from 'next/server';
import { successV2, errorV2 } from '../../../../../../../../src/lib/api';
import { createClient } from '../../../../../../../../src/lib/supabase/server';
import { getAdminOrderDetailDb } from '../../../../../../../../src/lib/db.mjs';

function isValidUuid(str: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

function buildAdditionalPaymentTradeNo(orderId: string): string {
  return `ADDPAY-${orderId.replace(/-/g, '').slice(0, 12)}-${Date.now().toString().slice(-8)}`;
}

interface AdditionalPaymentRequest {
  amount: number;
  method?: string;
  note?: string;
  adminUserId?: string;
}

const ALLOWED_STATUSES = ['paid', 'confirmed', 'completed'];

const VALID_METHODS = ['cash', 'card', 'transfer', 'manual', 'other'];

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await context.params;

  if (!orderId || !isValidUuid(orderId)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid orderId'), { status: 400 });
  }

  let body: AdditionalPaymentRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json(errorV2('VALIDATION_ERROR', 'Request body must be valid JSON'), {
      status: 400,
    });
  }

  const amount = Number(body?.amount);
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
    return Response.json(
      errorV2('VALIDATION_ERROR', 'amount must be a positive integer (TWD)'),
      { status: 400 }
    );
  }

  const method = body?.method ? String(body.method).trim() : 'manual';
  if (!VALID_METHODS.includes(method)) {
    return Response.json(
      errorV2('VALIDATION_ERROR', `method must be one of: ${VALID_METHODS.join(', ')}`),
      { status: 400 }
    );
  }

  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json(errorV2('UNAUTHORIZED', 'Unauthorized'), { status: 401 });

    // Service-role client for payments / payment_events writes — those tables
    // are service_role-only after issue #614 (REVOKE from anon/authenticated),
    // so inserting through the anon client raises "permission denied for table
    // payments". Authorization stays above on the Supabase-auth client.
    const { createClient: createServiceClient } = await import('@supabase/supabase-js');
    const paymentDb = createServiceClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, status, payment_status, total_twd')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return Response.json(errorV2('NOT_FOUND', 'Order not found'), { status: 404 });
    }

    if (!ALLOWED_STATUSES.includes(order.status)) {
      return Response.json(
        errorV2(
          'INVALID_STATE_TRANSITION',
          `Additional payment requires order status in [${ALLOWED_STATUSES.join(', ')}] (current: ${order.status})`
        ),
        { status: 400 }
      );
    }

    const paidAt = new Date().toISOString();
    const tradeNo = buildAdditionalPaymentTradeNo(orderId);

    const { data: payment, error: paymentError } = await paymentDb
      .from('payments')
      .insert({
        order_id: order.id,
        provider: 'manual',
        trade_no: tradeNo,
        amount_twd: amount,
        status: 'paid',
        paid_at: paidAt,
        raw_payload: {
          channel: 'admin_pos',
          paymentType: 'additional_payment',
          method,
          note: body.note || null,
        },
      })
      .select('id')
      .single();

    if (paymentError || !payment) {
      console.error('Additional payment insert failed:', paymentError);
      return Response.json(errorV2('INTERNAL_ERROR', 'Failed to create additional payment'), {
        status: 500,
      });
    }

    await paymentDb.from('payment_events').insert({
      payment_id: payment.id,
      event_type: 'additional_payment',
      payload: {
        orderId: order.id,
        paymentId: payment.id,
        amount,
        method,
        sourceChannel: 'admin_pos',
        note: body.note || null,
        adminUserId: body.adminUserId || null,
      },
    });

    const { error: auditError } = await supabase.from('audit_logs').insert({
      order_id: orderId,
      actor: body.adminUserId || 'admin',
      action: 'additional_payment_recorded',
      metadata: {
        actorRole: 'admin',
        sourceChannel: 'admin_pos',
        targetOrderId: orderId,
        paymentId: payment.id,
        amount,
        method,
        tradeNo,
        note: body.note || null,
      },
    });

    if (auditError) {
      console.warn('Audit log insert failed (non-fatal):', auditError.message);
    }

    const updatedOrder = await getAdminOrderDetailDb({ orderId });

    return Response.json(
      successV2({
        orderId,
        orderStatus: updatedOrder.status,
        paymentStatus: updatedOrder.paymentStatus ?? order.payment_status,
        paymentId: payment.id,
        amount,
        method,
        tradeNo,
        paidAt,
      })
    );
  } catch (err) {
    console.error('Admin POS additional-payment API error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json(errorV2('INTERNAL_ERROR', message), { status: 500 });
  }
}
