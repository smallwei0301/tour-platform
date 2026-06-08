-- GH-1286: Canonical apply script for 7 migrations that landed in main but were
-- never applied to production.
--
-- Idempotency guarantee: every statement uses IF NOT EXISTS / DROP CONSTRAINT IF EXISTS
-- so re-running on a schema that is already current is safe (no-op for applied portions).
--
-- Execution order mirrors the original migration file timestamps so FK/reference
-- ordering is preserved.
--
-- DANGER: This script is prepared for operator execution ONLY after the owner approval
-- gate (Ava -> owner). Do NOT run this script from an agent or automated pipeline.
-- See docs/operations/GH-1286-prod-apply-runbook.md for the full apply + rollback procedure.

BEGIN;

-- ============================================================
-- 1. 20260513_issue497: Add 'archived' to activity_plans status CHECK constraint
-- ============================================================
ALTER TABLE public.activity_plans
  DROP CONSTRAINT IF EXISTS activity_plans_status_check;

ALTER TABLE public.activity_plans
  ADD CONSTRAINT activity_plans_status_check
  CHECK (status IN ('active', 'inactive', 'archived'));

COMMENT ON COLUMN public.activity_plans.status IS
  'Lifecycle status: active=bookable by travelers; inactive=not bookable but visible to guide; archived=soft-deleted, hidden from traveler view';

-- ============================================================
-- 2. 20260602_issue1067: Create activity_plan_seasons table + RLS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.activity_plan_seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_plan_id uuid NOT NULL REFERENCES public.activity_plans(id) ON DELETE CASCADE,
  start_month int NOT NULL CHECK (start_month BETWEEN 1 AND 12),
  start_day   int NOT NULL CHECK (start_day   BETWEEN 1 AND 31),
  end_month   int NOT NULL CHECK (end_month   BETWEEN 1 AND 12),
  end_day     int NOT NULL CHECK (end_day     BETWEEN 1 AND 31),
  timezone    text NOT NULL DEFAULT 'Asia/Taipei',
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_plan_seasons_plan_id
  ON public.activity_plan_seasons(activity_plan_id);

CREATE INDEX IF NOT EXISTS idx_activity_plan_seasons_plan_active
  ON public.activity_plan_seasons(activity_plan_id, is_active);

ALTER TABLE public.activity_plan_seasons ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'activity_plan_seasons'
      AND policyname = 'Activity plan seasons read for authenticated'
  ) THEN
    CREATE POLICY "Activity plan seasons read for authenticated"
      ON public.activity_plan_seasons FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'activity_plan_seasons'
      AND policyname = 'Activity plan seasons mutate for service role'
  ) THEN
    CREATE POLICY "Activity plan seasons mutate for service role"
      ON public.activity_plan_seasons FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END
$$;

-- ============================================================
-- 3. 20260603_issue1067: Allow anonymous read of activity_plan_seasons
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'activity_plan_seasons'
      AND policyname = 'Activity plan seasons read for anonymous'
  ) THEN
    CREATE POLICY "Activity plan seasons read for anonymous"
      ON public.activity_plan_seasons FOR SELECT TO anon USING (is_active);
  END IF;
END
$$;

-- ============================================================
-- 4. 20260603_issue1067: Create guide_slot_conflict_overrides table + RLS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.guide_slot_conflict_overrides (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id             uuid        NOT NULL REFERENCES public.guide_profiles(id) ON DELETE CASCADE,
  activity_id          uuid        NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  activity_plan_id     uuid        NOT NULL REFERENCES public.activity_plans(id) ON DELETE CASCADE,
  start_at             timestamptz NOT NULL,
  end_at               timestamptz NOT NULL,
  reason               text        NOT NULL CHECK (btrim(reason) <> ''),
  requires_helper      boolean     NOT NULL DEFAULT false,
  helper_status        text        NOT NULL DEFAULT 'not_needed'
                                   CHECK (helper_status IN ('not_needed', 'required', 'pending_assignment', 'assigned', 'declined')),
  guide_note           text,
  admin_note           text,
  status               text        NOT NULL DEFAULT 'active'
                                   CHECK (status IN ('active', 'disabled', 'cancelled')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by_admin_email text,
  CHECK (end_at > start_at)
);

COMMENT ON TABLE  public.guide_slot_conflict_overrides IS
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
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'guide_slot_conflict_overrides'
      AND policyname = 'Guide slot conflict overrides mutate for service role'
  ) THEN
    CREATE POLICY "Guide slot conflict overrides mutate for service role"
      ON public.guide_slot_conflict_overrides FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END
