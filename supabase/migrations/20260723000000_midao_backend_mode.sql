ALTER TABLE public.guide_profiles
  ADD COLUMN IF NOT EXISTS backend_mode TEXT NOT NULL DEFAULT 'legacy';

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'midao_guide_profiles_backend_mode_check'
      AND conrelid = 'public.guide_profiles'::regclass
  ) THEN
    ALTER TABLE public.guide_profiles
      ADD CONSTRAINT midao_guide_profiles_backend_mode_check
      CHECK (backend_mode IN ('legacy', 'midao'));
  END IF;
END
$migration$;

CREATE INDEX IF NOT EXISTS midao_guide_profiles_backend_mode_idx
  ON public.guide_profiles (backend_mode);

COMMENT ON COLUMN public.guide_profiles.backend_mode IS
  'Selects the legacy or midao guide backend runtime; defaults to legacy for safe rollout.';
