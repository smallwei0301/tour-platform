import { ok, fail } from '../../../../../../src/lib/api';
import { getActivityReviewDetailDb, resolveActivityReviewDb } from '../../../../../../src/lib/db.mjs';
import { revalidateActivityPaths } from '../../../../../../src/lib/revalidate-activity.mjs';

// GET /api/admin/activities/:id/review — 審核明細（live + pending + diff）
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const data = await getActivityReviewDetailDb(id);
    if (!data) return Response.json(fail('NOT_FOUND', 'activity not found'), { status: 404 });
    return Response.json(ok(data));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

// POST /api/admin/activities/:id/review — 核准 / 退回（admin auth + CSRF 由 middleware 把關）
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || '').trim();
  const adminNote = typeof body?.adminNote === 'string' ? body.adminNote : null;

  if (!['approve', 'reject'].includes(action)) {
    return Response.json(fail('INVALID_REQUEST', 'action must be approve or reject'), { status: 400 });
  }

  try {
    const data = await resolveActivityReviewDb(id, { action: action as 'approve' | 'reject', adminNote });
    if (!data) return Response.json(fail('NOT_FOUND', 'activity not found'), { status: 404 });
    // 核准把 pending_changes 套用進 live → 立即刷新前台 ISR（同 admin PUT/status 路徑）。
    if (action === 'approve' && data.activity?.slug) {
      revalidateActivityPaths({
        region: data.activity.region,
        regionSlug: data.activity.regionSlug,
        slug: data.activity.slug,
      });
    }
    return Response.json(ok(data));
  } catch (err: any) {
    if (err?.code === 'NOT_PENDING_REVIEW') {
      return Response.json(fail('NOT_PENDING_REVIEW', '此行程目前沒有待審的修訂'), { status: 409 });
    }
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
