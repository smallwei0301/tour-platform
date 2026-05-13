-- Issue #446: settlement_rules — versioned config table for commission/payout rules
-- Leaf A of #310 (settlement rules v1 codification)
BEGIN;

CREATE TABLE IF NOT EXISTS public.settlement_rules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  version text NOT NULL DEFAULT 'v1',
  commission_rate numeric(5,4) NOT NULL DEFAULT 0.15,
  t_days int NOT NULL DEFAULT 7,
  min_withdrawal_twd int NOT NULL DEFAULT 5000,
  fee_absorbed_by text NOT NULL DEFAULT 'platform',
  notes text,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  created_by text
);

-- Only one active row at a time
CREATE UNIQUE INDEX IF NOT EXISTS settlement_rules_active_unique
  ON public.settlement_rules (is_active) WHERE is_active = true;

-- RLS
ALTER TABLE public.settlement_rules ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'settlement_rules' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY "service_role_all" ON public.settlement_rules
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Seed v1 row (拍板 by Wei, 2026-05: T+7, 15%, NT$5000 minimum, platform absorbs ECPay fees)
INSERT INTO public.settlement_rules (version, commission_rate, t_days, min_withdrawal_twd, fee_absorbed_by, notes, is_active)
VALUES (
  'v1',
  0.15,
  7,
  5000,
  'platform',
  '拍板 by Wei, 2026-05. T+7, 15%, NT$5000 minimum, platform absorbs ECPay fees.',
  true
) ON CONFLICT DO NOTHING;

COMMIT;
