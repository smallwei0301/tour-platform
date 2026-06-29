-- #1493 — 未付款訂單付款期限。
-- instant/scheduled 自訂單建立起算 24h；request 自導遊審核通過起算（建立時為 NULL）。
-- Rollback:
--   DROP INDEX IF EXISTS public.idx_orders_payment_deadline_pending;
--   ALTER TABLE public.orders DROP COLUMN IF EXISTS payment_deadline_at;

BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_deadline_at timestamptz;

COMMENT ON COLUMN public.orders.payment_deadline_at IS
  'Payment deadline for unpaid orders (#1493): instant/scheduled from creation, request from guide approval; NULL while a request awaits approval.';

-- 逾時清理 sweep 的熱路徑：只掃 pending_payment 且已設定截止時間者。
CREATE INDEX IF NOT EXISTS idx_orders_payment_deadline_pending
  ON public.orders(payment_deadline_at)
  WHERE status = 'pending_payment' AND payment_deadline_at IS NOT NULL;

COMMIT;
