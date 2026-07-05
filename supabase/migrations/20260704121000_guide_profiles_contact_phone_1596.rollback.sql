-- Rollback #1596
ALTER TABLE guide_profiles
  DROP COLUMN IF EXISTS contact_phone,
  DROP COLUMN IF EXISTS contact_phone_visible;
