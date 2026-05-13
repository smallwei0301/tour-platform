-- Issue #447: guide_balances — per-guide settlement balance accumulator
-- Leaf B of #310 (settlement write-side: guide balances)
BEGIN;

CREATE TABLE IF NOT EXISTS public.guide_balances (
  guide_id uuid PRIMARY KEY REFERENCES public.guide_profiles(id) ON DELETE CASCADE,
  balance_twd integer NOT NULL DEFAULT 0,
  last_settled_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.guide_balances ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'guide_balances' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY "service_role_all" ON public.guide_balances
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMIT;
