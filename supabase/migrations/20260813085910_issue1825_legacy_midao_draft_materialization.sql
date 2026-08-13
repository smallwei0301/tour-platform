-- #1825 S1 — controlled legacy activity draft materialization.
-- Forward-only: it never writes public.activities or legacy plans/images. Materialized
-- drafts remain editable working copies, but cannot enter the legacy plan lifecycle.

ALTER TABLE public.guide_service_drafts
  ADD COLUMN IF NOT EXISTS materialization_origin TEXT NOT NULL DEFAULT 'native',
  ADD COLUMN IF NOT EXISTS materialization_review_state TEXT,
  ADD COLUMN IF NOT EXISTS materialized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS materialized_revision INTEGER;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
     WHERE conname = 'midao_guide_service_drafts_materialization_origin_check'
       AND conrelid = 'public.guide_service_drafts'::regclass
  ) THEN
    ALTER TABLE public.guide_service_drafts
      ADD CONSTRAINT midao_guide_service_drafts_materialization_origin_check
      CHECK (materialization_origin IN ('native', 'legacy_activity'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
     WHERE conname = 'midao_guide_service_drafts_materialization_review_state_check'
       AND conrelid = 'public.guide_service_drafts'::regclass
  ) THEN
    ALTER TABLE public.guide_service_drafts
      ADD CONSTRAINT midao_guide_service_drafts_materialization_review_state_check
      CHECK (materialization_review_state IS NULL OR materialization_review_state = 'needs_review');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
     WHERE conname = 'midao_guide_service_drafts_materialized_revision_check'
       AND conrelid = 'public.guide_service_drafts'::regclass
  ) THEN
    ALTER TABLE public.guide_service_drafts
      ADD CONSTRAINT midao_guide_service_drafts_materialized_revision_check
      CHECK (materialized_revision IS NULL OR materialized_revision > 0);
  END IF;
END
$constraints$;

CREATE OR REPLACE FUNCTION public.midao_materialize_legacy_service_draft(
  p_activity_id uuid,
  p_guide_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $materialize$
DECLARE
  v_now timestamptz := pg_catalog.now();
  v_activity public.activities%ROWTYPE;
  v_draft public.guide_service_drafts%ROWTYPE;
  v_pending jsonb;
  v_payload jsonb;
  v_name text;
  v_description text;
  v_review_state text;
  v_inserted_draft_id uuid;
BEGIN
  IF p_activity_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_ACTIVITY_ID';
  END IF;
  IF p_guide_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_GUIDE_ID';
  END IF;

  SELECT *
    INTO v_activity
    FROM public.activities
   WHERE id = p_activity_id
   FOR UPDATE;

  IF NOT FOUND OR v_activity.guide_id IS DISTINCT FROM p_guide_id THEN
    RETURN pg_catalog.jsonb_build_object(
      'code', 'ACTIVITY_NOT_FOUND_OR_OWNERSHIP_MISMATCH',
      'status', 404,
      'activityId', p_activity_id
    );
  END IF;

  SELECT *
    INTO v_draft
    FROM public.guide_service_drafts
   WHERE activity_id = p_activity_id
     AND status = 'active'
   FOR UPDATE;

  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'code', 'REUSED',
      'activityId', p_activity_id,
      'draftId', v_draft.id,
      'revision', v_draft.revision
    );
  END IF;

  v_name := pg_catalog.btrim(v_activity.title);
  v_description := COALESCE(v_activity.description, '');
  v_pending := v_activity.pending_changes;
  v_review_state := NULL;

  IF v_pending IS NOT NULL THEN
    IF jsonb_typeof(v_pending) <> 'object'
      OR EXISTS (
        SELECT 1
          FROM pg_catalog.jsonb_object_keys(v_pending) AS pending_key(key)
         WHERE pending_key.key NOT IN ('title', 'description')
      )
      OR (
        v_pending ? 'title'
        AND (jsonb_typeof(v_pending->'title') <> 'string' OR pg_catalog.btrim(v_pending->>'title') = '')
      )
      OR (
        v_pending ? 'description'
        AND jsonb_typeof(v_pending->'description') NOT IN ('string', 'null')
      )
    THEN
      v_review_state := 'needs_review';
    ELSE
      IF v_pending ? 'title' THEN
        v_name := pg_catalog.btrim(v_pending->>'title');
      END IF;
      IF v_pending ? 'description' THEN
        v_description := COALESCE(v_pending->>'description', '');
      END IF;
    END IF;
  END IF;

  v_payload := pg_catalog.jsonb_build_object(
    'name', v_name,
    'description', v_description,
    'descriptions', '[]'::jsonb,
    'plans', '[]'::jsonb,
    'questions', '[]'::jsonb
  );

  INSERT INTO public.guide_service_drafts (
    activity_id,
    guide_id,
    revision,
    status,
    payload,
    materialization_origin,
    materialization_review_state,
    materialized_at,
    materialized_revision
  ) VALUES (
    p_activity_id,
    p_guide_id,
    1,
    'active',
    v_payload,
    'legacy_activity',
    v_review_state,
    v_now,
    1
  )
  ON CONFLICT (activity_id) WHERE status = 'active' DO NOTHING
  RETURNING id INTO v_inserted_draft_id;

  SELECT *
    INTO v_draft
    FROM public.guide_service_drafts
   WHERE activity_id = p_activity_id
     AND status = 'active'
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MIDAO_MATERIALIZED_DRAFT_NOT_FOUND';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'code', CASE WHEN v_inserted_draft_id IS NULL THEN 'REUSED' ELSE 'CREATED' END,
    'activityId', p_activity_id,
    'draftId', v_draft.id,
    'revision', v_draft.revision
  );
END;
$materialize$;

CREATE OR REPLACE FUNCTION public.midao_publish_service_draft(
  p_activity_id uuid,
  p_expected_revision integer,
  p_guide_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $publish$
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
$publish$;

REVOKE ALL ON FUNCTION public.midao_materialize_legacy_service_draft(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.midao_materialize_legacy_service_draft(uuid, uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.midao_publish_service_draft(uuid, integer, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.midao_publish_service_draft(uuid, integer, uuid)
  TO service_role;
