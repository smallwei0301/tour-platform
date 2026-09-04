-- Issue #1365: 補正 payout_items.order_id 的 UNIQUE 約束
--
-- #447 原始 migration 把 `CONSTRAINT payout_items_order_unique UNIQUE (order_id)`
-- 寫在 `CREATE TABLE IF NOT EXISTS public.payout_items (...)` 內部。在 production
-- 上該表先前已存在（無此 inline 約束），IF NOT EXISTS 讓整段建表變 no-op，
-- 約束因此從未被加上。settlement sweep 的冪等 upsert：
--   .upsert(payoutItems, { onConflict: 'order_id', ignoreDuplicates: true })
-- 於是 500：
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- 導致 completed 訂單永遠進不了 payout_items / guide_balances（#1365 的實際阻斷點）。
--
-- 本 migration 冪等地補上約束：先去重（空表時為 no-op），再在約束不存在時 ADD。
BEGIN;

-- 去重保險：每個 order_id 只留最早一列（ctid 最小）。payout_items 至今未曾被
-- 成功寫入，正常情況為 no-op；保留此步以防任何先前殘列導致 ADD CONSTRAINT 失敗。
DELETE FROM public.payout_items a
USING public.payout_items b
WHERE a.order_id = b.order_id
  AND a.ctid > b.ctid;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payout_items_order_unique'
      AND conrelid = 'public.payout_items'::regclass
  ) THEN
    ALTER TABLE public.payout_items
      ADD CONSTRAINT payout_items_order_unique UNIQUE (order_id);
  END IF;
END $$;

COMMIT;
