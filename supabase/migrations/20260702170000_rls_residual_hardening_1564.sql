-- 健檢 v2 #1564 — RLS 收斂殘留加固（配合 #1563 主修的 P0 外洩修復）
--
-- 清掉 Supabase DB advisor 剩餘的 WARN 級加固項：
--   1. function_search_path_mutable（0011）：所有 public 函式固定 search_path。
--   2. anon/authenticated/PUBLIC 可執行 SECURITY DEFINER 函式（0028/0029）：收斂到 service_role。
--   3. public_bucket_allows_listing（0025）＋誤綁 public 的 storage 寫入 policy：移除。
--
-- 冪等：三段皆可重跑。已於 2026-07-02 套用於 production 並驗證
--   （21 函式全固定 search_path、anon 無法執行 reschedule RPC、storage.objects 無殘留 public policy）。
--
-- 註：`auth_leaked_password_protection` 屬 Supabase Auth Dashboard 開關（非 SQL），由 owner 手動開啟。

-- 1) 固定所有 public schema 函式的 search_path（pin 解析、行為不變）
--    保留 public 於路徑，未 schema-qualify 的 public 物件解析與先前一致（金流/鎖序函式行為不變）。
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) c WHERE c LIKE 'search_path=%')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = pg_catalog, public, pg_temp', r.sig);
  END LOOP;
END $$;

-- 2) 撤敏感 SECURITY DEFINER 函式的 PUBLIC/anon/authenticated EXECUTE，只留 service_role
--    fn_reschedule_booking_atomic 由 db.mjs 以 service role 呼叫（rpc）；其餘為 trigger/admin 函式。
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef
      AND p.proname IN ('handle_auth_user_sync','rls_auto_enable','fn_reschedule_booking_atomic')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- 3) storage：移除公開 bucket 的廣泛 list SELECT policy 與誤綁 public 的寫入 policy
--    三 bucket 皆 public=true → 以 object URL 直接服務、不需 SELECT policy；
--    上傳/刪除全走 service role（bypass RLS），移除這些 TO public policy 對前台零破壞。
DROP POLICY IF EXISTS "Public read access for activity images" ON storage.objects;
DROP POLICY IF EXISTS "Public read activity images" ON storage.objects;
DROP POLICY IF EXISTS "Public read guides" ON storage.objects;
DROP POLICY IF EXISTS "Public read review-photos" ON storage.objects;
DROP POLICY IF EXISTS "Service role delete activity-images" ON storage.objects;
DROP POLICY IF EXISTS "Service role delete guides" ON storage.objects;
DROP POLICY IF EXISTS "Service role delete review-photos" ON storage.objects;
DROP POLICY IF EXISTS "Service role insert activity-images" ON storage.objects;
DROP POLICY IF EXISTS "Service role insert guides" ON storage.objects;
DROP POLICY IF EXISTS "Service role insert review-photos" ON storage.objects;
DROP POLICY IF EXISTS "Service role update activity-images" ON storage.objects;
DROP POLICY IF EXISTS "Service role update guides" ON storage.objects;
