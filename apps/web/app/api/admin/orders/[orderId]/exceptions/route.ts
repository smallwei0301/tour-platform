import { ok, fail } from '../../../../../../src/lib/api'";
import { applyAdminOrderExceptionDb } from '../../../../../../src/lib/db.mjs'";

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;
  const body = await request.json().catch(() => ({}));

  try {
    const result = await applyAdminOrderExceptionDb({
      orderId,
      action: body?.action,
      targetScheduleId: body?.targetScheduleId,
      newCapacity: body?.newCapacity,
      adminNote: body?.adminNote
    });
    return Response.json(ok(result));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    const status = message.includes('not found') ? 404 : 400;
    return Response.json(fail('INVALID_REQUEST', message), { status });
  }
}
