-- Rollback: 007_guide_auth
-- Safe to drop: only removing columns, no table drops, no FK issues

DROP INDEX IF EXISTS guide_profiles_invite_token_idx;

ALTER TABLE guide_profiles
  DROP COLUMN IF EXISTS invite_token,
  DROP COLUMN IF EXISTS invite_token_expires_at,
  DROP COLUMN IF EXISTS guide_password_hash,
  DROP COLUMN IF EXISTS guide_session_version;
