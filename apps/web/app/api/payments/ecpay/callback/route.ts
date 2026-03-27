import { ok } from '../../../../../src/lib/api';
export async function POST() { return Response.json(ok({ received: true })); }
