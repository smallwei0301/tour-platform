/**
 * GET /api/me/notifications — Issue #1593
 * 列出登入旅客的站內通知（新到舊）＋未讀數。
 */
import { ok, fail } from '../../../../src/lib/api';
import { createClient } from '../../../../src/lib/supabase/server';
import { listNotificationsDb } from '../../../../src/lib/db-notifications.mjs';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return Response.json(fail('UNAUTHORIZED', '請先登入'), { status: 401 });

    const url = new URL(request.url);
    const limit = Number(url.searchParams.get('limit') || 20);
    const offset = Number(url.searchParams.get('offset') || 0);

    const result = await listNotificationsDb({ userId: user.id, limit, offset });
    return Response.json(ok(result), { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('INTERNAL_ERROR', message), { status: 500 });
  }
}
