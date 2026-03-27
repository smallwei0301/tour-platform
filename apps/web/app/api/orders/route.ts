import { fail, ok } from '../../../src/lib/api';
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.experienceSlug) return Response.json(fail('INVALID_REQUEST','experienceSlug is required'), { status: 400 });
  return Response.json(ok({ orderId: 'ord_demo_001', status: 'pending_payment' }));
}
