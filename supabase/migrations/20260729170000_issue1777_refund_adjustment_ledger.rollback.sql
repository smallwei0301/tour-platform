-- Rollback of 20260729170000_issue1777_refund_adjustment_ledger.sql
--
-- 還原 ledger 的 schema 擴充與退款差額函式。
--
-- ⚠️ 資料前提：本回滾會還原「(order_id, settlement_kind) 全表唯一」的約束，
--    因此**必須先確認沒有 refund_adjustment 分錄殘留**，否則建立唯一索引會失敗
--    （同一訂單多筆 adjustment 會衝突）。檢查方式：
--      SELECT order_id, count(*) FROM payout_items
--       WHERE settlement_kind = 'refund_adjustment' GROUP BY order_id;
--    若已有 adjustment 分錄，請先與 owner 確認如何處理（保留欄位僅移除函式，
--    或人工併帳後再回滾）——不可為了讓回滾通過而刪除財務分錄。
--
-- 本檔刻意不刪任何資料列。

BEGIN;

DROP FUNCTION IF EXISTS public.fn_apply_refund_adjustment_atomic(uuid, text, text);

DROP INDEX IF EXISTS payout_items_refund_event_unique;
DROP INDEX IF EXISTS payout_items_order_kind_unique;

-- 還原全表複合唯一鍵（#449 原始行為）
CREATE UNIQUE INDEX IF NOT EXISTS payout_items_order_kind_unique
  ON public.payout_items (order_id, settlement_kind);

-- 還原 settlement_kind 的原始允許值
ALTER TABLE public.payout_items
  DROP CONSTRAINT IF EXISTS payout_items_settlement_kind_check;

ALTER TABLE public.payout_items
  ADD CONSTRAINT payout_items_settlement_kind_check
  CHECK (settlement_kind IN ('settlement', 'reversal'));

ALTER TABLE public.payout_items
  DROP COLUMN IF EXISTS refund_event_id;

COMMIT;
