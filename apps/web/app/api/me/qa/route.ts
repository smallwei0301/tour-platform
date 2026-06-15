/**
 * /api/me/qa — 旅客自己的「我的提問／問答回覆」收件匣（GET）。
 * 回傳本人提過的所有 activity_qa（含審核中），附行程／導遊標題與連結。
 * 注意 PII：本 route 不得 log 問答內容或聯絡資訊。
 */
import { ok, fail } from '../../../../src/lib/api';
import { createClient } from '../../../../src/lib/supabase/server';
import { listMyQaDb } from '../../../../src/lib/db.mjs';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      return Response.json(fail('UNAUTHORIZED', '請先登入'), { status: 401 });
    }

    const rows = await listMyQaDb({ userId: user.id });
    return Response.json(ok(rows));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
