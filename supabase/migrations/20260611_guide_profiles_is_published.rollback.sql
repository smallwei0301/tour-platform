-- Rollback for 20260611_guide_profiles_is_published.sql

ALTER TABLE public.guide_profiles
  DROP COLUMN IF EXISTS is_published;
