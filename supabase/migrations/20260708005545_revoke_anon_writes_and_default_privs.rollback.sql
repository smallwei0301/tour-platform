-- Rollback for 20260708005545_revoke_anon_writes_and_default_privs.sql
--
-- ⚠️ 這個 migration 是「收斂 anon 寫入權」的安全修復；rollback 會把 anon 寫入權「發回去」，
--    等於重新開啟 #1563 類風險。僅在確定要還原時使用。
-- 還原範圍＝把 default privileges 改回「給 anon 寫入」，並對現有表重新 GRANT anon 寫入。
--    （多數表其實不該有；還原僅為對稱性，實務上不建議執行。）

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT INSERT, UPDATE, DELETE ON TABLES TO anon;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='postgres') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT INSERT, UPDATE, DELETE ON TABLES TO anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_admin') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT INSERT, UPDATE, DELETE ON TABLES TO anon';
  END IF;
END $$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r'
  LOOP
    EXECUTE format('GRANT INSERT, UPDATE, DELETE ON public.%I TO anon', r.relname);
  END LOOP;
END $$;
