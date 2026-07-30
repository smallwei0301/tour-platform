-- Rollback of 20260729160000_issue1777_atomic_settlement_and_payout_confirm.sql
--
-- 移除 #1777 Phase 2 的兩支原子函式。本 migration 從未改動表結構、也未寫入
-- 任何資料列，因此回滾不會產生資料損失——已寫入的 payout_items／guide_balances
-- ／payouts 列都是正常業務資料，維持原狀。
--
-- ⚠️ 回滾前必須先把應用程式碼切回不使用 RPC 的版本（revert 對應的 app commit）。
--    呼叫端在 RPC 缺席時 fail-closed：sweep 會記 cron error 且不入帳、payout
--    confirm 會回錯誤。這是刻意設計——寧可停擺也不要退回非原子路徑重複扣款。

BEGIN;

DROP FUNCTION IF EXISTS public.fn_record_settlement_atomic(jsonb, timestamptz);
DROP FUNCTION IF EXISTS public.fn_confirm_payout_atomic(uuid, text, text);

COMMIT;
