-- Rollback: 20260511_issue359_reviews_moderation
-- Reverts moderation columns and restores original public_read_reviews policy

BEGIN;

ALTER TABLE public.activity_reviews DROP COLUMN IF EXISTS status;
ALTER TABLE public.activity_reviews DROP COLUMN IF EXISTS booking_id;
ALTER TABLE public.activity_reviews DROP COLUMN IF EXISTS user_id;

DROP INDEX IF EXISTS idx_activity_reviews_slug_status;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'activity_reviews'
      AND policyname = 'public_read_approved_reviews'
  ) THEN
    DROP POLICY "public_read_approved_reviews" ON public.activity_reviews;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'activity_reviews'
      AND policyname = 'public_read_reviews'
  ) THEN
    CREATE POLICY "public_read_reviews" ON public.activity_reviews
      FOR SELECT USING (true);
  END IF;
END $$;

COMMIT;
