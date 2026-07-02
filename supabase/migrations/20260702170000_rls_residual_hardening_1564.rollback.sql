-- Rollback：20260702170000_rls_residual_hardening_1564
--
-- ⚠️ 這些是安全加固；rollback 會重新放寬。僅在確認加固造成功能中斷時使用。
--
-- 1) search_path：還原為 role-mutable（移除 pin）。多數情況無需還原（pin 不改行為）。
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) c WHERE c LIKE 'search_path=%')
  LOOP
    EXECUTE format('ALTER FUNCTION %s RESET search_path', r.sig);
  END LOOP;
END $$;

-- 2) 函式 EXECUTE：還原 PUBLIC 可執行
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef
      AND p.proname IN ('handle_auth_user_sync','rls_auto_enable','fn_reschedule_booking_atomic')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', r.sig);
  END LOOP;
END $$;

-- 3) storage policy：如需還原公開 list / 寫入，請依原定義重建（略）。
--    公開 bucket 的 object URL 服務不依賴這些 policy，通常無需還原。
