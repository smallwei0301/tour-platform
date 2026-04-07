import { ok, fail } from '../../../../src/lib/api';
import { listMyOrdersDb } from '../../../../src/lib/db.mjs';
import { createClient } from '../../../../src/lib/supabase/server';

export async function GET(_request: Request) {
  try {
    // 從 Supabase session 取得已登入用戶
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user?.email) {
      return Response.json(fail('UNAUTHORIZED', '請先登入'), { status: 401 });
    }

    // 用 email 查詢訂單（相容舊訂單 + 新 user_id 綁定訂單）
    const rows = await listMyOrdersDb({ contactEmail: user.email });
    return Response.json(ok(rows));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
