import { ok, fail } from '../../../../../src/lib/api';
import { getMyOrderDetailDb, cancelOrderDb } from '../../../../../src/lib/db.mjs';

export async function GET(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;
  const url = new URL(request.url);
  const contactEmail = url.searchParams.get('contactEmail') || '';

  try {
    const row = await getMyOrderDetailDb({ orderId, contactEmail });
    return Response.json(ok(row));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    const status = message.includes('not found') ? 404 : 400;
    return Response.json(fail('INVALID_REQUEST', message), { status });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;
  const body = await request.json().catch(() => null);
  const action = body?.action || '';
  const contactEmail = body?.contactEmail || '';

  if (!contactEmail) {
    return Response.json(fail('INVALID_REQUEST', 'contactEmail is required'), { status: 400 });
  }

  try {
    if (action === 'cancel') {
      const result = await cancelOrderDb({ orderId, contactEmail });
      return Response.json(ok(result));
    }
    return Response.json(fail('INVALID_REQUEST', `unknown action: ${action}`), { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    const status = message.includes('not found') ? 404 : 400;
    return Response.json(fail('INVALID_REQUEST', message), { status });
  }
}
