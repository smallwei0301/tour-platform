import { ok, fail } from '../../../../../src/lib/api';
import { getAdminActivityByIdDb, updateActivityDb, deleteActivityDb } from '../../../../../src/lib/db.mjs';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const data = await getAdminActivityByIdDb(id);
    if (!data) return Response.json(fail('NOT_FOUND', 'activity not found'), { status: 404 });
    return Response.json(ok(data));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  try {
    const data = await updateActivityDb(id, body);
    if (!data) return Response.json(fail('NOT_FOUND', 'activity not found'), { status: 404 });
    return Response.json(ok(data));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const result = await deleteActivityDb(id);
    return Response.json(ok(result));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
