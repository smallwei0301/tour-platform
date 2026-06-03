-- GH-1067 migration rollout: formal conflict override table + booking audit columns
-- Scope: make PR #1180 runtime schema contract real without removing compatibility fallback

BEGIN;

CREATE TABLE IF NOT EXISTS public.guide_slot_conflict_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id uuid NOT NULL REFERENCES public.guide_profiles(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  activity_plan_id uuid NOT NULL REFERENCES public.activity_plans(id) ON DELETE CASCADE,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  requires_helper boolean NOT NULL DEFAULT false,
  helper_status text NOT NULL DEFAULT 'not_needed'
    CHECK (helper_status IN ('not_needed', 'required', 'pending_assignment', 'assigned', 'declined')),
  guide_note text,
  admin_note text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_admin_email text,
  CHECK (end_at > start_at)
);

COMMENT ON TABLE public.guide_slot_conflict_overrides IS
  'Admin conflict override for otherwise blocked guide slots; must not be treated as ordinary availability.';
COMMENT ON COLUMN public.guide_slot_conflict_overrides.reason IS
  'Operator-visible reason for overriding a blocked guide slot.';
COMMENT ON COLUMN public.guide_slot_conflict_overrides.requires_helper IS
  'Whether the override requires a helper/assistant to safely serve the slot.';
COMMENT ON COLUMN public.guide_slot_conflict_overrides.helper_status IS
  'Helper coordination state for the override: not_needed, required, pending_assignment, assigned, declined.';
COMMENT ON COLUMN public.guide_slot_conflict_overrides.status IS
  'Lifecycle state for the override record: active, disabled, or cancelled.';
COMMENT ON COLUMN public.guide_slot_conflict_overrides.created_by_admin_email IS
  'Admin email recorded for future privileged mutation/audit routes.';

CREATE INDEX IF NOT EXISTS idx_guide_slot_conflict_overrides_exact_active
  ON public.guide_slot_conflict_overrides(guide_id, activity_id, activity_plan_id, start_at, end_at)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_guide_slot_conflict_overrides_plan_date_active
  ON public.guide_slot_conflict_overrides(activity_plan_id, start_at, end_at)
  WHERE status = 'active';

ALTER TABLE public.guide_slot_conflict_overrides ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'guide_slot_conflict_overrides'
      AND policyname = 'Guide slot conflict overrides read for anonymous'
  ) THEN
    CREATE POLICY "Guide slot conflict overrides read for anonymous"
      ON public.guide_slot_conflict_overrides
      FOR SELECT
      TO anon
      USING (status = 'active');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'guide_slot_conflict_overrides'
      AND policyname = 'Guide slot conflict overrides read for authenticated'
  ) THEN
    CREATE POLICY "Guide slot conflict overrides read for authenticated"
      ON public.guide_slot_conflict_overrides
      FOR SELECT
      TO authenticated
      USING (status = 'active');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'guide_slot_conflict_overrides'
      AND policyname = 'Guide slot conflict overrides mutate for service role'
  ) THEN
    CREATE POLICY "Guide slot conflict overrides mutate for service role"
      ON public.guide_slot_conflict_overrides
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS conflict_override_id uuid,
  ADD COLUMN IF NOT EXISTS conflict_override_snapshot jsonb;

COMMENT ON COLUMN public.bookings.conflict_override_id IS
  'Nullable admin conflict override id captured when a blocked guide slot is explicitly allowed.';
COMMENT ON COLUMN public.bookings.conflict_override_snapshot IS
  'Booking-time snapshot of override metadata for audit/debug without relying on mutable override rows.';

CREATE INDEX IF NOT EXISTS idx_bookings_conflict_override_id
  ON public.bookings(conflict_override_id)
  WHERE conflict_override_id IS NOT NULL;

COMMIT;
