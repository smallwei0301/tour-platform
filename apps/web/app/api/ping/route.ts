import { ok } from '../../../src/lib/api';

export async function GET() {
  return Response.json(
    ok({
      service: 'public-api',
      route: '/api/ping',
      now: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        'cache-control': 'no-store',
      },
    },
  );
}
