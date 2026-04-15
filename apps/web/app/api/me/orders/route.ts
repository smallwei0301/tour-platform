import { ok, fail } from '../../../../src/lib/api';
import { listMyOrdersDb } from '../../../../src/lib/db.mjs';
import { createClient } from '../../../../src/lib/supabase/server';
import { myOrdersLimiter, createRateLimitResponse } from '../../../../src/lib/rate-limit';

const API_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, ms = API_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('API timeout')), ms)),
  ]);
}

export async function GET(request: Request) {
  // Rate limiting: 20 requests/min per IP
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  const rlResult = myOrdersLimiter.check(ip);
  const rlResponse = createRateLimitResponse(rlResult);
  if (rlResponse) return rlResponse;

  try {
    // 從 Supabase session 取得已登入用戶
    const supabase = await withTimeout(createClient());
    const { data: { user } } = await withTimeout(supabase.auth.getUser());

    if (!user?.email) {
      return Response.json(fail('UNAUTHORIZED', '請先登入'), { status: 401 });
    }

    // 🔐 Phase 9: 用 user_id + email 查詢訂單（相容舊訂單 + 新 user_id 綁定訂單）
    const rows = await withTimeout(listMyOrdersDb({ userId: user.id, contactEmail: user.email }));
    return Response.json(ok(rows));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    const status = message.toLowerCase().includes('timeout') ? 504 : 500;
    const code = status === 504 ? 'UPSTREAM_TIMEOUT' : 'SERVER_ERROR';
    return Response.json(fail(code, message), { status });
  }
}
