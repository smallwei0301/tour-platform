/**
 * v2 traveler routes 共用的旅客身分解析（#1649）。
 *
 * 行為：
 * - 有 Supabase env：以 SSR anon client 讀 auth cookie 取得 user（失敗即拋出，
 *   與 legacy /api/me/** 相同——env 設定錯誤要 500 出來，不能靜默降級成訪客）。
 * - 無 Supabase env（node --test / 無環境變數本機）：createClient 會因缺
 *   NEXT_PUBLIC_SUPABASE_URL 而拋錯，此時回傳空身分，route 走 guest/contactEmail
 *   或 in-memory fallback——與 db.mjs gateway 的 hasSupabaseEnv() seam 對齊。
 */
import { createClient } from '../supabase/server';
import { hasSupabaseEnv } from '../db.mjs';

export type TravelerIdentity = { id: string | null; email: string | null };

export async function getTravelerIdentity(): Promise<TravelerIdentity> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return { id: data.user?.id ?? null, email: data.user?.email ?? null };
  } catch (err) {
    if (!hasSupabaseEnv()) return { id: null, email: null };
    throw err;
  }
}
