-- Migration: issue #448 — payouts table
-- Leaf C of #310: payouts generation + Admin confirmation flow
-- Depends on: guide_profiles, guide_balances (issue #447)

CREATE TABLE IF NOT EXISTS public.payouts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  guide_id uuid NOT NULL REFERENCES public.guide_profiles(id) ON DELETE RESTRICT,
  total_twd integer NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'paid', 'cancelled')),
  confirmed_by text,
  confirmed_at timestamptz,
  transfer_ref text,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Partial unique index: only one pending payout per guide at a time
CREATE UNIQUE INDEX IF NOT EXISTS payouts_pending_unique
  ON public.payouts (guide_id)
  WHERE state = 'pending';

-- RLS
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.payouts
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
