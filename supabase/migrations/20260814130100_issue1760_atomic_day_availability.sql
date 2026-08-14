-- Issue #1760 Package 5 / slice 1: atomic replacement of a guide's global availability for one local day.
-- This is dormant schema/RPC only. No route, UI, or availability resolver is changed here.

CREATE TABLE IF NOT EXISTS public.guide_availability_day_revisions (
  guide_id uuid NOT NULL REFERENCES public.guide_profiles(id) ON DELETE CASCADE,
  local_date date NOT NULL,
  timezone text NOT NULL,
  revision bigint NOT NULL DEFAULT 0,
  is_closed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (guide_id, local_date),
  CONSTRAINT guide_availability_day_revisions_revision_nonnegative_check
    CHECK (revision >= 0)
);

ALTER TABLE public.guide_availability_day_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guide_availability_day_revisions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.guide_availability_day_revisions
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.guide_availability_day_revisions
  TO service_role;

CREATE OR REPLACE FUNCTION public.midao_replace_global_day_availability(
  p_guide_id uuid,
  p_local_date date,
  p_timezone text,
  p_expected_revision bigint,
  p_ranges jsonb,
  p_idempotency_key text,
  p_request_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $issue1760_day_cas$
DECLARE
  v_timezone text := pg_catalog.nullif(pg_catalog.btrim(p_timezone), '');
  v_idempotency_key text := pg_catalog.nullif(pg_catalog.btrim(p_idempotency_key), '');
  v_request_hash text := pg_catalog.lower(pg_catalog.nullif(pg_catalog.btrim(p_request_hash), ''));
  v_day public.guide_availability_day_revisions%ROWTYPE;
  v_existing_idempotency public.midao_idempotency_records%ROWTYPE;
  v_idempotency_id uuid;
  v_claimed boolean := false;
  v_range jsonb;
  v_start text;
  v_end text;
  v_response jsonb;
  v_next_revision bigint;
BEGIN
  IF p_guide_id IS NULL OR p_local_date IS NULL OR v_timezone IS NULL
    OR p_expected_revision IS NULL OR p_expected_revision < 0 THEN
    RETURN pg_catalog.jsonb_build_object('code', 'INVALID_ARGUMENT', 'status', 422);
  END IF;
  IF v_idempotency_key IS NULL OR pg_catalog.octet_length(v_idempotency_key) > 128
    OR v_request_hash IS NULL OR v_request_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN pg_catalog.jsonb_build_object('code', 'INVALID_IDEMPOTENCY', 'status', 422);
  END IF;
  IF pg_catalog.jsonb_typeof(p_ranges) <> 'array' THEN
    RETURN pg_catalog.jsonb_build_object('code', 'INVALID_RANGES', 'status', 422);
  END IF;

  FOR v_range IN SELECT value FROM pg_catalog.jsonb_array_elements(p_ranges)
  LOOP
    IF pg_catalog.jsonb_typeof(v_range) <> 'object'
      OR pg_catalog.jsonb_object_length(v_range) <> 2
      OR NOT (v_range ? 'startTimeLocal' AND v_range ? 'endTimeLocal') THEN
      RETURN pg_catalog.jsonb_build_object('code', 'INVALID_RANGES', 'status', 422);
    END IF;
    v_start := v_range->>'startTimeLocal';
    v_end := v_range->>'endTimeLocal';
    IF v_start !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
      OR v_end !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
      OR v_start >= v_end THEN
      RETURN pg_catalog.jsonb_build_object('code', 'INVALID_RANGES', 'status', 422);
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
      FROM pg_catalog.jsonb_array_elements(p_ranges) WITH ORDINALITY AS left_range(value, ordinal)
      JOIN pg_catalog.jsonb_array_elements(p_ranges) WITH ORDINALITY AS right_range(value, ordinal)
        ON left_range.ordinal < right_range.ordinal
       AND left_range.value->>'startTimeLocal' < right_range.value->>'endTimeLocal'
       AND right_range.value->>'startTimeLocal' < left_range.value->>'endTimeLocal'
  ) THEN
    RETURN pg_catalog.jsonb_build_object('code', 'INVALID_RANGES', 'status', 422);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.guide_profiles WHERE id = p_guide_id) THEN
    RETURN pg_catalog.jsonb_build_object('code', 'GUIDE_NOT_FOUND', 'status', 404);
  END IF;

  INSERT INTO public.midao_idempotency_records (
    actor_type, actor_id, command_name, scope_type, scope_id,
    idempotency_key, request_hash, state, expires_at
  ) VALUES (
    'service_role', p_guide_id::text, 'replace_global_day_availability', 'guide', p_guide_id,
    v_idempotency_key, v_request_hash, 'processing', pg_catalog.statement_timestamp() + INTERVAL '1 day'
  )
  ON CONFLICT (scope_type, scope_id, command_name, idempotency_key) DO NOTHING
  RETURNING id INTO v_idempotency_id;
  v_claimed := FOUND;

  IF NOT v_claimed THEN
    SELECT *
      INTO v_existing_idempotency
      FROM public.midao_idempotency_records
     WHERE scope_type = 'guide'
       AND scope_id = p_guide_id
       AND command_name = 'replace_global_day_availability'
       AND idempotency_key = v_idempotency_key
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MIDAO_IDEMPOTENCY_RELATION_INVALID';
    END IF;
    IF v_existing_idempotency.request_hash IS DISTINCT FROM v_request_hash THEN
      RETURN pg_catalog.jsonb_build_object('code', 'IDEMPOTENCY_KEY_REUSED', 'status', 409);
    END IF;
    IF v_existing_idempotency.state = 'completed'
      AND v_existing_idempotency.response_body IS NOT NULL
      AND v_existing_idempotency.response_body <> 'null'::jsonb THEN
      RETURN v_existing_idempotency.response_body;
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MIDAO_IDEMPOTENCY_RELATION_INVALID';
  END IF;

  INSERT INTO public.guide_availability_day_revisions (
    guide_id, local_date, timezone, revision, is_closed
  ) VALUES (
    p_guide_id, p_local_date, v_timezone, 0, false
  )
  ON CONFLICT (guide_id, local_date) DO NOTHING;

  SELECT *
    INTO v_day
    FROM public.guide_availability_day_revisions
   WHERE guide_id = p_guide_id
     AND local_date = p_local_date
   FOR UPDATE;

  IF v_day.timezone IS DISTINCT FROM v_timezone THEN
    v_response := pg_catalog.jsonb_build_object(
      'code', 'DAY_TIMEZONE_MISMATCH', 'status', 422,
      'localDate', p_local_date, 'timezone', v_day.timezone
    );
  ELSIF v_day.revision IS DISTINCT FROM p_expected_revision THEN
    v_response := pg_catalog.jsonb_build_object(
      'code', 'REVISION_CONFLICT', 'status', 409,
      'currentRevision', v_day.revision, 'localDate', p_local_date, 'timezone', v_day.timezone
    );
  ELSE
    DELETE FROM public.guide_availability_rules
     WHERE guide_id = p_guide_id
       AND scope_type = 'global'
       AND effective_from = p_local_date
       AND effective_to = p_local_date;

    FOR v_range IN SELECT value FROM pg_catalog.jsonb_array_elements(p_ranges)
    LOOP
      INSERT INTO public.guide_availability_rules (
        guide_id, weekday, start_time_local, end_time_local, timezone,
        effective_from, effective_to, is_active
      ) VALUES (
        p_guide_id,
        EXTRACT(dow FROM p_local_date)::integer,
        (v_range->>'startTimeLocal')::time,
        (v_range->>'endTimeLocal')::time,
        v_timezone,
        p_local_date,
        p_local_date,
        true
      );
    END LOOP;

    UPDATE public.guide_availability_day_revisions
       SET revision = revision + 1,
           is_closed = (pg_catalog.jsonb_array_length(p_ranges) = 0),
           updated_at = pg_catalog.now()
     WHERE guide_id = p_guide_id
       AND local_date = p_local_date
     RETURNING revision INTO v_next_revision;

    v_response := pg_catalog.jsonb_build_object(
      'code', 'UPDATED',
      'localDate', p_local_date,
      'timezone', v_timezone,
      'revision', v_next_revision,
      'isClosed', (pg_catalog.jsonb_array_length(p_ranges) = 0),
      'ranges', p_ranges
    );
  END IF;

  UPDATE public.midao_idempotency_records
     SET state = 'completed',
         response_status = (v_response->>'status')::integer,
         response_body = v_response,
         locked_at = pg_catalog.statement_timestamp(),
         completed_at = pg_catalog.statement_timestamp()
   WHERE id = v_idempotency_id
     AND state = 'processing';

  RETURN v_response;
END;
$issue1760_day_cas$;

REVOKE ALL ON FUNCTION public.midao_replace_global_day_availability(
  uuid, date, text, bigint, jsonb, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.midao_replace_global_day_availability(
  uuid, date, text, bigint, jsonb, text, text
) TO service_role;

COMMENT ON TABLE public.guide_availability_day_revisions IS
  'Issue #1760 canonical per-guide local-day replacement revision and closed-day tombstone; not a slot or calendar materialization.';
COMMENT ON FUNCTION public.midao_replace_global_day_availability(
  uuid, date, text, bigint, jsonb, text, text
) IS
  'Issue #1760 service-role-only atomic global day replacement with durable idempotency and revision CAS.';
