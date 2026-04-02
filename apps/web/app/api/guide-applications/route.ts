import { ok, fail } from '../../../src/lib/api';
import { createGuideApplicationDb, listGuideApplicationsDb } from '../../../src/lib/db.mjs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get('status') || '';
  try {
    return Response.json(ok(await listGuideApplicationsDb({ status })));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  try {
    return Response.json(ok(await createGuideApplicationDb(body)));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    const status = message.includes('required') ? 400 : 500;
    return Response.json(fail('INVALID_REQUEST', message), { status });
  }
}
