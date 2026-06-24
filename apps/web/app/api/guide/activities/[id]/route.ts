import { ok, fail } from '../../../../../src/lib/api';
import { verifyGuideSession } from '../../../../../src/lib/guide-auth';
import { validateCsrf } from '../../../../../src/lib/csrf.mjs';
import { getGuideActivityByIdDb, saveActivityPendingChangesDb } from '../../../../../src/lib/db.mjs';
import { buildFaqPatch } from '../../../../../src/lib/faq-route-helpers';

// GET /api/guide/activities/:id — 載入自己的行程（live 疊 pending_changes）
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });
  const { id } = await context.params;
  try {
    const data = await getGuideActivityByIdDb(id, session.guideId);
    // 非擁有者或不存在一律 404，不洩漏存在性。
    if (!data) return Response.json(fail('NOT_FOUND', 'activity not found'), { status: 404 });
    return Response.json(ok(data));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

// PUT /api/guide/activities/:id — 導遊存檔（只寫 pending_changes，不碰 live）
export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });

  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const { id } = await context.params;
  const body = await req.json().catch(() => ({}));

  // 與 admin PUT 一致的 FAQ 驗證（計劃邊角案例 #5：欄位驗證一致），壞資料不得進 pending。
  if (body.faq !== undefined) {
    const faqResult = buildFaqPatch(body.faq);
    if (faqResult.ok === false) {
      return Response.json(fail('VALIDATION_ERROR', faqResult.message), { status: 400 });
    }
    body.faq = faqResult.normalised;
  }

  try {
    const result = await saveActivityPendingChangesDb(id, session.guideId, body);
    if (!result.ok) {
      // ownership 失敗一律 404（不洩漏存在性）；其餘 400。
      if (result.code === 'ACTIVITY_NOT_FOUND' || result.code === 'ACTIVITY_WRONG_GUIDE') {
        return Response.json(fail('NOT_FOUND', 'activity not found'), { status: 404 });
      }
      return Response.json(fail(result.code || 'INVALID_REQUEST', 'save failed'), { status: 400 });
    }
    // 回傳含 overlay 的最新內容，前端可直接刷新。
    const data = await getGuideActivityByIdDb(id, session.guideId);
    return Response.json(ok(data));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
