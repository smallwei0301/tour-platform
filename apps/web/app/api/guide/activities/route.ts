import { ok, fail } from '../../../../src/lib/api';
import { verifyGuideSession } from '../../../../src/lib/guide-auth';
import { validateCsrf } from '../../../../src/lib/csrf.mjs';
import { listGuideActivitiesDb, createGuideActivityDb } from '../../../../src/lib/db.mjs';

// GET /api/guide/activities — 導遊「我的行程」列表（只列出自己的）
export async function GET(req: Request) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });
  try {
    return Response.json(ok(await listGuideActivitiesDb(session.guideId)));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

// POST /api/guide/activities — 導遊從零建立草稿行程（歸屬自己）
export async function POST(req: Request) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });

  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const body = await req.json().catch(() => ({}));
  try {
    const created = await createGuideActivityDb(session.guideId, body);
    return Response.json(ok(created), { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
