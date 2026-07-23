CREATE TABLE IF NOT EXISTS public.midao_notification_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  CONSTRAINT midao_notification_outbox_status_check
    CHECK (status IN ('pending', 'processing', 'delivered', 'failed')),
  CONSTRAINT midao_notification_outbox_attempt_count_check
    CHECK (attempt_count >= 0)
);

CREATE INDEX IF NOT EXISTS midao_notification_outbox_claim_idx
  ON public.midao_notification_outbox (status, next_attempt_at, created_at)
  WHERE status IN ('pending', 'failed');

ALTER TABLE public.midao_notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midao_notification_outbox FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.midao_notification_outbox
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.midao_notification_outbox
  TO service_role;

COMMENT ON COLUMN public.midao_notification_outbox.payload IS
  'Minimal delivery payload only; must not contain complete PII or payment secrets.';
