import { ok, fail } from '../../../../../../../../../src/lib/api';
import { verifyGuideSession } from '../../../../../../../../../src/lib/guide-auth';
import { validateCsrf } from '../../../../../../../../../src/lib/csrf.mjs';
import { updateGuidePlanSeasonDb, deleteGuidePlanSeasonDb } from '../../../../../../../../../src/lib/db.mjs';

type Ctx = { params: Promise<{ id: string; planId: string; seasonId: string }> };

function mapError(code?: string) {
  if (code === 'PLAN_NOT_FOUND' || code === 'PLAN_WRONG_GUIDE' || code === 'SEASON_NOT_FOUND') {
    return Response.json(fail('NOT_FOUND', 'season not found'), { status: 404 });
  }
  return null;
}

// PUT /api/guide/activities/:id/plans/:planId/seasons/:seasonId — 更新季節窗口（即時生效）
export async function PUT(req: Request, context: Ctx) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const { id, planId, seasonId } = await context.params;
  const body = await req.json().catch(() => ({}));
  try {
    const result: { ok: boolean; code?: string; message?: string; season?: unknown } =
      await updateGuidePlanSeasonDb(planId, seasonId, session.guideId, body, id);
    if (!result.ok) {
      const notFound = mapError(result.code);
      if (notFound) return notFound;
      if (result.code === 'VALIDATION_ERROR') {
        return Response.json(fail('VALIDATION_ERROR', result.message || '欄位驗證失敗'), { status: 400 });
      }
      return Response.json(fail(result.code || 'INVALID_REQUEST', 'update failed'), { status: 400 });
    }
    return Response.json(ok({ season: result.season }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

// DELETE /api/guide/activities/:id/plans/:planId/seasons/:seasonId — 移除季節窗口（即時生效）
export async function DELETE(req: Request, context: Ctx) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const { id, planId, seasonId } = await context.params;
  try {
    const result: { ok: boolean; code?: string } =
      await deleteGuidePlanSeasonDb(planId, seasonId, session.guideId, id);
    if (!result.ok) {
      const notFound = mapError(result.code);
      if (notFound) return notFound;
      return Response.json(fail(result.code || 'INVALID_REQUEST', 'delete failed'), { status: 400 });
    }
    return Response.json(ok({ deleted: true }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
