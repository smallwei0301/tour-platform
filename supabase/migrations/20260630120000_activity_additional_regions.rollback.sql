-- Rollback for 20260630120000_activity_additional_regions.sql
DROP INDEX IF EXISTS activities_regions_gin_idx;

ALTER TABLE public.activities
  DROP COLUMN IF EXISTS regions;
