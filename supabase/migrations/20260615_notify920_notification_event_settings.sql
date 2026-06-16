-- notification_event_settings: singleton row holding the admin-controllable
-- notification matrix (#920). `overrides` is a sparse JSONB map keyed by
-- "<event>:<recipient>:<channel>" → boolean. A missing key means "use default"
-- (= enabled), so an empty/absent row preserves the historical all-on fan-out.
CREATE TABLE IF NOT EXISTS notification_event_settings (
  id text PRIMARY KEY DEFAULT 'singleton',
  overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure the singleton row exists.
INSERT INTO notification_event_settings (id) VALUES ('singleton')
ON CONFLICT (id) DO NOTHING;

-- RLS: service_role writes; authenticated can read (admin console reads via
-- service role, but keep parity with soft_launch_controls).
ALTER TABLE notification_event_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_event_settings: service_role full" ON notification_event_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "notification_event_settings: authenticated read" ON notification_event_settings
  FOR SELECT TO authenticated USING (true);

-- Audit trail of toggles (best-effort; mirrors soft_launch_control_audit).
CREATE TABLE IF NOT EXISTS notification_event_settings_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  event_key text NOT NULL,
  recipient text NOT NULL,
  channel text NOT NULL,
  to_value boolean NOT NULL
);
ALTER TABLE notification_event_settings_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_event_settings_audit: service_role full" ON notification_event_settings_audit
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "notification_event_settings_audit: authenticated read" ON notification_event_settings_audit
  FOR SELECT TO authenticated USING (true);
