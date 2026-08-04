-- Rollback of 20260804103000_issue1777_atomic_refund_reversal.sql
--
-- ⚠️ 這支 migration 修的是 #1777 F4：退款紅沖原本在應用層 read-modify-write，
-- 把**絕對值**寫回 guide_balances。回滾＝把 lost update 與「reversal 分錄已存在
-- 但餘額永久漏扣」的路徑裝回去。
--
-- 因此本檔刻意**不**移除 fn_record_refund_reversal_atomic。DROP 它只會讓呼叫端
-- （db.mjs 的 recordRefundReversalDb → wrapper）打不到函式而 fail-closed：退款
-- 仍會成功，但紅沖分錄與餘額扣減中止並記 incident——也就是說單獨回滾的後果是
-- 「紅沖停擺」，不是「回到舊行為」。
--
-- 要真正回到舊行為，必須連同程式碼一起 revert（db.mjs 的舊 250 行實作在
-- git history 中，見本 migration 對應的 PR）。請在 PR 說明理由。
--
-- 本檔因此是 no-op，只留審計軌跡。

BEGIN;

DO $$
BEGIN
  RAISE NOTICE '20260804103000 rollback is intentionally a no-op — see file header. '
    'Dropping fn_record_refund_reversal_atomic would only stall reversals, not restore '
    'the previous behaviour; reverting requires the matching application-code revert.';
END $$;

COMMIT;
