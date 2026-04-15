import { ok } from '../../../../src/lib/api';

export async function GET() {
  return Response.json(
    ok({
      service: 'admin-api',
      route: '/api/admin/ping',
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
