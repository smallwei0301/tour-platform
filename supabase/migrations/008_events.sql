-- Migration 008: Event Tracking Table
-- TP-001 | 2026-04-04
-- 目的：建立事件追蹤基礎設施（events table + index + RLS）

-- ── events table ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id            BIGSERIAL   PRIMARY KEY,
  event_name    TEXT        NOT NULL,
  session_id    TEXT,
  contact_email TEXT,
  order_id      UUID        REFERENCES orders(id) ON DELETE SET NULL,
  activity_id   UUID        REFERENCES activities(id) ON DELETE SET NULL,
  schedule_id   UUID        REFERENCES activity_schedules(id) ON DELETE SET NULL,
  properties    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  error_code    TEXT,
  page_path     TEXT,
  referrer      TEXT,
  user_agent    TEXT,
  ip_hash       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS events_event_name_idx   ON events(event_name);
CREATE INDEX IF NOT EXISTS events_session_id_idx   ON events(session_id);
CREATE INDEX IF NOT EXISTS events_order_id_idx     ON events(order_id);
CREATE INDEX IF NOT EXISTS events_activity_id_idx  ON events(activity_id);
CREATE INDEX IF NOT EXISTS events_created_at_idx   ON events(created_at DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- 只有 service_role 可寫入（前端透過 /api/events API route）
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'events' AND policyname = 'events: service_role insert'
  ) THEN
    CREATE POLICY "events: service_role insert"
      ON events FOR INSERT TO service_role WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'events' AND policyname = 'events: service_role select'
  ) THEN
    CREATE POLICY "events: service_role select"
      ON events FOR SELECT TO service_role USING (true);
  END IF;
END $$;

-- ── Comment ───────────────────────────────────────────────────────────────────
COMMENT ON TABLE events IS 'User behavior event tracking for funnel analysis. Write via /api/events only.';
COMMENT ON COLUMN events.event_name IS 'page_view|view_item_list|select_item|view_item|begin_checkout|purchase_intent|payment_callback_received|payment_succeeded|error';
COMMENT ON COLUMN events.session_id IS 'Client-generated anonymous session UUID (sessionStorage)';
COMMENT ON COLUMN events.properties IS 'Event-specific payload. See docs/06-analytics/01-event-tracking-design.md';
COMMENT ON COLUMN events.ip_hash IS 'SHA-256 of client IP for anonymous unique visitor counting';
