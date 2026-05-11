import { ok, fail } from '../../../../../src/lib/api';
import { getAdminOrderDetailDb, updateAdminOrderDb } from '../../../../../src/lib/db.mjs';

export async function GET(_request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;
  try {
    return Response.json(ok(await getAdminOrderDetailDb({ orderId })));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    const status = message.includes('not found') ? 404 : 400;
    return Response.json(fail('INVALID_REQUEST', message), { status });
  }
}

// AC5: statuses that lock the order against edits
const LOCKED_STATUSES = ['refunded', 'refund_pending', 'completed', 'cancelled_by_user', 'cancelled_by_guide'];

export async function PATCH(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;
  const body = await request.json().catch(() => ({}));
  try {
    const result = await updateAdminOrderDb({
      orderId,
      status: body?.status,
      adminNote: body?.adminNote,
      contactName: body?.contactName,
      contactPhone: body?.contactPhone,
      contactEmail: body?.contactEmail,
      peopleCount: body?.peopleCount,
    });
    return Response.json(ok(result));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    // AC5: locked order edit → 409 Conflict
    if (message.startsWith('order_edit_locked:')) {
      return Response.json(fail('ORDER_EDIT_LOCKED', 'cannot edit order in current status'), { status: 409 });
    }
    // AC1.1: capacity check → 400
    if (message.startsWith('capacity insufficient')) {
      return Response.json(fail('CAPACITY_INSUFFICIENT', message), { status: 400 });
    }
    const status = message.includes('not found') ? 404 : 400;
    return Response.json(fail('INVALID_REQUEST', message), { status });
  }
}
