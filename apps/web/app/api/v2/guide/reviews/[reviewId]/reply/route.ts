/**
 * PUT /api/v2/guide/reviews/[reviewId]/reply
 * Issue #1592 — 導遊回覆旅客評論（評論互動強化）。
 *
 * Auth: guide session cookie (HMAC) + CSRF double-submit token。
 * ownership：評論所屬活動的 guide_id 必須等於發話導遊，否則 403。
 * body：{ replyText: string|null }（空字串／null＝撤下回覆）。
 * 不回傳旅客 PII；一則評論最多一則回覆（覆寫即更新）。
 */

import { validateCsrf } from '../../../../../../../src/lib/csrf.mjs';
import { verifyGuideSession } from '../../../../../../../src/lib/guide-auth';
import { upsertGuideReplyDb } from '../../../../../../../src/lib/db-review-reply.mjs';
import { ok, fail } from '../../../../../../../src/lib/api';
import { reportRouteError } from '../../../../../../../src/lib/route-error';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ reviewId: string }> },
) {
  // Step 1: CSRF
  const csrfError = validateCsrf(request);
  if (csrfError) return csrfError;

  // Step 2: Guide auth
  const session = verifyGuideSession(request);
  if (!session) {
    return Response.json(fail('UNAUTHORIZED', 'Guide session required'), { status: 401 });
  }

  const { reviewId } = await params;

  let body: { replyText?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return Response.json(fail('INVALID_REQUEST', 'invalid JSON body'), { status: 400 });
  }

  try {
    const result = await upsertGuideReplyDb({
      guideId: session.guideId,
      reviewId,
      replyText: body?.replyText ?? null,
      now: new Date().toISOString(),
    });

    if (!result.ok) {
      return Response.json(fail(result.code, result.message), { status: result.status });
    }

    return Response.json(
      ok({ replied: result.replied, replyAt: result.replyAt }),
      { status: 200 },
    );
  } catch (err) {
    await reportRouteError(err, { route: 'v2/guide/reviews/reply' });
    return Response.json(fail('SERVER_ERROR', 'Server error'), { status: 500 });
  }
}
