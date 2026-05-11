-- Issue #341: Pre-tour reminder pipeline — tour_reminder_log table
-- Phase 13 — Tour Platform
-- Idempotent DDL (safe to re-run)
-- PII safety: stores only order_id, schedule_id, kind, channel, status, error (truncated)
-- Does NOT store message body or contact details

BEGIN;

CREATE TABLE IF NOT EXISTS tour_reminder_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid        NOT NULL,
  schedule_id   uuid        NOT NULL,
  reminder_kind text        NOT NULL CHECK (reminder_kind IN ('h24', 'h1')),
  channel       text        NOT NULL CHECK (channel IN ('email', 'line_notify_admin')),
  status        text        NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  sent_at       timestamptz,
  error         text,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (order_id, reminder_kind, channel)
);

-- RLS: restrict access to service_role only
ALTER TABLE tour_reminder_log ENABLE ROW LEVEL SECURITY;

-- Idempotent policy creation
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tour_reminder_log'
      AND policyname = 'tour_reminder_log: service role full access'
  ) THEN
    CREATE POLICY "tour_reminder_log: service role full access"
      ON tour_reminder_log
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- Supporting indexes for sweep queries
CREATE INDEX IF NOT EXISTS idx_tour_reminder_log_order_id     ON tour_reminder_log (order_id);
CREATE INDEX IF NOT EXISTS idx_tour_reminder_log_schedule_id  ON tour_reminder_log (schedule_id);
CREATE INDEX IF NOT EXISTS idx_tour_reminder_log_created_at   ON tour_reminder_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tour_reminder_log_kind_channel ON tour_reminder_log (reminder_kind, channel);

COMMIT;
