import { ok, fail } from '../../../../../../src/lib/api';
import { updateActivityStatusDb } from '../../../../../../src/lib/db.mjs';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const status = String(body?.status || '').trim();

  if (!['draft', 'published', 'archived'].includes(status)) {
    return Response.json(
      fail('INVALID_REQUEST', 'status must be draft, published, or archived'),
      { status: 400 }
    );
  }

  try {
    const data = await updateActivityStatusDb(id, status);
    if (!data) return Response.json(fail('NOT_FOUND', 'activity not found'), { status: 404 });
    return Response.json(ok(data));
  } catch (err: any) {
    if (err?.code === 'BOOKING_READINESS_FAILED') {
      return Response.json(
        {
          ok: false,
          error: {
            code: 'BOOKING_READINESS_FAILED',
            message: '此行程尚未符合公開預約條件，請修正後再發佈',
            details: err.details ?? [],
          },
        },
        { status: 422 }
      );
    }
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
