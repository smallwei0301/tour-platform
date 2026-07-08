-- 收斂 anon 寫入權回歸（rls-preflight scan-all 首跑發現）＋修 default privileges 防未來新表回歸
--
-- 背景：#1563（20260702153000）撤了「當時存在」的表對 anon 的寫入權，但沒改 default
--   privileges。之後 7/5 新增的表（activity_addons / order_addons / user_notifications /
--   user_points_ledger）又從 default privileges 拿回 anon 的 INSERT/UPDATE/DELETE grant。
--   RLS 有開（擋得住實際寫入），但依 #1563 教訓「別只靠 RLS」，grant 層應一併撤。
--
-- 本檔（冪等、可重跑）：
--   1. 對 public 全部 base table 撤 anon 的寫入權（INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/
--      TRIGGER）——只動寫入，不碰 SELECT（公開目錄表的讀取不受影響；讀取面由 anon-probe 監控）。
--   2. ALTER DEFAULT PRIVILEGES 讓「之後新建的表」預設就不給 anon 寫入（best-effort：涵蓋常見
--      建表角色 postgres / supabase_admin / 當前角色）。未來若仍有新表回歸，rls-preflight
--      scan-all 每週會抓到（已接通知）。
--
-- 唯讀資料層面：不動任何資料列，只改權限。

-- 1) 撤 anon 對所有 public base table 的寫入權（保留 SELECT）
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r'
  LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon', r.relname);
  END LOOP;
END $$;

-- 2) default privileges：之後新建的表預設不給 anon 寫入（best-effort，例外容錯）。
--    只改「當前角色（apply 執行者，通常 postgres）」的 default privileges——這正是建表者，
--    也是那 4 張新表回歸 anon grant 的來源。不嘗試 ALTER supabase_admin（超級角色，本連線
--    無權改，會 42501 連累整包回滾）。權限不足時 graceful skip，不影響上面的 REVOKE 收斂。
--    未來若仍有新表回歸，rls-preflight scan-all 每週會抓到（已接 TG+Email 通知）。
DO $$
BEGIN
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM anon;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'default-priv 收斂略過（權限不足）：%', SQLERRM;
END $$;
