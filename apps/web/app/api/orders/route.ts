import { fail, ok } from '../../../src/lib/api';
import { createOrderDb } from '../../../src/lib/db.mjs';

function statusFromErrorMessage(message: string) {
  if (message.includes('not enough seats') || message.includes('schedule is full')) return 409;
  if (message.includes('not found')) return 404;
  if (message.includes('required') || message.includes('peopleCount')) return 400;
  return 400;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  try {
    const order = await createOrderDb(body);
    return Response.json(ok(order));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    const status = statusFromErrorMessage(message);
    return Response.json(fail('INVALID_REQUEST', message), { status });
  }
}
