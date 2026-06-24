import { ok, fail } from '../../../../src/lib/api';
import { listPendingActivityReviewsDb } from '../../../../src/lib/db.mjs';

// GET /api/admin/activity-reviews — 管理者「待審行程」清單（admin auth 由 middleware 把關）
export async function GET() {
  try {
    return Response.json(ok(await listPendingActivityReviewsDb()));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
