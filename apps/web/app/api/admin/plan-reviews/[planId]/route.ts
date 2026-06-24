import { ok, fail } from '../../../../../src/lib/api';
import { getPlanReviewDetailDb, resolvePlanReviewDb } from '../../../../../src/lib/db.mjs';
import { revalidateActivityPaths } from '../../../../../src/lib/revalidate-activity.mjs';

// GET /api/admin/plan-reviews/:planId — 方案審核明細（live + pending + diff）
export async function GET(_req: Request, context: { params: Promise<{ planId: string }> }) {
  const { planId } = await context.params;
  try {
    const data = await getPlanReviewDetailDb(planId);
    if (!data) return Response.json(fail('NOT_FOUND', 'plan not found'), { status: 404 });
    return Response.json(ok(data));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

// POST /api/admin/plan-reviews/:planId — 核准 / 退回（admin auth + CSRF 由 middleware 把關）
export async function POST(req: Request, context: { params: Promise<{ planId: string }> }) {
  const { planId } = await context.params;
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || '').trim();
  const adminNote = typeof body?.adminNote === 'string' ? body.adminNote : null;

  if (!['approve', 'reject'].includes(action)) {
    return Response.json(fail('INVALID_REQUEST', 'action must be approve or reject'), { status: 400 });
  }

  try {
    const data = await resolvePlanReviewDb(planId, { action: action as 'approve' | 'reject', adminNote });
    if (!data) return Response.json(fail('NOT_FOUND', 'plan not found'), { status: 404 });
    // 核准把方案改動套用進 live → 刷新前台 ISR（方案隸屬的行程頁）。
    const activity = data.plan?.activity;
    if (action === 'approve' && activity?.slug) {
      revalidateActivityPaths({
        region: activity.region,
        regionSlug: activity.region_slug,
        slug: activity.slug,
      });
    }
    return Response.json(ok(data));
  } catch (err: any) {
    if (err?.code === 'NOT_PENDING_REVIEW') {
      return Response.json(fail('NOT_PENDING_REVIEW', '此方案目前沒有待審的修訂'), { status: 409 });
    }
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
