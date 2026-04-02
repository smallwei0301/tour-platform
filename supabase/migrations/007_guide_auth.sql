-- Migration: 007_guide_auth
-- Purpose: Add guide self-service auth columns to guide_profiles
-- Rollback: 007_guide_auth.rollback.sql

ALTER TABLE guide_profiles
  ADD COLUMN IF NOT EXISTS invite_token TEXT,
  ADD COLUMN IF NOT EXISTS invite_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS guide_password_hash TEXT,
  ADD COLUMN IF NOT EXISTS guide_session_version INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS guide_profiles_invite_token_idx
  ON guide_profiles(invite_token) WHERE invite_token IS NOT NULL;
