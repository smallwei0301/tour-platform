CREATE TABLE IF NOT EXISTS public.midao_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  guide_id UUID NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  request_id UUID NOT NULL,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS midao_audit_events_action_request_idx
  ON public.midao_audit_events (action, request_id, id);

CREATE INDEX IF NOT EXISTS midao_audit_events_guide_created_idx
  ON public.midao_audit_events (guide_id, created_at, id);

ALTER TABLE public.midao_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midao_audit_events FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.midao_audit_events
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.midao_audit_events
  TO service_role;

COMMENT ON COLUMN public.midao_audit_events.metadata IS
  'Minimal audit context only; must not contain tokens, cookies, payment secrets, or complete traveler PII.';
