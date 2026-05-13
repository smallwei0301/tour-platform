-- Issue #447: payout_items — per-order settlement ledger with idempotency guard
-- Leaf B of #310 (settlement write-side: payout items)
BEGIN;

CREATE TABLE IF NOT EXISTS public.payout_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  guide_id uuid NOT NULL REFERENCES public.guide_profiles(id) ON DELETE RESTRICT,
  gmv_twd integer NOT NULL,
  commission_twd integer NOT NULL,
  net_twd integer NOT NULL,
  rules_version text NOT NULL DEFAULT 'v1',
  settled_at timestamptz DEFAULT now(),
  CONSTRAINT payout_items_order_unique UNIQUE (order_id)
);

ALTER TABLE public.payout_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'payout_items' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY "service_role_all" ON public.payout_items
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMIT;
