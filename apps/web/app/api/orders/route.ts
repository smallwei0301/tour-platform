import { fail, ok } from '../../../src/lib/api';
import { createOrder } from '../../../src/lib/services.mjs';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  try {
    const order = createOrder(body);
    return Response.json(ok(order));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('INVALID_REQUEST', message), { status: 400 });
  }
}
