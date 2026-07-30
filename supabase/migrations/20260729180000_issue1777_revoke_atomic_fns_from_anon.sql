-- #1777 hotfix — 三支財務原子函式的 EXECUTE 權限自 anon／authenticated 收回
--
-- 缺口（套用 20260729160000／20260729170000 後實查發現）：
--   兩支 migration 只寫了 `REVOKE ALL … FROM PUBLIC`，但 Supabase 在 public
--   schema 對 anon／authenticated 有 FUNCTIONS 的 default privileges，新建函式
--   因此仍被自動授予 EXECUTE。`REVOKE … FROM PUBLIC` 只影響 PUBLIC 這個偽角色，
--   不會撤銷已明確授予具名角色的權限——套用後 pg_proc × routine_privileges 實查
--   確認 anon 與 authenticated 皆持有 EXECUTE。
--
-- 風險等級 P0：未登入者可直接呼叫 fn_confirm_payout_atomic 把 payout 標為 paid
--   並扣減導遊餘額，或以 fn_apply_refund_adjustment_atomic 竄改 ledger。
--
-- 既有的 20260709_issue1678 grants hardening 只涵蓋 TABLES，未涵蓋 FUNCTIONS，
--   因此這個缺口不會被它擋下。此處一併對 FUNCTIONS 設 default privileges，讓
--   日後新建的函式不再自動放行給 anon／authenticated。
--
-- 冪等：REVOKE／GRANT／ALTER DEFAULT PRIVILEGES 皆可重複執行。
-- 回滾：同名 .rollback.sql（還原 default privileges；**不**重新授權 anon）。

BEGIN;

REVOKE ALL ON FUNCTION public.fn_record_settlement_atomic(jsonb, timestamptz)
  FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.fn_confirm_payout_atomic(uuid, text, text)
  FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.fn_apply_refund_adjustment_atomic(uuid, text, text)
  FROM anon, authenticated, public;

GRANT EXECUTE ON FUNCTION public.fn_record_settlement_atomic(jsonb, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_confirm_payout_atomic(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_apply_refund_adjustment_atomic(uuid, text, text) TO service_role;

-- 日後新建函式預設不給 anon／authenticated。刻意不做 graceful skip：靜默略過
-- 會讓下一支金流函式再次以「anon 可執行」的狀態上線，那正是本 hotfix 的成因。
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM authenticated;

COMMIT;
