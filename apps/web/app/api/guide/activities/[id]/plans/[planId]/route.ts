import { ok, fail } from '../../../../../../../src/lib/api';
import { verifyGuideSession } from '../../../../../../../src/lib/guide-auth';
import { validateCsrf } from '../../../../../../../src/lib/csrf.mjs';
import { getGuidePlanByIdDb, savePlanPendingChangesDb } from '../../../../../../../src/lib/db.mjs';

// GET /api/guide/activities/:id/plans/:planId — 載入自己的方案（row 疊 pending_changes）
export async function GET(req: Request, context: { params: Promise<{ id: string; planId: string }> }) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });
  const { id, planId } = await context.params;
  try {
    const data = await getGuidePlanByIdDb(planId, session.guideId, id);
    if (!data) return Response.json(fail('NOT_FOUND', 'plan not found'), { status: 404 });
    return Response.json(ok(data));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

// PUT /api/guide/activities/:id/plans/:planId — 導遊存檔方案
//   已上架方案 → 寫 pending_changes（不影響前台售票）；未上架新方案 → 直接寫 row。
export async function PUT(req: Request, context: { params: Promise<{ id: string; planId: string }> }) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });

  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const { id, planId } = await context.params;
  const body = await req.json().catch(() => ({}));
  try {
    const result: { ok: boolean; code?: string } =
      await savePlanPendingChangesDb(planId, session.guideId, body, id);
    if (!result.ok) {
      if (result.code === 'PLAN_NOT_FOUND' || result.code === 'PLAN_WRONG_GUIDE') {
        return Response.json(fail('NOT_FOUND', 'plan not found'), { status: 404 });
      }
      if (result.code === 'PLAN_ARCHIVED') {
        return Response.json(fail('PLAN_ARCHIVED', '已封存的方案無法編輯'), { status: 409 });
      }
      return Response.json(fail(result.code || 'INVALID_REQUEST', 'save failed'), { status: 400 });
    }
    const data = await getGuidePlanByIdDb(planId, session.guideId, id);
    return Response.json(ok(data));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
