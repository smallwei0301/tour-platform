/**
 * GET /api/promo-codes/public — 旅客端公開促銷碼清單（#1381）
 *
 * 只回 is_public + active + 未過期 + 未用罄的碼，輸出不含內部統計
 * （used_count / max_uses / per_user_limit）。無 Supabase env（本地/測試）
 * 時回空清單 — in-memory store 沒有促銷碼，行為一致地「無可曝光優惠」。
 */
import { ok } from '../../../../src/lib/api';
import { hasSupabaseEnv } from '../../../../src/lib/db.mjs';
import { selectPublicPromoCodes } from '../../../../src/lib/public-promo-codes.mjs';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../../../src/config/supabase-service-env.mjs';

export async function GET() {
  if (!hasSupabaseEnv()) {
    return Response.json(ok([]));
  }

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      getSupabaseUrl()!,
      getSupabaseServiceRoleKey()!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { data, error } = await supabase
      .from('promo_codes')
      .select('code, discount_type, discount_value, max_uses, used_count, expires_at, active, is_public, public_label')
      .eq('is_public', true)
      .eq('active', true);

    if (error) {
      return Response.json(ok([]));
    }

    const res = Response.json(ok(selectPublicPromoCodes(data ?? [], new Date())));
    // 公開行銷資訊，可短暫快取
    res.headers.set('cache-control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res;
  } catch {
    // fail-open 為空清單 — 曝光是加分項，不因促銷碼故障擋住任何頁面
    return Response.json(ok([]));
  }
}
