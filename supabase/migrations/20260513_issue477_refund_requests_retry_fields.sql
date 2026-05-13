-- Issue #477: add retry_count + last_error to refund_requests for idempotent refund sync
ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;
ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS last_error text;

-- Tighten payment_events RLS: restrict to service_role only (server-side code only)
-- The previous "FOR ALL USING (true)" policy is too permissive for auth/anon roles.
DROP POLICY IF EXISTS "allow all payment_events" ON payment_events;
DROP POLICY IF EXISTS "payment_events policy" ON payment_events;
CREATE POLICY "payment_events: service_role only" ON payment_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);
