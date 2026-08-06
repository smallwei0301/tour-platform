-- Issue #1759 Package 4 Task 32: source-only traveler inquiry schema.
-- Forward-only and additive. Do not apply this migration to production here.

CREATE TABLE IF NOT EXISTS public.guide_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_no TEXT NOT NULL UNIQUE,
  traveler_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  guide_id UUID NOT NULL REFERENCES public.guide_profiles(id) ON DELETE RESTRICT,
  activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE RESTRICT,
  activity_plan_id UUID REFERENCES public.activity_plans(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'new',
  preferred_date DATE,
  backup_date DATE,
  start_time_local TIME,
  party_size INTEGER,
  language TEXT,
  pickup_required BOOLEAN,
  traveler_note TEXT,
  questionnaire_snapshot JSONB NOT NULL,
  answers JSONB NOT NULL,
  last_replied_at TIMESTAMPTZ,
  converted_booking_id UUID UNIQUE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT midao_guide_inquiries_status_check
    CHECK (status IN ('new', 'opened', 'replied', 'ready_to_convert', 'converted', 'closed', 'expired')),
  CONSTRAINT midao_guide_inquiries_party_size_check
    CHECK (party_size IS NULL OR party_size >= 1),
  CONSTRAINT midao_guide_inquiries_dates_check
    CHECK (backup_date IS NULL OR preferred_date IS NULL OR backup_date >= preferred_date),
  CONSTRAINT midao_guide_inquiries_questionnaire_snapshot_object_check
    CHECK (jsonb_typeof(questionnaire_snapshot) = 'object'),
  CONSTRAINT midao_guide_inquiries_answers_object_check
    CHECK (jsonb_typeof(answers) = 'object')
);

CREATE INDEX IF NOT EXISTS midao_guide_inquiries_traveler_created_idx
  ON public.guide_inquiries (traveler_user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS midao_guide_inquiries_guide_status_updated_idx
  ON public.guide_inquiries (guide_id, status, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS midao_guide_inquiries_activity_status_updated_idx
  ON public.guide_inquiries (activity_id, status, updated_at DESC, id DESC);

ALTER TABLE public.guide_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guide_inquiries FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.guide_inquiries FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.guide_inquiries TO service_role;
GRANT SELECT ON TABLE public.guide_inquiries TO authenticated;

CREATE POLICY midao_guide_inquiries_traveler_select
  ON public.guide_inquiries
  FOR SELECT
  TO authenticated
  USING (traveler_user_id = auth.uid());

COMMENT ON TABLE public.guide_inquiries IS
  'Traveler-owned LINE inquiry intake. This is not a booking type and stores no LINE conversation.';
COMMENT ON COLUMN public.guide_inquiries.converted_booking_id IS
  'Set only by the later atomic conversion command; UNIQUE prevents duplicate converted bookings per inquiry.';
COMMENT ON COLUMN public.guide_inquiries.questionnaire_snapshot IS
  'Immutable activity questionnaire shape captured at inquiry creation.';
COMMENT ON COLUMN public.guide_inquiries.answers IS
  'Traveler answers captured at inquiry creation; never use this column for secrets or raw confirmation tokens.';
