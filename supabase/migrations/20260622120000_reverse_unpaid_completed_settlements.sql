-- 回沖「已結算 settlement 但訂單從未收款（orders.paid_at IS NULL）」的 payout_items
--
-- 背景（owner 2026-06-22 拍板）：sweep 舊版只用 status='completed' 當結算資格，
-- 未付款的 completed 訂單（paid_at IS NULL）也被誤結算撥款。live 發現 Ava Preview
-- Smoke 訂單 …1158aa21（net 6120）即為此類 anomaly。commit 315b860 已補
-- isSettlementPaymentCollected gate 防未來；本 migration 清存量。
--
-- 回沖語意完全對齊 src/lib/db.mjs `recordRefundReversalDb`：
--   1. 對每筆受影響的 settlement 列，插入一筆 settlement_kind='reversal' 的負值列
--      （gmv/commission/net 取負；idempotent via UNIQUE(order_id, settlement_kind)）。
--   2. 借記 guide_balances（扣掉 abs(net)）。
--   3. 寫 audit_logs：payout_reversal_created + guide_balance_debited_reversal，
--      metadata shape 與 app 一致，讓 app 端冪等判斷可辨識為「已回沖」。
--
-- 冪等：只挑「尚無對應 reversal 列」的 settlement；重跑時找不到目標 → no-op。
-- 整支在單一交易內，任一步失敗整體 rollback。

BEGIN;

-- 0. 防呆：確保 #449 的 compound unique 與 settlement_kind 欄存在（若該環境尚未套用
--    #449，這裡補上；已套用則為 no-op）。沒有 compound unique，下方 reversal 列會被
--    舊的 UNIQUE(order_id) 擋下。
ALTER TABLE public.payout_items
  ADD COLUMN IF NOT EXISTS settlement_kind text NOT NULL DEFAULT 'settlement';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payout_items_settlement_kind_check'
  ) THEN
    ALTER TABLE public.payout_items
      ADD CONSTRAINT payout_items_settlement_kind_check
      CHECK (settlement_kind IN ('settlement', 'reversal'));
  END IF;
END $$;

ALTER TABLE public.payout_items DROP CONSTRAINT IF EXISTS payout_items_order_unique;
CREATE UNIQUE INDEX IF NOT EXISTS payout_items_order_kind_unique
  ON public.payout_items (order_id, settlement_kind);

-- 1. 插入 reversal 列，捕捉結果到暫存表（settlement_net 為原始正值）。
CREATE TEMP TABLE _rev ON COMMIT DROP AS
WITH targets AS (
  SELECT s.id AS settlement_id, s.order_id, s.guide_id,
         s.gmv_twd, s.commission_twd, s.net_twd, s.rules_version
  FROM public.payout_items s
  JOIN public.orders o ON o.id = s.order_id
  WHERE s.settlement_kind = 'settlement'
    AND o.paid_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.payout_items r
      WHERE r.order_id = s.order_id AND r.settlement_kind = 'reversal'
    )
),
ins AS (
  INSERT INTO public.payout_items
    (order_id, guide_id, gmv_twd, commission_twd, net_twd, rules_version, settlement_kind, settled_at)
  SELECT order_id, guide_id, -gmv_twd, -commission_twd, -net_twd, rules_version, 'reversal', now()
  FROM targets
  RETURNING id AS reversal_id, order_id
)
SELECT t.settlement_id, i.reversal_id, t.order_id, t.guide_id, t.net_twd AS settlement_net
FROM ins i JOIN targets t ON t.order_id = i.order_id;

-- 2. 借記 guide_balances：每位導遊扣掉該批 reversal 的 abs(net) 加總。
--    先快照 before/after 供 audit 用（無 guide_balances 列的導遊不在此表 → 跳過借記，
--    符合「沒有餘額可扣」的語意）。
CREATE TEMP TABLE _bal ON COMMIT DROP AS
SELECT gb.guide_id,
       gb.balance_twd AS before_balance,
       gb.balance_twd - d.debit AS after_balance
FROM public.guide_balances gb
JOIN (SELECT guide_id, SUM(settlement_net) AS debit FROM _rev GROUP BY guide_id) d
  ON d.guide_id = gb.guide_id;

UPDATE public.guide_balances gb
SET balance_twd = b.after_balance,
    updated_at = now()
FROM _bal b
WHERE gb.guide_id = b.guide_id;

-- 3a. audit：payout_reversal_created（每筆 reversal 一條）。
INSERT INTO public.audit_logs (order_id, actor, action, metadata)
SELECT r.order_id,
       'migration:reverse-unpaid-settlements',
       'payout_reversal_created',
       jsonb_build_object(
         'order_id', r.order_id,
         'guide_id', r.guide_id,
         'net_twd', r.settlement_net,
         'reversal_id', r.reversal_id,
         'settlement_id', r.settlement_id,
         'reason', 'completed_order_paid_at_null_never_paid'
       )
FROM _rev r;

-- 3b. audit：guide_balance_debited_reversal（每筆有實際借記者一條）。
INSERT INTO public.audit_logs (order_id, actor, action, metadata)
SELECT r.order_id,
       'migration:reverse-unpaid-settlements',
       'guide_balance_debited_reversal',
       jsonb_build_object(
         'order_id', r.order_id,
         'guide_id', r.guide_id,
         'before_balance', b.before_balance,
         'after_balance', b.after_balance,
         'debit', ABS(r.settlement_net),
         'reversal_id', r.reversal_id,
         'settlement_id', r.settlement_id,
         'status', 'completed'
       )
FROM _rev r
JOIN _bal b ON b.guide_id = r.guide_id;

COMMIT;
