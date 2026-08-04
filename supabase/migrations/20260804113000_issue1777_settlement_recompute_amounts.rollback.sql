-- Rollback of 20260804113000_issue1777_settlement_recompute_amounts.sql
--
-- ⚠️ 這支 migration 修的是 #1777 F3：結算金額原本直接採用呼叫端傳進來的值，
-- 只有資格做交易內重驗。回滾＝把「應用層算錯／用到過期退款額，DB 照單全收」
-- 的後門裝回去。
--
-- 因此本檔刻意**不**還原舊版本。函式簽章未變（jsonb, timestamptz），呼叫端也
-- 不需要改，所以單獨回滾不會造成 fail-closed 停擺 —— 它只會靜默地把金額真實
-- 來源交還給應用層，這正是要修掉的東西。
--
-- 若確有回滾需求（例如發現 DB 重算與業務規則不符），正確做法是新增一支
-- migration 修正**重算規則本身**，而不是回到「信任呼叫端」。請在 PR 說明理由。
--
-- 註：settlement_amount_mismatch 稽核不需要回滾——它只寫 audit_logs，不影響金額。
--
-- 本檔因此是 no-op，只留審計軌跡。

BEGIN;

DO $$
BEGIN
  RAISE NOTICE '20260804113000 rollback is intentionally a no-op — see file header. '
    'Restoring caller-supplied amounts would reopen the F3 backdoor: eligibility '
    'rechecked in-transaction while amounts came from outside it.';
END $$;

COMMIT;
