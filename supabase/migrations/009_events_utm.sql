-- Migration 009: Add UTM columns to events table
-- TP-004 | 2026-04-04
-- 目的：在 events 表補 UTM 欄位，讓漏斗事件可帶來源歸因

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS utm_source   TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium   TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS utm_content  TEXT,
  ADD COLUMN IF NOT EXISTS utm_term     TEXT;

-- 常用查詢索引
CREATE INDEX IF NOT EXISTS events_utm_source_idx   ON events(utm_source) WHERE utm_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS events_utm_campaign_idx ON events(utm_campaign) WHERE utm_campaign IS NOT NULL;

COMMENT ON COLUMN events.utm_source   IS 'UTM source (e.g. google, facebook, line)';
COMMENT ON COLUMN events.utm_medium   IS 'UTM medium (e.g. cpc, social, email)';
COMMENT ON COLUMN events.utm_campaign IS 'UTM campaign name';
COMMENT ON COLUMN events.utm_content  IS 'UTM content differentiator (A/B variants)';
COMMENT ON COLUMN events.utm_term     IS 'UTM paid keyword term';
