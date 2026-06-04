-- Issue #1174: Review invitation delivery log + idempotency guard
--
-- Tracks the canonical source of truth for review-invitation deliveries so
-- the existing admin manual-trigger flow (and any future cron automation)
-- never double-sends, and so failed attempts leave a privacy-safe audit
-- trail that can be retried.
--
-- Mirrors the conventions used by tour_reminder_log (idempotent delivery
-- log with status/sent_at/error) and incidents (service-role-only RLS).

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

-- Idempotency guard: at most one 'sent' row per (order, kind, channel).
-- Failed attempts are allowed to accumulate so retries can be observed and
-- audited; once a 'sent' row exists, additional 'sent' inserts are rejected.
CREATE UNIQUE INDEX IF NOT EXISTS review_invitations_sent_unique
  ON public.review_invitations (order_id, invitation_kind, channel)
  WHERE status = 'sent';

CREATE INDEX IF NOT EXISTS review_invitations_order_id_idx
  ON public.review_invitations (order_id);

ALTER TABLE public.review_invitations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'review_invitations'
      AND policyname = 'review_invitations: service role full access'
  ) THEN
    CREATE POLICY "review_invitations: service role full access"
      ON public.review_invitations
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

REVOKE ALL ON public.review_invitations FROM anon, authenticated;
GRANT ALL ON public.review_invitations TO service_role;
