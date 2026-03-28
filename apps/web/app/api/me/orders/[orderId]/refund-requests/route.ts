import { ok, fail } from '../../../../../../src/lib/api';
import { createRefundRequestDb, listRefundRequestsDb } from '../../../../../../src/lib/db.mjs';

export async function GET(_request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;

  try {
    const rows = await listRefundRequestsDb({ orderId });
    return Response.json(ok(rows));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;
  const body = await request.json().catch(() => ({}));

  try {
    const created = await createRefundRequestDb({
      orderId,
      reason: body?.reason,
      note: body?.note,
      contactEmail: body?.contactEmail
    });
    return Response.json(ok(created));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    const status = message.includes('not found') ? 404 : 400;
    return Response.json(fail('INVALID_REQUEST', message), { status });
  }
}
