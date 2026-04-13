import { ok, fail } from '../../../../../src/lib/api'";
import { adminDashboardSummaryDb } from '../../../../../src/lib/db.mjs'";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const preset = url.searchParams.get('preset') || '';
  const from = url.searchParams.get('from') || '';
  const to = url.searchParams.get('to') || '';

  try {
    return Response.json(ok(await adminDashboardSummaryDb({ preset, from, to })));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
