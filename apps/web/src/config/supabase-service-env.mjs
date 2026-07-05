// @ts-check
/**
 * #1616 — Supabase service-role env 的單一事實來源（P4 env 集中第一批）。
 *
 * 全站（凍結區白名單除外）禁止直讀 process.env.SUPABASE_SERVICE_ROLE_KEY／
 * SUPABASE_URL，一律經本檔 getter（守門：tests/unit/issue1616-service-role-env-guard）。
 * getter 刻意回傳 raw 值（可能 undefined）、不驗證不 throw——與原直讀行為逐字等價；
 * 未來要加啟動驗證，在 startup-env（凍結，需 owner）或此處統一加，而非散點各自檢查。
 *
 * 注意：此檔在 src/config 底下、非凍結檔（凍結的是 security-env.mjs 與
 * startup-env.mjs 兩檔本身）。
 */

export function getSupabaseUrl() {
  return process.env.SUPABASE_URL;
}

export function getSupabaseServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}
