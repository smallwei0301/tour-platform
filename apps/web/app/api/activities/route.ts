import { ok, fail } from '../../../src/lib/api';
import { listPublishedActivitiesDb } from '../../../src/lib/db.mjs';

const API_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, ms = API_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('API timeout')), ms)),
  ]);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const region = url.searchParams.get('region') || '';
  const category = url.searchParams.get('category') || '';
  const q = url.searchParams.get('q') || '';

  try {
    const rows = await withTimeout(listPublishedActivitiesDb({ region, category, q }));
    return Response.json(ok(rows));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    const status = message.toLowerCase().includes('timeout') ? 504 : 500;
    const code = status === 504 ? 'UPSTREAM_TIMEOUT' : 'SERVER_ERROR';
    return Response.json(fail(code, message), { status });
  }
}
