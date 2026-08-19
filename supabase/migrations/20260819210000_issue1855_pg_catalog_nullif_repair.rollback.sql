-- Issue #1855 ROLLBACK: restore the pre-repair function definitions
--
-- WARNING (警語):
-- Running this file restores F1/F2/F3 to the broken, wrongly schema-qualified
-- NULLIF variant, i.e. it returns these paths to a 100% failure state:
--   F1 guide publishes a native service draft
--   F2 service publication restore / rollback
--   F3 global single-day availability replace (#1760)
-- This is an emergency comparison option only, not the expected normal path.
-- Prefer roll-forward; PITR is the final safety net.
--
-- Function bodies are copied verbatim from the pre-repair production
-- pg_get_functiondef(oid) output, with no replacement applied.

-- F1 public.midao_publish_service_draft(uuid, integer, uuid) -- 7 processed
CREATE OR REPLACE FUNCTION public.midao_publish_service_draft(p_activity_id uuid, p_expected_revision integer, p_guide_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_now timestamptz := pg_catalog.now();
  v_activity public.activities%ROWTYPE;
  v_draft public.guide_service_drafts%ROWTYPE;
  v_payload jsonb;
  v_name text;
  v_description text;
  v_prev_version integer;
  v_next_version integer;
  v_snapshot jsonb;
  v_response jsonb;
BEGIN
  IF p_activity_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_ACTIVITY_ID';
  END IF;
  IF p_guide_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_GUIDE_ID';
  END IF;
  IF p_expected_revision IS NULL OR p_expected_revision < 1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_EXPECTED_REVISION';
  END IF;

  SELECT *
    INTO v_activity
    FROM public.activities
   WHERE id = p_activity_id
   FOR UPDATE;

  IF NOT FOUND OR v_activity.guide_id IS DISTINCT FROM p_guide_id THEN
    RETURN pg_catalog.jsonb_build_object(
      'published', false,
      'idempotent', false,
      'code', 'ACTIVITY_NOT_FOUND_OR_OWNERSHIP_MISMATCH',
      'activityId', p_activity_id,
      'status', 404
    );
  END IF;

  SELECT *
    INTO v_draft
    FROM public.guide_service_drafts
   WHERE activity_id = p_activity_id AND status = 'active'
   FOR UPDATE;

  IF NOT FOUND THEN
    SELECT COALESCE(max(version), 0)
      INTO v_prev_version
      FROM public.service_publication_versions
     WHERE activity_id = p_activity_id;

    IF v_prev_version >= 1 THEN
      RETURN pg_catalog.jsonb_build_object(
        'published', true,
        'idempotent', true,
        'code', 'IDEMPOTENT_NO_OP',
        'activityId', p_activity_id,
        'version', v_prev_version
      );
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'published', false,
      'idempotent', false,
      'code', 'DRAFT_NOT_FOUND',
      'activityId', p_activity_id
    );
  END IF;

  IF v_draft.guide_id IS DISTINCT FROM p_guide_id THEN
    RETURN pg_catalog.jsonb_build_object(
      'published', false,
      'idempotent', false,
      'code', 'OWNERSHIP_MISMATCH',
      'activityId', p_activity_id
    );
  END IF;

  IF v_draft.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN pg_catalog.jsonb_build_object(
      'published', false,
      'idempotent', false,
      'code', 'REVISION_CONFLICT',
      'activityId', p_activity_id,
      'currentRevision', v_draft.revision
    );
  END IF;

  IF v_draft.materialization_origin = 'legacy_activity' THEN
    RETURN pg_catalog.jsonb_build_object(
      'published', false,
      'idempotent', false,
      'code', 'LEGACY_PLAN_LIFECYCLE_UNRESOLVED',
      'activityId', p_activity_id,
      'status', 409
    );
  END IF;

  v_payload := COALESCE(v_draft.payload, '{}'::jsonb);
  v_name := pg_catalog.nullif(pg_catalog.btrim(v_payload->>'name'), '');
  v_description := pg_catalog.nullif(pg_catalog.btrim(v_payload->>'description'), '');
  IF v_description IS NULL THEN
    SELECT pg_catalog.string_agg(pg_catalog.btrim(elem), E'\n\n')
      INTO v_description
      FROM pg_catalog.jsonb_array_elements_text(COALESCE(v_payload->'descriptions', '[]'::jsonb)) AS elem
     WHERE pg_catalog.btrim(elem) <> '';
  END IF;

  UPDATE public.activities
     SET title = COALESCE(v_name, title),
         description = COALESCE(v_description, description),
         inquiry_enabled = COALESCE((v_payload->>'inquiry_enabled')::boolean, inquiry_enabled),
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
    COALESCE(pg_catalog.nullif(pg_catalog.btrim(plan.elem->>'name'), ''), 'Plan ' || plan.ord::text),
    COALESCE(
      pg_catalog.nullif(pg_catalog.btrim(plan.elem->>'slug'), ''),
      'plan-' || pg_catalog.md5(COALESCE(plan.elem->>'name', '') || '-' || plan.ord::text)
    ),
    COALESCE((plan.elem->>'duration_minutes')::integer, 60),
    COALESCE(pg_catalog.nullif(pg_catalog.btrim(plan.elem->>'price_type'), ''), 'per_person'),
    COALESCE((plan.elem->>'base_price')::integer, 0),
    COALESCE((plan.elem->>'min_participants')::integer, 1),
    COALESCE((plan.elem->>'max_participants')::integer, 10),
    COALESCE(pg_catalog.nullif(pg_catalog.btrim(plan.elem->>'booking_type'), ''), 'instant'),
    'active',
    v_now
  FROM pg_catalog.jsonb_array_elements(COALESCE(v_payload->'plans', '[]'::jsonb))
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
    q.elem->>'question_key',
    COALESCE(pg_catalog.nullif(pg_catalog.btrim(q.elem->>'label'), ''), q.elem->>'question_key'),
    q.elem->>'type',
    COALESCE(q.elem->'options', '[]'::jsonb),
    COALESCE((q.elem->>'required')::boolean, false),
    COALESCE((q.elem->>'sort_order')::integer, (q.ord - 1)::integer)
  FROM pg_catalog.jsonb_array_elements(COALESCE(v_payload->'questions', '[]'::jsonb))
    WITH ORDINALITY AS q(elem, ord);

  SELECT COALESCE(max(version), 0)
    INTO v_prev_version
    FROM public.service_publication_versions
   WHERE activity_id = p_activity_id;
  v_next_version := v_prev_version + 1;

  v_snapshot := pg_catalog.jsonb_build_object(
    'activityId', p_activity_id,
    'version', v_next_version,
    'guideId', p_guide_id,
    'draftRevision', v_draft.revision,
    'publishedAt', v_now,
    'payload', v_payload
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
    p_guide_id,
    v_now
  );

  DELETE FROM public.guide_service_drafts
   WHERE id = v_draft.id AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MIDAO_SERVICE_DRAFT_RELATION_INVALID';
  END IF;

  INSERT INTO public.midao_notification_outbox (
    event_name,
    aggregate_type,
    aggregate_id,
    payload
  ) VALUES (
    'service.published',
    'activity',
    p_activity_id::text,
    pg_catalog.jsonb_build_object(
      'activityId', p_activity_id,
      'guideId', p_guide_id,
      'version', v_next_version,
      'draftRevision', v_draft.revision,
      'publishedAt', v_now
    )
  );

  v_response := pg_catalog.jsonb_build_object(
    'published', true,
    'idempotent', false,
    'code', 'PUBLISHED',
    'activityId', p_activity_id,
    'version', v_next_version,
    'draftRevision', v_draft.revision,
    'status', 'published'
  );

  RETURN v_response;
END;
$function$;

-- F2 public.midao_restore_service_publication(uuid, integer, text, text, text, text) -- 7 processed
CREATE OR REPLACE FUNCTION public.midao_restore_service_publication(p_activity_id uuid, p_source_version integer, p_actor_type text, p_actor_id text, p_idempotency_key text, p_request_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$;

-- F3 public.midao_replace_global_day_availability(uuid, date, text, bigint, jsonb, text, text) -- 3 processed
CREATE OR REPLACE FUNCTION public.midao_replace_global_day_availability(p_guide_id uuid, p_local_date date, p_timezone text, p_expected_revision bigint, p_ranges jsonb, p_idempotency_key text, p_request_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
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
$function$;
