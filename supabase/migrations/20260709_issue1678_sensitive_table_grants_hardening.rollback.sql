-- Rollback for Issue #1678 sensitive-table grants hardening
-- Restores the previous broad authenticated CRUD surface and soft_launch_controls anon SELECT.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.refund_requests') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.refund_requests FROM anon, authenticated, public;
    GRANT ALL ON TABLE public.refund_requests TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.refund_requests TO authenticated;
  END IF;

  IF to_regclass('public.payouts') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.payouts FROM anon, authenticated, public;
    GRANT ALL ON TABLE public.payouts TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payouts TO authenticated;
  END IF;

  IF to_regclass('public.guide_balances') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.guide_balances FROM anon, authenticated, public;
    GRANT ALL ON TABLE public.guide_balances TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.guide_balances TO authenticated;
  END IF;

  IF to_regclass('public.settlement_rules') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.settlement_rules FROM anon, authenticated, public;
    GRANT ALL ON TABLE public.settlement_rules TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.settlement_rules TO authenticated;
  END IF;

  IF to_regclass('public.orders') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.orders FROM anon, authenticated, public;
    GRANT ALL ON TABLE public.orders TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.orders TO authenticated;
  END IF;

  IF to_regclass('public.bookings') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.bookings FROM anon, authenticated, public;
    GRANT ALL ON TABLE public.bookings TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.bookings TO authenticated;
  END IF;

  IF to_regclass('public.users') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.users FROM anon, authenticated, public;
    GRANT ALL ON TABLE public.users TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.users TO authenticated;
  END IF;

  IF to_regclass('public.traveler_profiles') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.traveler_profiles FROM anon, authenticated, public;
    GRANT ALL ON TABLE public.traveler_profiles TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.traveler_profiles TO authenticated;
  END IF;

  IF to_regclass('public.guide_applications') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.guide_applications FROM anon, authenticated, public;
    GRANT ALL ON TABLE public.guide_applications TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.guide_applications TO authenticated;
  END IF;
END $$;

DROP POLICY IF EXISTS "soft_launch_controls: anon read" ON public.soft_launch_controls;
REVOKE ALL ON TABLE public.soft_launch_controls FROM anon, authenticated, public;
GRANT ALL ON TABLE public.soft_launch_controls TO service_role;
GRANT SELECT ON TABLE public.soft_launch_controls TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.soft_launch_controls TO authenticated;

COMMIT;
