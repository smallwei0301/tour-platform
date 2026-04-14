-- Migration: persist admin security state across serverless instances

CREATE TABLE IF NOT EXISTS admin_security (
  id TEXT PRIMARY KEY,
  token_override TEXT,
  session_version INTEGER NOT NULL DEFAULT 1,
  rotated_at TIMESTAMPTZ,
  forced_logout_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION set_admin_security_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_admin_security_updated_at ON admin_security;
CREATE TRIGGER trg_admin_security_updated_at
  BEFORE UPDATE ON admin_security
  FOR EACH ROW
  EXECUTE FUNCTION set_admin_security_updated_at();
