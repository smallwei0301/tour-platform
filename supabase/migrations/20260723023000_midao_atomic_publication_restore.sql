-- #1758 S10a · Task 31 — atomic admin publication restore command.
--
-- A restore never rewrites or deletes publication history. It locks the activity,
-- reads one immutable source snapshot, re-materializes canonical activity/plans/
-- questions, appends the next immutable version, and completes the idempotency
-- record in the same statement transaction.

CREATE OR REPLACE FUNCTION public.midao_restore_service_publication(
  p_activity_id uuid,
  p_source_version integer,
  p_actor_type text,
  p_actor_id text,
  p_idempotency_key text,
  p_request_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $midao$
DECLARE
  v_now timestamptz;
  v_actor_type text;
  v_actor_id text;
  v_idempotency_key text;
  v_request_hash text;
  v_claimed_id uuid;
  v_idempotency public.midao_idempotency_records%ROWTYPE;
  v_activity public.activities%ROWTYPE;
  v_source public.service_publication_versions%ROWTYPE;
  v_payload jsonb;
  v_name text;
  v_description text;
  v_previous_version integer;
  v_next_version integer;
  v_snapshot jsonb;
  v_response jsonb;
BEGIN
  IF p_activity_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_ACTIVITY_ID';
  END IF;
  IF p_source_version IS NULL OR p_source_version < 1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_SOURCE_VERSION';
  END IF;

  v_actor_type := pg_catalog.lower(pg_catalog.btrim(p_actor_type));
  v_actor_id := pg_catalog.lower(pg_catalog.btrim(p_actor_id));
  IF v_actor_type IS NULL OR v_actor_type <> 'admin' THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'ADMIN_AUTHORIZATION_REQUIRED';
  END IF;
  IF v_actor_id IS NULL OR v_actor_id = '' OR pg_catalog.octet_length(v_actor_id) > 128 THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'ADMIN_AUTHORIZATION_REQUIRED';
  END IF;

  v_idempotency_key := NULLIF(pg_catalog.btrim(p_idempotency_key), '');
  IF v_idempotency_key IS NULL
    OR pg_catalog.octet_length(v_idempotency_key) > 128
    OR v_idempotency_key !~ '^[ -~]+$'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_IDEMPOTENCY_KEY';
  END IF;

  v_request_hash := pg_catalog.lower(pg_catalog.btrim(p_request_hash));
  IF v_request_hash IS NULL OR v_request_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_REQUEST_HASH';
  END IF;

  INSERT INTO public.midao_idempotency_records (
    actor_type,
    actor_id,
    command_name,
    scope_type,
    scope_id,
    idempotency_key,
    request_hash,
    state,
    expires_at
  ) VALUES (
    v_actor_type,
    v_actor_id,
    'restore_service_publication',
    'activity',
    p_activity_id,
    v_idempotency_key,
    v_request_hash,
    'processing',
    pg_catalog.now() + INTERVAL '1 day'
  )
  ON CONFLICT (scope_type, scope_id, command_name, idempotency_key) DO NOTHING
  RETURNING id INTO v_claimed_id;

  SELECT *
    INTO v_idempotency
    FROM public.midao_idempotency_records
   WHERE scope_type = 'activity'
     AND scope_id = p_activity_id
     AND command_name = 'restore_service_publication'
     AND idempotency_key = v_idempotency_key
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MIDAO_IDEMPOTENCY_RELATION_INVALID';
  END IF;
  IF v_idempotency.request_hash <> v_request_hash THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'IDEMPOTENCY_CONFLICT';
  END IF;
  IF v_idempotency.state = 'completed' THEN
    IF v_idempotency.response_body IS NULL OR v_idempotency.response_body = 'null'::jsonb THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MIDAO_IDEMPOTENCY_RELATION_INVALID';
    END IF;
    RETURN v_idempotency.response_body;
  END IF;
  IF v_claimed_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'IDEMPOTENCY_IN_PROGRESS';
  END IF;

  SELECT *
    INTO v_activity
    FROM public.activities
   WHERE id = p_activity_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'ACTIVITY_NOT_FOUND';
  END IF;

  SELECT *
    INTO v_source
    FROM public.service_publication_versions
   WHERE activity_id = p_activity_id
     AND version = p_source_version
   FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'SOURCE_VERSION_NOT_FOUND';
  END IF;

  v_payload := v_source.snapshot -> 'payload';
  IF pg_catalog.jsonb_typeof(v_source.snapshot) IS DISTINCT FROM 'object'
    OR pg_catalog.jsonb_typeof(v_payload) IS DISTINCT FROM 'object'
    OR (
      v_payload ? 'plans'
      AND pg_catalog.jsonb_typeof(v_payload -> 'plans') IS DISTINCT FROM 'array'
    )
    OR (
      v_payload ? 'questions'
      AND pg_catalog.jsonb_typeof(v_payload -> 'questions') IS DISTINCT FROM 'array'
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'SOURCE_SNAPSHOT_INVALID';
  END IF;

  v_now := pg_catalog.now();
  v_name := pg_catalog.nullif(pg_catalog.btrim(v_payload ->> 'name'), '');
  v_description := pg_catalog.nullif(pg_catalog.btrim(v_payload ->> 'description'), '');
  IF v_description IS NULL THEN
    SELECT pg_catalog.string_agg(pg_catalog.btrim(elem), E'\n\n')
      INTO v_description
      FROM pg_catalog.jsonb_array_elements_text(COALESCE(v_payload -> 'descriptions', '[]'::jsonb)) AS elem
     WHERE pg_catalog.btrim(elem) <> '';
  END IF;

  UPDATE public.activities
     SET title = COALESCE(v_name, title),
         description = COALESCE(v_description, description),
         inquiry_enabled = COALESCE((v_payload ->> 'inquiry_enabled')::boolean, inquiry_enabled),
         status = 'published',
         published_at = COALESCE(published_at, v_now),
         updated_at = v_now
   WHERE id = p_activity_id;

  UPDATE public.activity_plans
     SET status = 'inactive',
         updated_at = v_now
   WHERE activity_id = p_activity_id;

  INSERT INTO public.activity_plans (
    activity_id,
    name,
    slug,
    duration_minutes,
    price_type,
    base_price,
    min_participants,
    max_participants,
    booking_type,
    status,
    updated_at
  )
  SELECT
    p_activity_id,
    COALESCE(pg_catalog.nullif(pg_catalog.btrim(plan.elem ->> 'name'), ''), 'Plan ' || plan.ord::text),
    COALESCE(
      pg_catalog.nullif(pg_catalog.btrim(plan.elem ->> 'slug'), ''),
      'plan-' || pg_catalog.md5(COALESCE(plan.elem ->> 'name', '') || '-' || plan.ord::text)
    ),
    COALESCE((plan.elem ->> 'duration_minutes')::integer, 60),
    COALESCE(pg_catalog.nullif(pg_catalog.btrim(plan.elem ->> 'price_type'), ''), 'per_person'),
    COALESCE((plan.elem ->> 'base_price')::integer, 0),
    COALESCE((plan.elem ->> 'min_participants')::integer, 1),
    COALESCE((plan.elem ->> 'max_participants')::integer, 10),
    COALESCE(pg_catalog.nullif(pg_catalog.btrim(plan.elem ->> 'booking_type'), ''), 'instant'),
    'active',
    v_now
  FROM pg_catalog.jsonb_array_elements(COALESCE(v_payload -> 'plans', '[]'::jsonb))
    WITH ORDINALITY AS plan(elem, ord)
  ON CONFLICT (activity_id, slug) DO UPDATE
    SET name = EXCLUDED.name,
        duration_minutes = EXCLUDED.duration_minutes,
        price_type = EXCLUDED.price_type,
        base_price = EXCLUDED.base_price,
        min_participants = EXCLUDED.min_participants,
        max_participants = EXCLUDED.max_participants,
        booking_type = EXCLUDED.booking_type,
        status = 'active',
        updated_at = EXCLUDED.updated_at;

  DELETE FROM public.activity_intake_questions
   WHERE activity_id = p_activity_id;

  INSERT INTO public.activity_intake_questions (
    activity_id,
    question_key,
    label,
    type,
    options,
    required,
    sort_order
  )
  SELECT
    p_activity_id,
    question.elem ->> 'question_key',
    COALESCE(
      pg_catalog.nullif(pg_catalog.btrim(question.elem ->> 'label'), ''),
      question.elem ->> 'question_key'
    ),
    question.elem ->> 'type',
    COALESCE(question.elem -> 'options', '[]'::jsonb),
    COALESCE((question.elem ->> 'required')::boolean, false),
    COALESCE((question.elem ->> 'sort_order')::integer, (question.ord - 1)::integer)
  FROM pg_catalog.jsonb_array_elements(COALESCE(v_payload -> 'questions', '[]'::jsonb))
    WITH ORDINALITY AS question(elem, ord);

  SELECT COALESCE(max(version), 0)
    INTO v_previous_version
    FROM public.service_publication_versions
   WHERE activity_id = p_activity_id;
  v_next_version := v_previous_version + 1;

  v_snapshot := pg_catalog.jsonb_build_object(
    'activityId', p_activity_id,
    'version', v_next_version,
    'guideId', v_source.snapshot -> 'guideId',
    'draftRevision', v_source.snapshot -> 'draftRevision',
    'publishedAt', v_now,
    'payload', v_payload,
    'sourceVersion', p_source_version,
    'restoredBy', v_actor_id
  );

  INSERT INTO public.service_publication_versions (
    activity_id,
    version,
    snapshot,
    published_by,
    published_at
  ) VALUES (
    p_activity_id,
    v_next_version,
    v_snapshot,
    v_source.published_by,
    v_now
  );

  v_response := pg_catalog.jsonb_build_object(
    'restored', true,
    'code', 'RESTORED',
    'activityId', p_activity_id,
    'sourceVersion', p_source_version,
    'version', v_next_version,
    'status', 'published'
  );

  UPDATE public.midao_idempotency_records
     SET state = 'completed',
         response_status = 200,
         response_body = v_response,
         resource_type = 'service_publication',
         resource_id = p_activity_id::text,
         locked_at = v_now,
         completed_at = v_now
   WHERE id = v_idempotency.id
     AND state = 'processing';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MIDAO_IDEMPOTENCY_RELATION_INVALID';
  END IF;

  RETURN v_response;
END;
$midao$;

REVOKE ALL ON FUNCTION public.midao_restore_service_publication(uuid, integer, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.midao_restore_service_publication(uuid, integer, text, text, text, text)
  TO service_role;
