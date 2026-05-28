import { ok, fail } from '../../../../../../src/lib/api';
import { listSchedulesByActivityDb, createScheduleDb } from '../../../../../../src/lib/db.mjs';

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    return Response.json(ok(await listSchedulesByActivityDb(id)));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  if (!body.startAt) return Response.json(fail('INVALID_REQUEST', 'startAt is required'), { status: 400 });
  if (!body.endAt)   return Response.json(fail('INVALID_REQUEST', 'endAt is required'),   { status: 400 });
  try {
    const schedule = await createScheduleDb({ activityId: id, ...body });
    return Response.json(ok(schedule), { status: 201 });
  } catch (err: any) {
    if (err.code === 'SCHEDULE_CAPACITY_EXCEEDS_PLAN') {
      return Response.json(
        fail('SCHEDULE_CAPACITY_EXCEEDS_PLAN', err.messageZh ?? '場次人數上限超過方案上限'),
        { status: 422 },
      );
    }
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
