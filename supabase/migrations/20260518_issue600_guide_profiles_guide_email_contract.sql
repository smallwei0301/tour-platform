-- Issue #600
-- Purpose: Align guide_profiles schema with payout/admin query contracts that project
-- guide_profiles(display_name, guide_email).
--
-- Safety:
-- - idempotent (ADD COLUMN IF NOT EXISTS)
-- - no destructive changes
-- - best-effort backfill from users.email via guide_profiles.user_id

ALTER TABLE public.guide_profiles
  ADD COLUMN IF NOT EXISTS guide_email text;

UPDATE public.guide_profiles gp
SET guide_email = lower(u.email)
FROM public.users u
WHERE gp.user_id = u.id
  AND u.email IS NOT NULL
  AND (gp.guide_email IS NULL OR gp.guide_email = '');

CREATE INDEX IF NOT EXISTS guide_profiles_guide_email_idx
  ON public.guide_profiles (guide_email)
  WHERE guide_email IS NOT NULL;
