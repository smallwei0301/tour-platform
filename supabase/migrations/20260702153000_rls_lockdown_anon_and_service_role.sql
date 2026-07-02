-- 健檢 v2 — RLS 全面收斂（P0 資料外洩修復）
--
-- 背景（2026-07-02 以 Supabase MCP 實測確認）：
--   早期一次性「GRANT ALL ON ... TO anon, authenticated」＋多數表的萬用 policy
--   「service role full access」被誤設成 `TO public USING(true) WITH CHECK(true)`，
--   導致 RLS 對所有人形同虛設 —— 持有前端公開 anon key 者可透過 PostgREST
--   （/rest/v1/orders 等）讀寫/刪除全部 orders / users / refund_requests（含 PII、金流）。
--   實測：以 anon 角色可讀 81 筆 orders、12 筆 users、8 筆 refund_requests。
--
-- 本 migration = canonical 修復（fresh build 亦適用）：
--   階段一：撤銷 anon 對所有 public 表的權限（白名單保留公開目錄＋kill-switch 表的 SELECT）。
--   階段二：把所有 always-true 的萬用 ALL policy 從 public 收斂到 service_role；
--           RLS-enabled 但無 policy 的表補 service_role-only policy；
--           撤敏感 SECURITY DEFINER 函式的 anon/authenticated EXECUTE。
--   保留：既有 public-read（status=published/active/approved…）與 own-row（auth.uid()）policy。
--
-- 前台影響：真實資料存取全走 service role（db.mjs 用 SUPABASE_SERVICE_ROLE_KEY，繞過 RLS），
--           故本收斂對前台零破壞（已於 production 實測：authenticated 讀 orders/users = 0，
--           activities published 仍可讀）。
--
-- 注意：階段一的 REVOKE 於 2026-07-02 先以即時 SQL 於 production 止血；本檔為版控 canonical，
--       三段皆冪等、可安全重跑。

-- ── 階段一：撤銷 anon 對敏感表的權限（白名單保留公開目錄＋kill-switch SELECT） ──
DO $$
DECLARE
  r record;
  public_read text[] := ARRAY[
    'activities','activity_plans','activity_plan_tiers','activity_plan_seasons',
    'activity_packages','package_activities','activity_schedules','activity_images',
    'activity_reviews','activity_qa','experiences','events','promo_codes',
    'refund_policies','guide_profiles','homepage_featured_settings',
    'soft_launch_controls','soft_launch_whitelist'
  ];
BEGIN
  FOR r IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r'
  LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon', r.relname);
    IF NOT (r.relname = ANY(public_read)) THEN
      EXECUTE format('REVOKE SELECT ON public.%I FROM anon', r.relname);
    END IF;
  END LOOP;
END $$;

-- ── 階段二-1：收斂 always-true 的 ALL policy（綁 public）→ service_role ──
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname='public' AND cmd='ALL' AND 'public'=ANY(roles)
      AND qual='true' AND coalesce(with_check,'true')='true'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true)',
      r.policyname, r.tablename);
  END LOOP;
END $$;

-- ── 階段二-2：RLS enabled 但無 policy 的表 → 補 service_role-only policy ──
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity
      AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname)
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true)',
      'service_role_all_'||r.relname, r.relname);
  END LOOP;
END $$;

-- ── 階段二-3：撤敏感 SECURITY DEFINER 函式的 anon/authenticated EXECUTE ──
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef
      AND p.proname IN ('handle_auth_user_sync','rls_auto_enable')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated', r.sig);
  END LOOP;
END $$;
