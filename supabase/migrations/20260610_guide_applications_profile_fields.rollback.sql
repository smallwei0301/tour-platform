-- Rollback for 20260610_guide_applications_profile_fields.sql

ALTER TABLE public.guide_applications
  DROP COLUMN IF EXISTS specialties,
  DROP COLUMN IF EXISTS languages,
  DROP COLUMN IF EXISTS regions,
  DROP COLUMN IF EXISTS certifications,
  DROP COLUMN IF EXISTS payment_method;
