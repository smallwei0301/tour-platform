-- Rollback：撤銷 20260622120000_reverse_unpaid_completed_settlements.sql 的資料變更。
--
-- 只回收「本 migration 自己寫入」的列（靠 audit_logs.actor =
-- 'migration:reverse-unpaid-settlements' 標記辨識），不影響 app 端
-- recordRefundReversalDb 產生的正常 reversal。schema 變更（#449 的 compound unique /
-- settlement_kind）刻意不還原——那是長期正確的結構。

BEGIN;

-- 本 migration 建立的所有 reversal 列（payout_reversal_created 每筆必有）。
CREATE TEMP TABLE _rows ON COMMIT DROP AS
SELECT DISTINCT (metadata->>'reversal_id')::uuid AS reversal_id
FROM public.audit_logs
WHERE actor = 'migration:reverse-unpaid-settlements'
  AND action = 'payout_reversal_created';

-- 實際借記過的金額（guide_balance_debited_reversal 才有，無餘額列的導遊沒有此筆）。
CREATE TEMP TABLE _credit ON COMMIT DROP AS
SELECT (metadata->>'guide_id')::uuid AS guide_id,
       (metadata->>'debit')::int AS debit
FROM public.audit_logs
WHERE actor = 'migration:reverse-unpaid-settlements'
  AND action = 'guide_balance_debited_reversal';

-- 把扣掉的餘額補回。
UPDATE public.guide_balances gb
SET balance_twd = gb.balance_twd + agg.credit,
    updated_at = now()
FROM (SELECT guide_id, SUM(debit) AS credit FROM _credit GROUP BY guide_id) agg
WHERE gb.guide_id = agg.guide_id;

-- 刪除 reversal 列與本 migration 的 audit 標記。
DELETE FROM public.payout_items p USING _rows r WHERE p.id = r.reversal_id;
DELETE FROM public.audit_logs WHERE actor = 'migration:reverse-unpaid-settlements';

COMMIT;
