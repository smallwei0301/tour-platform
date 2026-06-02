-- GH-1067 follow-up: allow anonymous availability reads of season gates for public booking flows

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'activity_plan_seasons'
      AND policyname = 'Activity plan seasons read for anonymous'
  ) THEN
    CREATE POLICY "Activity plan seasons read for anonymous"
      ON public.activity_plan_seasons
      FOR SELECT
      TO anon
      USING (is_active);
  END IF;
END
$$;
