import { ok, fail } from '../../../../../../src/lib/api';
import { updateAdminRefundStatusDb } from '../../../../../../src/lib/db.mjs';

export async function POST(request: Request, context: { params: Promise<{ refundRequestId: string }> }) {
  const { refundRequestId } = await context.params;
  const body = await request.json().catch(() => ({}));

  try {
    const row = await updateAdminRefundStatusDb({ refundRequestId, action: 'approve', adminNote: body?.adminNote });
    return Response.json(ok(row));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    const status = message.includes('not found') ? 404 : 400;
    return Response.json(fail('INVALID_REQUEST', message), { status });
  }
}
