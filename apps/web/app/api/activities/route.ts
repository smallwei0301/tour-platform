import { ok, fail } from '../../../src/lib/api';
import { listPublishedActivitiesDb } from '../../../src/lib/db.mjs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const region = url.searchParams.get('region') || '';
  const category = url.searchParams.get('category') || '';
  const q = url.searchParams.get('q') || '';

  try {
    return Response.json(ok(await listPublishedActivitiesDb({ region, category, q })));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
