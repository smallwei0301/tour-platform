-- Issue #1678: harden broad grants on service-only sensitive tables
-- Decision: soft_launch_controls remains an explicit public-read config table
-- Scope: revoke anon/authenticated/public broad grants from service-only tables,
-- keep service_role access, and preserve read-only soft_launch_controls access.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.refund_requests') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.refund_requests FROM anon, authenticated, public;
    GRANT ALL ON TABLE public.refund_requests TO service_role;
  END IF;

  IF to_regclass('public.payouts') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.payouts FROM anon, authenticated, public;
    GRANT ALL ON TABLE public.payouts TO service_role;
  END IF;

  IF to_regclass('public.guide_balances') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.guide_balances FROM anon, authenticated, public;
    GRANT ALL ON TABLE public.guide_balances TO service_role;
  END IF;

  IF to_regclass('public.settlement_rules') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.settlement_rules FROM anon, authenticated, public;
    GRANT ALL ON TABLE public.settlement_rules TO service_role;
  END IF;

  IF to_regclass('public.orders') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.orders FROM anon, authenticated, public;
    GRANT ALL ON TABLE public.orders TO service_role;
  END IF;

  IF to_regclass('public.bookings') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.bookings FROM anon, authenticated, public;
    GRANT ALL ON TABLE public.bookings TO service_role;
  END IF;

  IF to_regclass('public.users') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.users FROM anon, authenticated, public;
    GRANT ALL ON TABLE public.users TO service_role;
  END IF;

  IF to_regclass('public.traveler_profiles') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.traveler_profiles FROM anon, authenticated, public;
    GRANT ALL ON TABLE public.traveler_profiles TO service_role;
  END IF;

  IF to_regclass('public.guide_applications') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.guide_applications FROM anon, authenticated, public;
    GRANT ALL ON TABLE public.guide_applications TO service_role;
  END IF;
END $$;

ALTER TABLE IF EXISTS public.soft_launch_controls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "soft_launch_controls: service_role full" ON public.soft_launch_controls;
CREATE POLICY "soft_launch_controls: service_role full" ON public.soft_launch_controls
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "soft_launch_controls: authenticated read" ON public.soft_launch_controls;
CREATE POLICY "soft_launch_controls: authenticated read" ON public.soft_launch_controls
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "soft_launch_controls: anon read" ON public.soft_launch_controls;
CREATE POLICY "soft_launch_controls: anon read" ON public.soft_launch_controls
  FOR SELECT TO anon USING (true);

REVOKE ALL ON TABLE public.soft_launch_controls FROM anon, authenticated, public;
GRANT ALL ON TABLE public.soft_launch_controls TO service_role;
GRANT SELECT ON TABLE public.soft_launch_controls TO anon, authenticated;

COMMIT;
