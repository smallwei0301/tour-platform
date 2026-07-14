/**
 * Service-role Supabase client factory（#1649）。
 *
 * app/api 內不得直接 import @supabase/*（architecture-ratchet-guard 天花板），
 * 需要 service-role 讀寫（如 #614 後的 payments 表）一律走本 helper；
 * env 取用集中在 src/config/supabase-service-env.mjs getter（鐵律 C4）。
 */
import { createClient } from '@supabase/supabase-js';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../config/supabase-service-env.mjs';

export function createServiceRoleClient() {
  return createClient(getSupabaseUrl()!, getSupabaseServiceRoleKey()!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
