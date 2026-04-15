import { ok, fail } from '../../../../src/lib/api';
import { getActivityBySlugDb } from '../../../../src/lib/db.mjs';

const API_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, ms = API_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('API timeout')), ms)),
  ]);
}

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  try {
    const data = await withTimeout(getActivityBySlugDb(slug));
    if (!data) return Response.json(fail('NOT_FOUND', 'activity not found'), { status: 404 });
    return Response.json(ok(data));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    const status = message.toLowerCase().includes('timeout') ? 504 : 500;
    const code = status === 504 ? 'UPSTREAM_TIMEOUT' : 'SERVER_ERROR';
    return Response.json(fail(code, message), { status });
  }
}
