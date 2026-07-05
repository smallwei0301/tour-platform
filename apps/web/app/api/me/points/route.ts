/**
 * GET /api/me/points — Issue #1594
 * 回登入旅客的可用點數餘額（排除過期）。
 */
import { ok, fail } from '../../../../src/lib/api';
import { createClient } from '../../../../src/lib/supabase/server';
import { getPointsBalanceDb } from '../../../../src/lib/db-points.mjs';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return Response.json(fail('UNAUTHORIZED', '請先登入'), { status: 401 });

    const balance = await getPointsBalanceDb({ userId: user.id });
    return Response.json(ok({ balance }), { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('INTERNAL_ERROR', message), { status: 500 });
  }
}
