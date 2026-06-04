-- Issue #1171: Guide trip report storage
--
-- Canonical source of truth for guide trip-report submissions, so the
-- existing tripReportStatus() predicate can stop hardcoding submittedAt=null
-- and Admin post-trip status/summary endpoints can show real submitted_at
-- instead of treating every ended trip as overdue.
--
-- Mirrors the conventions used by review_invitations (idempotent delivery-style
-- log with partial unique index) and incidents (service-role-only RLS).

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

-- Idempotency guard: at most one 'submitted' row per booking. Revised rows
-- (status='revised') can accumulate so the audit trail is preserved, while
-- the active submitted record stays unique.
CREATE UNIQUE INDEX IF NOT EXISTS guide_trip_reports_booking_submitted_unique
  ON public.guide_trip_reports (booking_id)
  WHERE status = 'submitted';

CREATE INDEX IF NOT EXISTS guide_trip_reports_guide_id_idx
  ON public.guide_trip_reports (guide_id);

CREATE INDEX IF NOT EXISTS guide_trip_reports_booking_id_idx
  ON public.guide_trip_reports (booking_id);

ALTER TABLE public.guide_trip_reports ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'guide_trip_reports'
      AND policyname = 'guide_trip_reports: service role full access'
  ) THEN
    CREATE POLICY "guide_trip_reports: service role full access"
      ON public.guide_trip_reports
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

REVOKE ALL ON public.guide_trip_reports FROM anon, authenticated;
GRANT ALL ON public.guide_trip_reports TO service_role;
