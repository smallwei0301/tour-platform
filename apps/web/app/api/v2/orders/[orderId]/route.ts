import { NextRequest } from 'next/server';
import { successV2, errorV2 } from '../../../../../src/lib/api'";
import { createClient } from '../../../../../src/lib/supabase/server'";

function isValidUuid(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await context.params;

  if (!orderId || !isValidUuid(orderId)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid orderId'), { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, status, payment_status, total_twd, people_count, contact_name, contact_email, contact_phone, source_channel, created_at, order_items(id, item_type, title, quantity, unit_price, subtotal_amount)')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return Response.json(errorV2('NOT_FOUND', 'Order not found'), { status: 404 });
    }

    const items = order.order_items as any;
    return Response.json(successV2({
      id: order.id,
      status: order.status,
      paymentStatus: order.payment_status,
      totalTwd: order.total_twd,
      peopleCount: order.people_count,
      contactName: order.contact_name,
      contactEmail: order.contact_email,
      contactPhone: order.contact_phone,
      sourceChannel: order.source_channel,
      createdAt: order.created_at,
      items: items || [],
    }));
  } catch (err) {
    console.error('Order detail API error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json(errorV2('INTERNAL_ERROR', message), { status: 500 });
  }
}
