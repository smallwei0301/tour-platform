-- Telegram order notifications: chat binding + one-time codes + webhook idempotency.
-- One order-notification bot; two roles: 'guide' (subject_id = guide_profiles.id)
-- and 'traveler' (subject_id = auth.users.id, contact_email as guest fallback).
-- Idempotent DDL (safe to re-run). PII: only chat_id + subject keys.

BEGIN;

CREATE TABLE IF NOT EXISTS telegram_chat_mapping (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  role         text        NOT NULL CHECK (role IN ('guide', 'traveler')),
  subject_id   text,
  contact_email text,
  chat_id      text        NOT NULL,
  display_name text,
  is_blocked   boolean     NOT NULL DEFAULT false,  -- set true when user blocks the bot
  bound_at     timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_telegram_chat_mapping_chat ON telegram_chat_mapping (chat_id);
CREATE INDEX IF NOT EXISTS idx_telegram_chat_mapping_email
  ON telegram_chat_mapping (lower(contact_email)) WHERE contact_email IS NOT NULL;

CREATE TABLE IF NOT EXISTS telegram_bind_code (
  code         text        PRIMARY KEY,
  role         text        NOT NULL CHECK (role IN ('guide', 'traveler')),
  subject_id   text,
  contact_email text,
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_telegram_bind_code_subject ON telegram_bind_code (role, subject_id);

CREATE TABLE IF NOT EXISTS telegram_webhook_events (
  update_id   text        PRIMARY KEY,
  received_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: service_role only (mirrors line_user_mapping / guide_line_mapping)
ALTER TABLE telegram_chat_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_bind_code ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_webhook_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'telegram_chat_mapping'
      AND policyname = 'telegram_chat_mapping: service role full access') THEN
    CREATE POLICY "telegram_chat_mapping: service role full access" ON telegram_chat_mapping
      USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'telegram_bind_code'
      AND policyname = 'telegram_bind_code: service role full access') THEN
    CREATE POLICY "telegram_bind_code: service role full access" ON telegram_bind_code
      USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'telegram_webhook_events'
      AND policyname = 'telegram_webhook_events: service role full access') THEN
    CREATE POLICY "telegram_webhook_events: service role full access" ON telegram_webhook_events
      USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

COMMIT;
