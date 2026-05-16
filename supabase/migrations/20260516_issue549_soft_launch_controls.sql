-- soft_launch_controls: singleton row, service-role writable
CREATE TABLE IF NOT EXISTS soft_launch_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_paused boolean NOT NULL DEFAULT false,
  new_booking_paused boolean NOT NULL DEFAULT false,
  refund_manual_only boolean NOT NULL DEFAULT false,
  whitelist_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure singleton row
INSERT INTO soft_launch_controls DEFAULT VALUES
ON CONFLICT DO NOTHING;

-- RLS: service_role only for mutations; authenticated can read
ALTER TABLE soft_launch_controls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "soft_launch_controls: service_role full" ON soft_launch_controls
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "soft_launch_controls: authenticated read" ON soft_launch_controls
  FOR SELECT TO authenticated USING (true);

-- soft_launch_control_audit
CREATE TABLE IF NOT EXISTS soft_launch_control_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  control_key text NOT NULL,
  from_value boolean,
  to_value boolean NOT NULL,
  reason text NOT NULL,
  rollback_instruction text
);
ALTER TABLE soft_launch_control_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "soft_launch_control_audit: service_role full" ON soft_launch_control_audit
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "soft_launch_control_audit: authenticated read" ON soft_launch_control_audit
  FOR SELECT TO authenticated USING (true);

-- soft_launch_whitelist
CREATE TABLE IF NOT EXISTS soft_launch_whitelist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_type text NOT NULL CHECK (entry_type IN ('traveler_user_id', 'activity_id', 'guide_id')),
  value text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entry_type, value)
);
ALTER TABLE soft_launch_whitelist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "soft_launch_whitelist: service_role full" ON soft_launch_whitelist
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "soft_launch_whitelist: authenticated read" ON soft_launch_whitelist
  FOR SELECT TO authenticated USING (true);
