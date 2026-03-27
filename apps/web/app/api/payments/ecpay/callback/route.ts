import { ok, fail } from '../../../../../src/lib/api';
import { orders } from '../../../../../src/lib/store.mjs';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const orderId = body?.orderId;
  if (!orderId) {
    return Response.json(fail('INVALID_REQUEST', 'orderId is required'), { status: 400 });
  }

  const order = orders.find((o) => o.id === orderId);
  if (order) order.status = 'paid';

  return Response.json(ok({ received: true, orderId, status: order?.status || 'not_found' }));
}
