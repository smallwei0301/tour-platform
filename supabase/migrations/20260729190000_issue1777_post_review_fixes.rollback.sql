-- Rollback of 20260729190000_issue1777_post_review_fixes.sql
--
-- ⚠️ 這支 migration 修的是 P0：不帶 predicate 的 ON CONFLICT 無法推論部分唯一
--    索引（42P10），會讓 settlement sweep 整批失敗。**回滾等於把該故障裝回去。**
--
-- 因此本檔刻意**不**還原 fn_record_settlement_atomic 的舊版本。若真的需要回到
-- 舊行為，正確做法是連同 20260729170000（部分索引）一起回滾——兩者是一組：
--    ON CONFLICT 無 predicate  ⟺  全表唯一索引
--    ON CONFLICT 帶 predicate  ⟺  部分唯一索引
-- 單獨回滾任一支都會產生不一致。
--
-- 同理，default privileges 對 supabase_admin 的收斂也不還原——回滾不該把
-- 「新函式自動授權給 anon」的漏洞裝回去（與 20260729180000.rollback.sql 同原則）。
--
-- 本檔因此是 no-op，只留審計軌跡。若確有回滾需求，請依上述說明整組處理並
-- 在 PR 說明理由。

BEGIN;

DO $$
BEGIN
  RAISE NOTICE '20260729190000 rollback is intentionally a no-op — see file header. '
    'Rolling back the ON CONFLICT predicate alone would reintroduce the 42P10 failure.';
END $$;

COMMIT;
