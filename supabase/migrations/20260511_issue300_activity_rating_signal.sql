BEGIN;

-- Columns already exist (migration 002_activities_admin.sql lines 19-20).
-- Idempotent add for safety.
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS rating_avg numeric(3,2),
  ADD COLUMN IF NOT EXISTS review_count integer DEFAULT 0;

-- Add CHECK constraint if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'activities_rating_avg_range'
    AND conrelid = 'public.activities'::regclass
  ) THEN
    ALTER TABLE public.activities
      ADD CONSTRAINT activities_rating_avg_range
      CHECK (rating_avg IS NULL OR (rating_avg >= 0 AND rating_avg <= 5));
  END IF;
END $$;

COMMIT;

-- Rollback: ALTER TABLE public.activities DROP CONSTRAINT IF EXISTS activities_rating_avg_range;
