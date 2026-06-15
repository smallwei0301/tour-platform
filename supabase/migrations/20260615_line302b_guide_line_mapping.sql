-- LINE integration (#302b): guide_line_mapping + guide_line_bind_code
-- Per-guide LINE push: a guide binds their LINE account via a one-time
-- BIND-XXXXXX code (deep-link from the guide console → bot chat → webhook).
-- Idempotent DDL (safe to re-run).
-- PII safety: stores only guide_id ↔ line_user_id + optional display_name.

BEGIN;

-- One guide ↔ one LINE userId. guide_id is the natural key (one binding/guide).
CREATE TABLE IF NOT EXISTS guide_line_mapping (
  guide_id     uuid        PRIMARY KEY REFERENCES guide_profiles(id) ON DELETE CASCADE,
  line_user_id text        NOT NULL UNIQUE,
  display_name text,
  is_blocked   boolean     NOT NULL DEFAULT false,  -- set true on unfollow
  bound_at     timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- One-time binding codes (short TTL). PK on code; one outstanding code per guide
-- is enforced by the app (delete-then-insert), index speeds that cleanup.
CREATE TABLE IF NOT EXISTS guide_line_bind_code (
  code       text        PRIMARY KEY,
  guide_id   uuid        NOT NULL REFERENCES guide_profiles(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guide_line_bind_code_guide_id
  ON guide_line_bind_code (guide_id);
CREATE INDEX IF NOT EXISTS idx_guide_line_bind_code_expires_at
  ON guide_line_bind_code (expires_at);

-- RLS: restrict access to service_role only (mirrors line_user_mapping)
ALTER TABLE guide_line_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE guide_line_bind_code ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'guide_line_mapping'
      AND policyname = 'guide_line_mapping: service role full access'
  ) THEN
    CREATE POLICY "guide_line_mapping: service role full access"
      ON guide_line_mapping
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'guide_line_bind_code'
      AND policyname = 'guide_line_bind_code: service role full access'
  ) THEN
    CREATE POLICY "guide_line_bind_code: service role full access"
      ON guide_line_bind_code
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

COMMIT;