$$;

-- Booking audit columns for conflict overrides
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS conflict_override_id       uuid,
  ADD COLUMN IF NOT EXISTS conflict_override_snapshot jsonb;

COMMENT ON COLUMN public.bookings.conflict_override_id IS
  'Nullable admin conflict override id captured when a blocked guide slot is explicitly allowed.';
COMMENT ON COLUMN public.bookings.conflict_override_snapshot IS
  'Booking-time snapshot of override metadata for audit/debug without relying on mutable override rows.';

CREATE INDEX IF NOT EXISTS idx_bookings_conflict_override_id
  ON public.bookings(conflict_override_id)
  WHERE conflict_override_id IS NOT NULL;

-- ============================================================
-- 5. 20260604_issue1171: Create guide_trip_reports table + RLS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.guide_trip_reports (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id        uuid        NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  guide_id          uuid        NOT NULL REFERENCES public.guide_profiles(id) ON DELETE CASCADE,
  status            text        NOT NULL DEFAULT 'submitted'
                                CHECK (status IN ('submitted', 'revised')),
  trip_completed    boolean     NOT NULL DEFAULT true,
  traveler_no_show  boolean     NOT NULL DEFAULT false,
  guide_concern     text,
  safety_concern    text,
  internal_note     text,
  submitted_at      timestamptz NOT NULL DEFAULT now(),
  revised_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS guide_trip_reports_booking_submitted_unique
  ON public.guide_trip_reports(booking_id)
  WHERE status = 'submitted';

CREATE INDEX IF NOT EXISTS guide_trip_reports_guide_id_idx
  ON public.guide_trip_reports(guide_id);

CREATE INDEX IF NOT EXISTS guide_trip_reports_booking_id_idx
  ON public.guide_trip_reports(booking_id);

ALTER TABLE public.guide_trip_reports ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename  = 'guide_trip_reports'
      AND policyname = 'guide_trip_reports: service role full access'
  ) THEN
    CREATE POLICY "guide_trip_reports: service role full access"
      ON public.guide_trip_reports
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

REVOKE ALL ON public.guide_trip_reports FROM anon, authenticated;
GRANT  ALL ON public.guide_trip_reports TO service_role;

-- ============================================================
-- 6. 20260604_issue1174: Create review_invitations table + RLS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.review_invitations (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             uuid        NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  invitation_kind      text        NOT NULL DEFAULT 'post_trip_review'
                                   CHECK (invitation_kind IN ('post_trip_review')),
  channel              text        NOT NULL DEFAULT 'email'
                                   CHECK (channel IN ('email')),
  status               text        NOT NULL
                                   CHECK (status IN ('sent', 'failed', 'suppressed')),
  initiated_by         text        NOT NULL
                                   CHECK (initiated_by IN ('admin_manual', 'cron')),
  sent_at              timestamptz,
  failed_at            timestamptz,
  failure_reason       text,
  provider_message_id  text,
  eligibility_snapshot jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS review_invitations_sent_unique
  ON public.review_invitations(order_id, invitation_kind, channel)
  WHERE status = 'sent';

CREATE INDEX IF NOT EXISTS review_invitations_order_id_idx
  ON public.review_invitations(order_id);

ALTER TABLE public.review_invitations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename  = 'review_invitations'
      AND policyname = 'review_invitations: service role full access'
  ) THEN
    CREATE POLICY "review_invitations: service role full access"
      ON public.review_invitations
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

REVOKE ALL ON public.review_invitations FROM anon, authenticated;
GRANT  ALL ON public.review_invitations TO service_role;

-- ============================================================
-- 7. 20260605_issue1067: Add is_year_round column to activity_plans
-- ============================================================
ALTER TABLE public.activity_plans
  ADD COLUMN IF NOT EXISTS is_year_round BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.activity_plans.is_year_round IS
  'Explicit year-round availability flag. False means season availability must come from active activity_plan_seasons rows.';

COMMIT;
