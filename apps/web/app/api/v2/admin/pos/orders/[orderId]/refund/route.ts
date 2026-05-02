import { NextRequest } from 'next/server';
import { successV2, errorV2 } from '../../../../../../../../src/lib/api';
import { createClient } from '../../../../../../../../src/lib/supabase/server';
import { createAdminPosRefundEntryDb } from '../../../../../../../../src/lib/db.mjs';

function isValidUuid(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

interface RefundEntryRequest {
  adminNote?: string;
  adminUserId?: string;
  requestId?: string;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await context.params;

  if (!orderId || !isValidUuid(orderId)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid orderId'), { status: 400 });
  }

  let body: RefundEntryRequest = {};
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    body = {};
  }

  try {
    const supabase = await createClient();
    const { data: order, error } = await supabase
      .from('orders')
      .select('id, booking_id, status, payment_status')
      .eq('id', orderId)
      .single();

    if (error || !order) {
      return Response.json(errorV2('NOT_FOUND', 'Order not found'), { status: 404 });
    }

    const result = await createAdminPosRefundEntryDb({
      orderId,
      adminNote: body.adminNote,
      adminUserId: body.adminUserId,
      requestId: body.requestId,
    });

    return Response.json(
      successV2({
        orderId,
        bookingId: order.booking_id || null,
        refundRequestId: result.refundRequestId,
        refundStatus: result.refundStatus,
        orderStatus: result.orderStatus,
        replayedRequest: result.replayedRequest,
        trace: {
          paymentEvent: 'refunded',
          auditAction: 'refund_complete',
        },
      })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json(errorV2('INTERNAL_ERROR', message), { status: 500 });
  }
}
