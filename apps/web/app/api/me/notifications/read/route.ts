/**
 * POST /api/me/notifications/read — Issue #1593
 * 標記已讀（body.ids 為空＝全部標已讀）。冪等。CSRF：對齊 /api/me 既有 gating。
 */
import { ok, fail } from '../../../../../src/lib/api';
import { createClient } from '../../../../../src/lib/supabase/server';
import { validateCsrf } from '../../../../../src/lib/csrf.mjs';
import { markNotificationsReadDb } from '../../../../../src/lib/db-notifications.mjs';

export async function POST(request: Request) {
  const csrfError = validateCsrf(request);
  if (csrfError) return csrfError;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return Response.json(fail('UNAUTHORIZED', '請先登入'), { status: 401 });

    let body: { ids?: string[] } = {};
    try { body = await request.json(); } catch { /* 空 body = 全部標已讀 */ }
    const ids = Array.isArray(body?.ids) ? body.ids.filter((x) => typeof x === 'string') : undefined;

    const result = await markNotificationsReadDb({ userId: user.id, ids });
    return Response.json(ok(result), { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('INTERNAL_ERROR', message), { status: 500 });
  }
}
