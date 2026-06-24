import { ok, fail } from '../../../../../../src/lib/api';
import { verifyGuideSession } from '../../../../../../src/lib/guide-auth';
import { validateCsrf } from '../../../../../../src/lib/csrf.mjs';
import { submitActivityForReviewDb } from '../../../../../../src/lib/db.mjs';

// POST /api/guide/activities/:id/submit — 導遊送出審核
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });

  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const { id } = await context.params;
  try {
    const result = await submitActivityForReviewDb(id, session.guideId);
    if (!result.ok) {
      if (result.code === 'ACTIVITY_NOT_FOUND' || result.code === 'ACTIVITY_WRONG_GUIDE') {
        return Response.json(fail('NOT_FOUND', 'activity not found'), { status: 404 });
      }
      if (result.code === 'NOTHING_TO_SUBMIT') {
        return Response.json(fail('NOTHING_TO_SUBMIT', '沒有可送審的修改'), { status: 400 });
      }
      return Response.json(fail(result.code || 'INVALID_REQUEST', 'submit failed'), { status: 400 });
    }
    return Response.json(ok({ submitted: true }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
