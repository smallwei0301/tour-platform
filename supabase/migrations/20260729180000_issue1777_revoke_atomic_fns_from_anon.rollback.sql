-- Rollback of 20260729180000_issue1777_revoke_atomic_fns_from_anon.sql
--
-- 只還原 default privileges 的變更（讓 schema 回到「新函式沿用 Supabase 預設」）。
--
-- ⚠️ 刻意**不**把 EXECUTE 重新授予 anon／authenticated。那是本 hotfix 修掉的 P0
--    安全缺口——回滾 migration 不該把漏洞裝回去。若確實需要讓某個角色執行這些
--    財務函式，應另開 migration 明確授權該角色，並在 PR 說明理由。

BEGIN;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated;

COMMIT;
