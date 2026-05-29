-- LINE integration (#302b): line_user_mapping — traveler ↔ LINE userId binding
-- Tour Platform — LINE Login/LIFF + Messaging API per-traveler push foundation
-- Idempotent DDL (safe to re-run)
-- PII safety: stores only line_user_id + the keys needed to resolve an order
-- (user_id, contact_email) and an optional display_name. No message bodies.

BEGIN;

CREATE TABLE IF NOT EXISTS line_user_mapping (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id  text        NOT NULL UNIQUE,
  user_id       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  contact_email text,
  display_name  text,
  is_blocked    boolean     NOT NULL DEFAULT false,  -- set true on unfollow
  bound_at      timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- RLS: restrict access to service_role only (mirrors tour_reminder_log)
ALTER TABLE line_user_mapping ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'line_user_mapping'
      AND policyname = 'line_user_mapping: service role full access'
  ) THEN
    CREATE POLICY "line_user_mapping: service role full access"
      ON line_user_mapping
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- Resolution indexes: user_id is the primary key, contact_email the guest fallback.
CREATE INDEX IF NOT EXISTS idx_line_user_mapping_user_id
  ON line_user_mapping (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_line_user_mapping_email
  ON line_user_mapping (lower(contact_email)) WHERE contact_email IS NOT NULL;

COMMIT;
