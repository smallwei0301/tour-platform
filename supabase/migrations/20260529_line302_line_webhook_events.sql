-- LINE integration (#302b): line_webhook_events — webhook delivery idempotency
-- Tour Platform — dedupe LINE webhook events by webhookEventId
-- Idempotent DDL (safe to re-run)
-- PII safety: stores only webhook_event_id, event_type, line_user_id. No message bodies.

BEGIN;

CREATE TABLE IF NOT EXISTS line_webhook_events (
  webhook_event_id text        PRIMARY KEY,
  event_type       text        NOT NULL,
  line_user_id     text,
  received_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE line_webhook_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'line_webhook_events'
      AND policyname = 'line_webhook_events: service role full access'
  ) THEN
    CREATE POLICY "line_webhook_events: service role full access"
      ON line_webhook_events
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_line_webhook_events_received_at
  ON line_webhook_events (received_at DESC);

COMMIT;
