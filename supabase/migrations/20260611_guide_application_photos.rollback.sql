-- Rollback for 20260611_guide_application_photos.sql

ALTER TABLE public.guide_applications
  DROP COLUMN IF EXISTS profile_photo_url,
  DROP COLUMN IF EXISTS hero_image_url,
  DROP COLUMN IF EXISTS gallery_urls;
