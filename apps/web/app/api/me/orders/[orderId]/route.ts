import { ok, fail } from '../../../../../src/lib/api';
import { getMyOrderDetailDb } from '../../../../../src/lib/db.mjs';

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
