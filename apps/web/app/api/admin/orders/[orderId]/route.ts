import { ok, fail } from '../../../../../src/lib/api'";
import { getAdminOrderDetailDb, updateAdminOrderDb } from '../../../../../src/lib/db.mjs'";

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

export async function PATCH(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;
  const body = await request.json().catch(() => ({}));
  try {
    return Response.json(ok(await updateAdminOrderDb({ orderId, status: body?.status, adminNote: body?.adminNote })));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    const status = message.includes('not found') ? 404 : 400;
    return Response.json(fail('INVALID_REQUEST', message), { status });
  }
}
