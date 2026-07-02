-- Rollback：20260702153000_rls_lockdown_anon_and_service_role
--
-- ⚠️ 警告：本 migration 為 P0 資料外洩安全修復。完整 rollback 會重新開啟
--    「anon 公開 key 可讀寫全部 orders/users/PII」的漏洞，**強烈不建議**。
--    僅在確認修復造成前台功能中斷、且無法以更精細方式修復時，作為緊急還原。
--
-- 本 rollback 只還原「policy 綁定」與「函式 EXECUTE」，**不**重新 GRANT anon 表層權限
--   （後者是外洩主體，重新授予等同再次公開全部資料）。若確實需要暫時放行匿名讀取，
--   請針對「特定表 + 特定欄位」手動設計 policy，切勿整表 GRANT ALL TO anon。

-- 還原：把 service_role-scoped 的萬用 policy 改回 public（＝重新開放，危險）
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname='public' AND cmd='ALL' AND roles=ARRAY['service_role']::name[]
      AND qual='true' AND coalesce(with_check,'true')='true'
      AND policyname LIKE '%service role full access%'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true)',
      r.policyname, r.tablename);
  END LOOP;
END $$;

-- 還原函式 EXECUTE（回到預設 PUBLIC 可執行）
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef
      AND p.proname IN ('handle_auth_user_sync','rls_auto_enable')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', r.sig);
  END LOOP;
END $$;
