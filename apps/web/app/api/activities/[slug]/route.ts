import { ok, fail } from '../../../../src/lib/api';
import { getActivityBySlugDb } from '../../../../src/lib/db.mjs';

export const revalidate = 60;

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  try {
    const data = await getActivityBySlugDb(slug);
    if (!data) {
      return Response.json(fail('NOT_FOUND', 'activity not found'), { status: 404 });
    }

    const payload = JSON.stringify(ok(data));
    return new Response(payload, {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, s-maxage=60, stale-while-revalidate=120'
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
