-- Issue #325: Centralized alerting bus — incidents table
-- Phase 13 — Tour Platform
-- Idempotent DDL (safe to re-run)

BEGIN;

CREATE TABLE IF NOT EXISTS incidents (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  severity    text        NOT NULL CHECK (severity IN ('info', 'warn', 'error', 'critical')),
  source      text        NOT NULL,
  category    text,
  fingerprint text,
  message     text        NOT NULL,
  metadata    jsonb       DEFAULT '{}',
  created_at  timestamptz DEFAULT now(),
  resolved_at timestamptz
);

-- RLS: restrict access to service_role only
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;

-- Idempotent policy creation
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'incidents'
      AND policyname = 'incidents: service role full access'
  ) THEN
    CREATE POLICY "incidents: service role full access"
      ON incidents
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- Supporting index for common queries
CREATE INDEX IF NOT EXISTS idx_incidents_severity   ON incidents (severity);
CREATE INDEX IF NOT EXISTS idx_incidents_source     ON incidents (source);
CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON incidents (created_at DESC);

COMMIT;
