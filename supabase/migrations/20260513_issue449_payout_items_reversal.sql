-- Issue #449: payout_items reversal — settlement_kind column + compound unique
-- Leaf D of #310 (refund reversal carry-forward)
BEGIN;

-- Add settlement_kind to distinguish settlement vs reversal rows
ALTER TABLE public.payout_items
  ADD COLUMN IF NOT EXISTS settlement_kind text NOT NULL DEFAULT 'settlement'
  CHECK (settlement_kind IN ('settlement', 'reversal'));

-- Drop the old single-column unique constraint (order_id alone)
DROP INDEX IF EXISTS payout_items_order_kind_unique;
ALTER TABLE public.payout_items DROP CONSTRAINT IF EXISTS payout_items_order_unique;

-- New compound unique: one settlement + one reversal per order
CREATE UNIQUE INDEX IF NOT EXISTS payout_items_order_kind_unique
  ON public.payout_items (order_id, settlement_kind);

COMMIT;
