-- Rollback of 20260730093000_issue1777_refund_delta_accumulation.sql
--
-- ⚠️ 這支 migration 修的是兩個 P0：
--   F1 累積退款額被覆寫（部分退款兩次 → 導遊被多撥錢）
--   F2 冪等鍵用本次金額（兩次等額部分退款 → 第二次差額被冪等吃掉）
-- **回滾等於把導遊多領錢的路徑裝回去。**
--
-- 因此本檔刻意**不**還原舊的三參數版本。舊版與新版是一整組契約：
--     舊：(uuid, text, text)  呼叫端負責累積 + 給鍵
--     新：(uuid, integer, text) 函式負責累積 + 推導鍵
-- 只回滾 DB 一側會讓呼叫端（傳 p_refund_delta_twd）打不到函式（PGRST202），
-- 而 wrapper 是 fail-closed 的 → 退款仍會成功、帳務調整中止並記 incident。
-- 也就是說：單獨回滾本檔的後果是「帳務調整停擺」，不是「回到舊行為」。
--
-- 若確實要回到舊行為，正確做法是連同呼叫端一起回退（revert 對應的程式碼 PR），
-- 再手動重建舊簽章的函式（原始定義見
-- supabase/migrations/20260729170000_issue1777_refund_adjustment_ledger.sql
-- 與 20260729190000 的說明）。請在 PR 說明理由。
--
-- 本檔因此是 no-op，只留審計軌跡。

BEGIN;

DO $$
BEGIN
  RAISE NOTICE '20260730093000 rollback is intentionally a no-op — see file header. '
    'Restoring the 3-arg signature alone would reintroduce the refund overwrite (F1) '
    'and the colliding idempotency key (F2).';
END $$;

COMMIT;
