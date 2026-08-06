-- Issue #1759 Package 4 Task 32: source-only booking intake, pricing, and confirmation schema.
-- Forward-only and additive. Do not apply this migration to production here.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS source_inquiry_id UUID UNIQUE REFERENCES public.guide_inquiries(id) ON DELETE RESTRICT;
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS traveler_confirmation_status TEXT NOT NULL DEFAULT 'not_required'
    CHECK (traveler_confirmation_status IN ('not_required', 'pending', 'confirmed', 'expired'));
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS traveler_confirmation_expires_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'midao_guide_inquiries_converted_booking_fk'
      AND conrelid = 'public.guide_inquiries'::regclass
  ) THEN
    ALTER TABLE public.guide_inquiries
      ADD CONSTRAINT midao_guide_inquiries_converted_booking_fk
      FOREIGN KEY (converted_booking_id) REFERENCES public.bookings(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS midao_bookings_source_inquiry_idx
  ON public.bookings (source_inquiry_id)
  WHERE source_inquiry_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.booking_intake_responses (
  booking_id UUID PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  questionnaire_snapshot JSONB NOT NULL,
  answers JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT midao_booking_intake_responses_questionnaire_object_check
    CHECK (jsonb_typeof(questionnaire_snapshot) = 'object'),
  CONSTRAINT midao_booking_intake_responses_answers_object_check
    CHECK (jsonb_typeof(answers) = 'object')
);

CREATE TABLE IF NOT EXISTS public.booking_pricing_snapshots (
  booking_id UUID PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  plan_base_price_twd INTEGER NOT NULL,
  quoted_total_twd INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TWD',
  party_size INTEGER NOT NULL,
  created_by_guide_id UUID REFERENCES public.guide_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT midao_booking_pricing_snapshots_source_check
    CHECK (source IN ('plan_price', 'inquiry_quote')),
  CONSTRAINT midao_booking_pricing_snapshots_plan_base_price_check
    CHECK (plan_base_price_twd >= 0),
  CONSTRAINT midao_booking_pricing_snapshots_quoted_total_check
    CHECK (quoted_total_twd >= 0),
  CONSTRAINT midao_booking_pricing_snapshots_currency_check
    CHECK (currency = 'TWD'),
  CONSTRAINT midao_booking_pricing_snapshots_party_size_check
    CHECK (party_size >= 1)
);

CREATE TABLE IF NOT EXISTS public.booking_confirmation_tokens (
  booking_id UUID PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT midao_booking_confirmation_tokens_consumed_after_created_check
    CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

CREATE INDEX IF NOT EXISTS midao_booking_confirmation_tokens_pending_expiry_idx
  ON public.booking_confirmation_tokens (expires_at, booking_id)
  WHERE consumed_at IS NULL;

ALTER TABLE public.booking_intake_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_intake_responses FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.booking_intake_responses FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.booking_intake_responses TO service_role;

ALTER TABLE public.booking_pricing_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_pricing_snapshots FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.booking_pricing_snapshots FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.booking_pricing_snapshots TO service_role;

ALTER TABLE public.booking_confirmation_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_confirmation_tokens FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.booking_confirmation_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.booking_confirmation_tokens TO service_role;

COMMENT ON TABLE public.booking_intake_responses IS
  'Immutable per-booking inquiry questionnaire snapshot and traveler answers; do not copy into bookings.customer_note.';
COMMENT ON TABLE public.booking_pricing_snapshots IS
  'Immutable server-side pricing basis. Later conversion/checkout code must not accept traveler price overrides.';
COMMENT ON TABLE public.booking_confirmation_tokens IS
  'Hash-only, one-time traveler confirmation secret storage. Raw confirmation secrets are never persisted.';
COMMENT ON COLUMN public.bookings.source_inquiry_id IS
  'One converted booking may reference one source inquiry; UNIQUE enforces the no-double-convert schema boundary.';
