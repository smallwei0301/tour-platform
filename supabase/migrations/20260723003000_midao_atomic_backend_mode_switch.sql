CREATE OR REPLACE FUNCTION public.midao_switch_guide_backend_mode(
  p_guide_id UUID,
  p_target_mode TEXT,
  p_reason TEXT,
  p_actor_type TEXT,
  p_actor_id TEXT,
  p_request_id UUID,
  p_idempotency_key TEXT,
  p_request_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_scope_type CONSTANT TEXT := 'guide';
  v_scope_id UUID := p_guide_id;
  v_command_name CONSTANT TEXT := 'switch_backend_mode';
  v_claimed_id UUID;
  v_idempotency public.midao_idempotency_records%ROWTYPE;
  v_guide RECORD;
  v_previous_mode TEXT;
  v_response JSONB;
BEGIN
  IF p_guide_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'GUIDE_ID_REQUIRED';
  END IF;
  IF p_target_mode IS NULL OR p_target_mode NOT IN ('legacy', 'midao') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_BACKEND_MODE';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' OR length(btrim(p_reason)) > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_REASON';
  END IF;
  IF p_actor_type IS NULL OR p_actor_type NOT IN ('admin', 'system') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_ACTOR_TYPE';
  END IF;
  IF p_actor_id IS NULL OR btrim(p_actor_id) = '' OR p_actor_id <> lower(btrim(p_actor_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_ACTOR_ID';
  END IF;
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REQUEST_ID_REQUIRED';
  END IF;
  IF p_idempotency_key IS NULL
    OR p_idempotency_key <> btrim(p_idempotency_key)
    OR octet_length(p_idempotency_key) NOT BETWEEN 1 AND 128
    OR p_idempotency_key !~ '^[ -~]+$'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_IDEMPOTENCY_KEY';
  END IF;
  IF p_request_hash IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$' THEN
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
    p_actor_type,
    p_actor_id,
    v_command_name,
    v_scope_type,
    v_scope_id,
    p_idempotency_key,
    p_request_hash,
    'processing',
    pg_catalog.now() + interval '24 hours'
  )
  ON CONFLICT (scope_type, scope_id, command_name, idempotency_key) DO NOTHING
  RETURNING id INTO v_claimed_id;

  SELECT *
    INTO v_idempotency
    FROM public.midao_idempotency_records
   WHERE scope_type = v_scope_type
     AND scope_id = v_scope_id
     AND command_name = v_command_name
     AND idempotency_key = p_idempotency_key
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'IDEMPOTENCY_CLAIM_FAILED';
  END IF;
  IF v_idempotency.request_hash <> p_request_hash THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'IDEMPOTENCY_KEY_REUSED';
  END IF;
  IF v_idempotency.state = 'completed' THEN
    RETURN v_idempotency.response_body;
  END IF;
  IF v_claimed_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'IDEMPOTENCY_IN_PROGRESS';
  END IF;

  SELECT id, backend_mode, guide_session_version, verification_status
    INTO v_guide
    FROM public.guide_profiles
   WHERE id = p_guide_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'GUIDE_NOT_FOUND';
  END IF;
  IF v_guide.verification_status <> 'approved' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'GUIDE_NOT_ACTIVE';
  END IF;

  IF v_guide.backend_mode = p_target_mode THEN
    v_response := pg_catalog.jsonb_build_object(
      'backendMode', v_guide.backend_mode,
      'sessionVersion', coalesce(v_guide.guide_session_version, 1),
      'changed', false,
      'redirectTo', CASE WHEN p_target_mode = 'midao' THEN '/midao' ELSE '/guide/dashboard' END
    );

    UPDATE public.midao_idempotency_records
       SET state = 'completed',
           response_status = 200,
           response_body = v_response,
           resource_type = 'guide_backend_mode',
           resource_id = p_guide_id::TEXT,
           completed_at = pg_catalog.now(),
           locked_at = pg_catalog.now()
     WHERE id = v_idempotency.id;

    RETURN v_response;
  END IF;

  v_previous_mode := v_guide.backend_mode;
  UPDATE public.guide_profiles
     SET backend_mode = p_target_mode,
         guide_session_version = coalesce(guide_session_version, 1) + 1
   WHERE id = p_guide_id
   RETURNING id, backend_mode, guide_session_version, verification_status INTO v_guide;

  v_response := pg_catalog.jsonb_build_object(
    'backendMode', v_guide.backend_mode,
    'sessionVersion', v_guide.guide_session_version,
    'changed', true,
    'redirectTo', CASE WHEN p_target_mode = 'midao' THEN '/midao' ELSE '/guide/dashboard' END
  );

  INSERT INTO public.midao_audit_events (
    actor_type,
    actor_id,
    guide_id,
    action,
    resource_type,
    resource_id,
    request_id,
    reason,
    metadata
  ) VALUES (
    p_actor_type,
    p_actor_id,
    p_guide_id,
    'guide_backend_mode_changed',
    'guide_backend_mode',
    p_guide_id::TEXT,
    p_request_id,
    btrim(p_reason),
    pg_catalog.jsonb_build_object(
      'previousMode', v_previous_mode,
      'backendMode', v_guide.backend_mode,
      'sessionVersion', v_guide.guide_session_version
    )
  );

  INSERT INTO public.midao_notification_outbox (
    event_name,
    aggregate_type,
    aggregate_id,
    payload
  ) VALUES (
    'guide.backend_mode_changed',
    'guide',
    p_guide_id::TEXT,
    pg_catalog.jsonb_build_object(
      'guideId', p_guide_id,
      'backendMode', v_guide.backend_mode,
      'sessionVersion', v_guide.guide_session_version,
      'requestId', p_request_id
    )
  );

  UPDATE public.midao_idempotency_records
     SET state = 'completed',
         response_status = 200,
         response_body = v_response,
         resource_type = 'guide_backend_mode',
         resource_id = p_guide_id::TEXT,
         completed_at = pg_catalog.now(),
         locked_at = pg_catalog.now()
   WHERE id = v_idempotency.id;

  RETURN v_response;
END
$function$;

REVOKE ALL ON FUNCTION public.midao_switch_guide_backend_mode(UUID,TEXT,TEXT,TEXT,TEXT,UUID,TEXT,TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.midao_switch_guide_backend_mode(UUID,TEXT,TEXT,TEXT,TEXT,UUID,TEXT,TEXT)
  TO service_role;
