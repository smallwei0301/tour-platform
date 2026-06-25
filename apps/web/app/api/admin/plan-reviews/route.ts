import { ok, fail } from '../../../../src/lib/api';
import { listPendingPlanReviewsDb } from '../../../../src/lib/db.mjs';

// GET /api/admin/plan-reviews — 管理者「待審方案」清單（admin auth 由 middleware 把關）
export async function GET() {
  try {
    return Response.json(ok(await listPendingPlanReviewsDb()));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
