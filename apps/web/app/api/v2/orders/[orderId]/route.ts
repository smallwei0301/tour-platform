import { NextRequest } from 'next/server';
import { successV2, errorV2 } from '../../../../../src/lib/api';
import { createClient } from '../../../../../src/lib/supabase/server';
import { isOrderOwner } from '../../../../../src/lib/v2-order-authz';

type OrderItem = {
  id: string;
  item_type: string;
  title: string;
  quantity: number;
  unit_price: number;
  subtotal_amount: number;
};

type OrderRow = {
  id: string;
  status: string;
  payment_status: string;
  total_twd: number;
  people_count: number;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  user_id: string | null;
  source_channel: string;
  created_at: string;
  order_items: OrderItem[] | null;
};

function isValidUuid(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await context.params;

  if (!orderId || !isValidUuid(orderId)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid orderId'), { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user?.id && !user?.email) {
      return Response.json(errorV2('UNAUTHORIZED', 'Please login first'), { status: 401 });
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, status, payment_status, total_twd, people_count, user_id, contact_name, contact_email, contact_phone, source_channel, created_at, order_items(id, item_type, title, quantity, unit_price, subtotal_amount)')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return Response.json(errorV2('NOT_FOUND', 'Order not found'), { status: 404 });
    }

    const typedOrder = order as OrderRow;
    const hasAccess = isOrderOwner(typedOrder, {
      id: user?.id ?? null,
      email: user?.email ?? null,
    });

    if (!hasAccess) {
      return Response.json(errorV2('FORBIDDEN', 'You are not allowed to access this order'), {
        status: 403,
      });
    }

    const items = typedOrder.order_items ?? [];
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
