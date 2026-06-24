import { ok, fail } from '../../../../../../../../src/lib/api';
import { verifyGuideSession } from '../../../../../../../../src/lib/guide-auth';
import { validateCsrf } from '../../../../../../../../src/lib/csrf.mjs';
import {
  listGuidePlanSeasonsDb,
  createGuidePlanSeasonDb,
  setGuidePlanYearRoundDb,
} from '../../../../../../../../src/lib/db.mjs';

type Ctx = { params: Promise<{ id: string; planId: string }> };

// GET /api/guide/activities/:id/plans/:planId/seasons — 全年開關 + 季節窗口清單
export async function GET(req: Request, context: Ctx) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });
  const { id, planId } = await context.params;
  try {
    const data = await listGuidePlanSeasonsDb(planId, session.guideId, id);
    if (data === null) return Response.json(fail('NOT_FOUND', 'plan not found'), { status: 404 });
    return Response.json(ok(data));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

// POST /api/guide/activities/:id/plans/:planId/seasons — 新增季節窗口（即時生效）
export async function POST(req: Request, context: Ctx) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const { id, planId } = await context.params;
  const body = await req.json().catch(() => ({}));
  try {
    const result: { ok: boolean; code?: string; message?: string; season?: unknown } =
      await createGuidePlanSeasonDb(planId, session.guideId, body, id);
    if (!result.ok) {
      if (result.code === 'PLAN_NOT_FOUND' || result.code === 'PLAN_WRONG_GUIDE') {
        return Response.json(fail('NOT_FOUND', 'plan not found'), { status: 404 });
      }
      if (result.code === 'VALIDATION_ERROR') {
        return Response.json(fail('VALIDATION_ERROR', result.message || '欄位驗證失敗'), { status: 400 });
      }
      return Response.json(fail(result.code || 'INVALID_REQUEST', 'create failed'), { status: 400 });
    }
    return Response.json(ok({ season: result.season }), { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

// PUT /api/guide/activities/:id/plans/:planId/seasons — 設定「全年供應」開關（即時生效）
export async function PUT(req: Request, context: Ctx) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const { id, planId } = await context.params;
  const body = await req.json().catch(() => ({}));
  if (typeof body?.isYearRound !== 'boolean') {
    return Response.json(fail('VALIDATION_ERROR', 'isYearRound must be a boolean'), { status: 400 });
  }
  try {
    const result: { ok: boolean; code?: string } =
      await setGuidePlanYearRoundDb(planId, session.guideId, body.isYearRound, id);
    if (!result.ok) {
      if (result.code === 'PLAN_NOT_FOUND' || result.code === 'PLAN_WRONG_GUIDE') {
        return Response.json(fail('NOT_FOUND', 'plan not found'), { status: 404 });
      }
      return Response.json(fail(result.code || 'INVALID_REQUEST', 'update failed'), { status: 400 });
    }
    return Response.json(ok({ isYearRound: body.isYearRound }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
