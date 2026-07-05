// @ts-check
/**
 * Supabase service-role client 存取的單一來源（#1613 strangler P1 第 0 步）。
 *
 * 原本 `hasSupabaseEnv`／`getSupabase` 定義在 db.mjs，導致領域檔（db-kpi／db-auto-complete／
 * db-redeem…）為了拿 client 反過來 import db.mjs，形成 `db.mjs ⇄ db-*.mjs` ESM 循環。
 * 抽到本檔後：
 *   - 領域檔一律 `import { hasSupabaseEnv, getSupabase } from './supabase-env.mjs'`（無循環）
 *   - db.mjs 亦從本檔 import 並 re-export，既有 89+ 個 caller 與 12 個測試（`__setSupabaseClientForTest`）零改動
 *
 * module 級 `supabaseClient` 快取是全站唯一實例；測試以 `__setSupabaseClientForTest` 注入 mock。
 */

import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../src/config/supabase-service-env.mjs';

export function hasSupabaseEnv() {
  return !!(getSupabaseUrl() && getSupabaseServiceRoleKey());
}

// 刻意 `any`：本步驟（#1613）是「純搬移」，getSupabase 的對外回傳型別必須與原
// db.mjs（無 @ts-check、推得 Promise<any>）逐字一致，避免收緊型別意外讓下游 route
// 的 Supabase 查詢結果變嚴而爆 typecheck（那屬 #1597 的型別債，另案處理）。
/** @type {any} */
let supabaseClient = null;

export function __setSupabaseClientForTest(client = null) {
  supabaseClient = client;
}

export async function getSupabase() {
  if (supabaseClient) return supabaseClient;
  const { createClient } = await import('@supabase/supabase-js');
  supabaseClient = createClient(
    /** @type {string} */ (getSupabaseUrl()),
    /** @type {string} */ (getSupabaseServiceRoleKey()),
  );
  return supabaseClient;
}
