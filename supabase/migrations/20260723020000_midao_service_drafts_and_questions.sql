-- #1758 S1 · Task 22 — guide service drafts + intake questions schema.
-- Forward-only, additive migration. Does NOT touch frozen orders/payments or
-- existing Package 2 migrations. Booking/inquiry runtime logic is out of scope
-- (drafts persistence only); LINE inquiry logic is deferred to #1759.

-- ---------------------------------------------------------------
-- guide_service_drafts: one in-progress draft per activity (revision drives
-- later optimistic-concurrency / 409 conflict detection).
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.guide_service_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL
    REFERENCES public.activities (id) ON DELETE CASCADE,
  guide_id UUID NOT NULL
    REFERENCES public.guide_profiles (id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT midao_guide_service_drafts_revision_check
    CHECK (revision >= 1),
  CONSTRAINT midao_guide_service_drafts_status_check
    CHECK (status IN ('active', 'discarded', 'published'))
);

-- At most one active draft per activity; discarded/published rows are exempt so
-- history is retained without blocking a fresh active draft.
CREATE UNIQUE INDEX IF NOT EXISTS midao_guide_service_drafts_single_active_idx
  ON public.guide_service_drafts (activity_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS midao_guide_service_drafts_guide_idx
  ON public.guide_service_drafts (guide_id, updated_at, id);

ALTER TABLE public.guide_service_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guide_service_drafts FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.guide_service_drafts
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.guide_service_drafts
  TO service_role;

COMMENT ON COLUMN public.guide_service_drafts.revision IS
  'Monotonic optimistic-concurrency token; later CAS updates bump it and reject stale writes with 409.';
COMMENT ON COLUMN public.guide_service_drafts.payload IS
  'Draft form snapshot only; must not contain tokens, cookies, payment secrets, or unnecessary traveler PII.';

-- ---------------------------------------------------------------
-- activity_intake_questions: per-activity custom intake questionnaire items.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_intake_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL
    REFERENCES public.activities (id) ON DELETE CASCADE,
  question_key TEXT NOT NULL,
  label TEXT NOT NULL,
  type TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  required BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT midao_activity_intake_questions_type_check
    CHECK (type IN ('single_choice', 'multi_choice', 'short_text', 'long_text')),
  CONSTRAINT midao_activity_intake_questions_key_length_check
    CHECK (octet_length(question_key) BETWEEN 1 AND 128),
  CONSTRAINT midao_activity_intake_questions_sort_order_check
    CHECK (sort_order >= 0),
  -- choice types require a non-empty options array; text types must carry none.
  CONSTRAINT midao_activity_intake_questions_options_shape_check
    CHECK (
      (
        type IN ('single_choice', 'multi_choice')
        AND jsonb_typeof(options) = 'array'
        AND jsonb_array_length(options) >= 1
      )
      OR
      (
        type IN ('short_text', 'long_text')
        AND jsonb_typeof(options) = 'array'
        AND jsonb_array_length(options) = 0
      )
    ),
  CONSTRAINT midao_activity_intake_questions_activity_key_unique
    UNIQUE (activity_id, question_key)
);

CREATE INDEX IF NOT EXISTS midao_activity_intake_questions_activity_sort_idx
  ON public.activity_intake_questions (activity_id, sort_order, id);

ALTER TABLE public.activity_intake_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_intake_questions FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.activity_intake_questions
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.activity_intake_questions
  TO service_role;

COMMENT ON COLUMN public.activity_intake_questions.options IS
  'Choice options for single_choice/multi_choice; must be an empty array for short_text/long_text.';

-- ---------------------------------------------------------------
-- activities.inquiry_enabled: additive per-activity LINE inquiry toggle.
-- Column only — inquiry runtime logic is deferred to #1759.
-- ---------------------------------------------------------------
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS inquiry_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.activities.inquiry_enabled IS
  'Enables the LINE inquiry entry point for this activity; defaults to false. Inquiry logic lands in #1759.';
