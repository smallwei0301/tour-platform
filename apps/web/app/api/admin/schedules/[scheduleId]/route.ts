import { ok, fail } from '../../../../../src/lib/api'";
import { updateScheduleDb, deleteScheduleDb } from '../../../../../src/lib/db.mjs'";

export async function PUT(request: Request, context: { params: Promise<{ scheduleId: string }> }) {
  const { scheduleId } = await context.params;
  const body = await request.json().catch(() => ({}));
  try {
    const data = await updateScheduleDb(scheduleId, body);
    return Response.json(ok(data));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

export async function DELETE(_req: Request, context: { params: Promise<{ scheduleId: string }> }) {
  const { scheduleId } = await context.params;
  try {
    const data = await deleteScheduleDb(scheduleId);
    return Response.json(ok(data));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    const isConflict = message.startsWith('CONFLICT:');
    return Response.json(fail(isConflict ? 'CONFLICT' : 'SERVER_ERROR', message), {
      status: isConflict ? 409 : 500,
    });
  }
}
