import { ok, fail } from '../../../../../../src/lib/api';
import { verifyGuideSession } from '../../../../../../src/lib/guide-auth';
import { validateCsrf } from '../../../../../../src/lib/csrf.mjs';
import { listGuidePlansDb, createGuidePlanDb } from '../../../../../../src/lib/db.mjs';

// GET /api/guide/activities/:id/plans — 導遊某行程的方案清單（含審核狀態）
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });
  const { id } = await context.params;
  try {
    const data = await listGuidePlansDb(id, session.guideId);
    // 非擁有者或行程不存在一律 404（不洩漏存在性）。
    if (data === null) return Response.json(fail('NOT_FOUND', 'activity not found'), { status: 404 });
    return Response.json(ok(data));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

// POST /api/guide/activities/:id/plans — 導遊新建方案（落地為 inactive，待送審核准上架）
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });

  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const { id } = await context.params;
  const body = await req.json().catch(() => ({}));
  try {
    const result: { ok: boolean; code?: string; message?: string; plan?: unknown } =
      await createGuidePlanDb(id, session.guideId, body);
    if (!result.ok) {
      if (result.code === 'ACTIVITY_NOT_FOUND') {
        return Response.json(fail('NOT_FOUND', 'activity not found'), { status: 404 });
      }
      if (result.code === 'VALIDATION_ERROR') {
        return Response.json(fail('VALIDATION_ERROR', result.message || '欄位驗證失敗'), { status: 400 });
      }
      return Response.json(fail(result.code || 'INVALID_REQUEST', 'create failed'), { status: 400 });
    }
    return Response.json(ok({ plan: result.plan }), { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
