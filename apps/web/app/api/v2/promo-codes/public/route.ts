/**
 * GET /api/v2/promo-codes/public — 旅客端公開促銷碼清單（#1649 Phase 2；#1381 v2 化）
 *
 * legacy /api/promo-codes/public 的 v2 對應（行為等價）：只回 is_public + active
 * + 未過期 + 未用罄的碼，輸出不含內部統計；任何故障 fail-open 為空清單。
 */
import { jsonOk } from '../../../../../src/lib/api-response';
import { hasSupabaseEnv } from '../../../../../src/lib/db.mjs';
import { selectPublicPromoCodes } from '../../../../../src/lib/public-promo-codes.mjs';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../../../../src/config/supabase-service-env.mjs';

export async function GET() {
  if (!hasSupabaseEnv()) {
    return jsonOk([]);
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
      return jsonOk([]);
    }

    // 公開行銷資訊，可短暫快取
    return jsonOk(selectPublicPromoCodes(data ?? [], new Date()), {
      headers: { 'cache-control': 'public, s-maxage=60, stale-while-revalidate=300' },
    });
  } catch {
    // fail-open 為空清單 — 曝光是加分項，不因促銷碼故障擋住任何頁面
    return jsonOk([]);
  }
}
