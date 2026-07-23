CREATE TABLE IF NOT EXISTS public.midao_idempotency_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  command_name TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  scope_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'processing',
  response_status INTEGER,
  response_body JSONB,
  resource_type TEXT,
  resource_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT midao_idempotency_records_state_check
    CHECK (state IN ('processing', 'completed')),
  CONSTRAINT midao_idempotency_records_key_length_check
    CHECK (octet_length(idempotency_key) BETWEEN 1 AND 128),
  CONSTRAINT midao_idempotency_records_hash_check
    CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT midao_idempotency_records_response_check
    CHECK (
      (
        state = 'processing'
        AND response_status IS NULL
        AND response_body IS NULL
        AND completed_at IS NULL
      )
      OR
      (
        state = 'completed'
        AND response_status IS NOT NULL
        AND response_body IS NOT NULL
        AND response_body <> 'null'::jsonb
        AND completed_at IS NOT NULL
      )
    ),
  CONSTRAINT midao_idempotency_records_scope_key_unique
    UNIQUE (scope_type, scope_id, command_name, idempotency_key)
);

CREATE INDEX IF NOT EXISTS midao_idempotency_records_expiry_idx
  ON public.midao_idempotency_records (expires_at, id);

CREATE INDEX IF NOT EXISTS midao_idempotency_records_stale_processing_idx
  ON public.midao_idempotency_records (locked_at, id)
  WHERE state = 'processing';

ALTER TABLE public.midao_idempotency_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midao_idempotency_records FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.midao_idempotency_records
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.midao_idempotency_records
  TO service_role;

COMMENT ON COLUMN public.midao_idempotency_records.response_body IS
  'Sanitized replay snapshot; must not contain raw confirmation tokens, cookies, secrets, or unnecessary PII.';
COMMENT ON COLUMN public.midao_idempotency_records.state IS
  'processing is an active claim; concurrent replays must wait or retry and never return a placeholder response.';
