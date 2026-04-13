import { ok, fail } from '../../../../src/lib/api'";
import { getActivityBySlugDb } from '../../../../src/lib/db.mjs'";

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  try {
    const data = await getActivityBySlugDb(slug);
    if (!data) return Response.json(fail('NOT_FOUND', 'activity not found'), { status: 404 });
    return Response.json(ok(data));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
