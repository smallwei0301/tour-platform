-- Issue #598: Harden payment_events RLS and grants
-- Scope: remove legacy public-all policy and revoke anon/authenticated/public table access

BEGIN;

ALTER TABLE IF EXISTS payment_events ENABLE ROW LEVEL SECURITY;

-- Remove legacy overly-broad policies if present.
DROP POLICY IF EXISTS "payment_events: service role full access" ON payment_events;
DROP POLICY IF EXISTS "allow all payment_events" ON payment_events;
DROP POLICY IF EXISTS "payment_events policy" ON payment_events;

-- Recreate strict service-role-only policy (idempotent via drop+create).
DROP POLICY IF EXISTS "payment_events: service_role only" ON payment_events;
CREATE POLICY "payment_events: service_role only" ON payment_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Revoke broad table privileges from public-facing roles.
REVOKE ALL ON TABLE payment_events FROM anon, authenticated, public;

-- Keep explicit service role table privileges.
GRANT ALL ON TABLE payment_events TO service_role;

COMMIT;
