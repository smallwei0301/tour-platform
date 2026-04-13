import { ok, fail } from '../../../../../src/lib/api'";
import { searchGuidesDb } from '../../../../../src/lib/db.mjs'";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get('q') || '';
  try {
    const guides = await searchGuidesDb(q);
    return Response.json(ok(guides));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
