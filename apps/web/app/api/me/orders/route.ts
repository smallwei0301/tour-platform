import { ok, fail } from '../../../../src/lib/api';
import { listMyOrdersDb } from '../../../../src/lib/db.mjs';
import { createClient } from '../../../../src/lib/supabase/server';
import { myOrdersLimiter, createRateLimitResponse } from '../../../../src/lib/rate-limit';

export async function GET(request: Request) {
  // Rate limiting: 20 requests/min per IP
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  const rlResult = myOrdersLimiter.check(ip);
  const rlResponse = createRateLimitResponse(rlResult);
  if (rlResponse) return rlResponse;

  try {
    // 從 Supabase session 取得已登入用戶
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user?.email) {
      return Response.json(fail('UNAUTHORIZED', '請先登入'), { status: 401 });
    }

    // 🔐 Phase 9: 用 user_id + email 查詢訂單（相容舊訂單 + 新 user_id 綁定訂單）
    const rows = await listMyOrdersDb({ userId: user.id, contactEmail: user.email });
    return Response.json(ok(rows));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
