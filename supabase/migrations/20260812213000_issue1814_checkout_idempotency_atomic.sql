-- Issue #1814: durable checkout idempotency must share the same transaction as
-- the #1811–#1813 booking, add-on and points aggregate. A separate API claim
-- would leave an ambiguous processing row if the process dies between writes.

CREATE FUNCTION public.fn_create_booking_draft_with_addons_points_idempotent(
  p_traveler_id uuid,
  p_activity_plan_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_timezone text,
  p_participants integer,
  p_source_channel text,
  p_contact_name text,
  p_contact_phone text,
  p_contact_email text,
  p_customer_note text,
  p_conflict_override_id uuid,
  p_conflict_override_snapshot jsonb,
  p_correlation_id text,
  p_payment_deadline_at timestamptz,
  p_addon_selections jsonb,
  p_redeem_points integer,
  p_idempotency_key text,
  p_request_hash text,
  p_idempotency_actor_type text,
  p_idempotency_actor_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $issue1814$
DECLARE
  v_scope_id uuid := '18140000-0000-4000-8000-000000000000'::uuid;
  v_key text;
  v_hash text;
  v_actor_type text;
  v_actor_id text;
  v_idempotency_id uuid;
  v_claimed boolean := false;
  v_record record;
  v_base jsonb;
  v_response jsonb;
  v_booking_type text;
  v_now timestamptz := pg_catalog.statement_timestamp();
BEGIN
  v_key := NULLIF(pg_catalog.btrim(p_idempotency_key), '');
  v_hash := pg_catalog.lower(pg_catalog.btrim(p_request_hash));
  v_actor_type := NULLIF(pg_catalog.btrim(p_idempotency_actor_type), '');
  v_actor_id := NULLIF(pg_catalog.btrim(p_idempotency_actor_id), '');

  IF v_key IS NULL OR pg_catalog.octet_length(v_key) > 128 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'IDEMPOTENCY_CONFLICT';
  END IF;
  IF v_hash IS NULL OR v_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'IDEMPOTENCY_CONFLICT';
  END IF;
  IF v_actor_type NOT IN ('traveler', 'guest') OR v_actor_id IS NULL OR pg_catalog.octet_length(v_actor_id) > 128 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'IDEMPOTENCY_CONFLICT';
  END IF;
  IF v_actor_type = 'traveler' AND (p_traveler_id IS NULL OR v_actor_id IS DISTINCT FROM p_traveler_id::text) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'IDEMPOTENCY_CONFLICT';
  END IF;
  IF v_actor_type = 'guest' AND p_traveler_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'IDEMPOTENCY_CONFLICT';
  END IF;

  INSERT INTO public.midao_idempotency_records (
    actor_type, actor_id, command_name, scope_type, scope_id,
    idempotency_key, request_hash, state, expires_at
  ) VALUES (
    v_actor_type, v_actor_id, 'create_booking_draft', 'checkout', v_scope_id,
    v_key, v_hash, 'processing', v_now + INTERVAL '1 day'
  )
  ON CONFLICT (scope_type, scope_id, command_name, idempotency_key) DO NOTHING
  RETURNING id INTO v_idempotency_id;
  v_claimed := FOUND;

  IF NOT v_claimed THEN
    SELECT id, actor_type, actor_id, request_hash, state, response_body
      INTO v_record
      FROM public.midao_idempotency_records
     WHERE scope_type = 'checkout'
       AND scope_id = v_scope_id
       AND command_name = 'create_booking_draft'
       AND idempotency_key = v_key
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'IDEMPOTENCY_IN_PROGRESS';
    END IF;
    IF v_record.actor_type IS DISTINCT FROM v_actor_type
      OR v_record.actor_id IS DISTINCT FROM v_actor_id
      OR v_record.request_hash IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'IDEMPOTENCY_CONFLICT';
    END IF;
    IF v_record.state = 'processing' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'IDEMPOTENCY_IN_PROGRESS';
    END IF;
    IF v_record.state <> 'completed'
      OR v_record.response_body IS NULL
      OR v_record.response_body = 'null'::jsonb
      OR pg_catalog.jsonb_typeof(v_record.response_body->'booking_id') <> 'string'
      OR pg_catalog.jsonb_typeof(v_record.response_body->'order_id') <> 'string' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'IDEMPOTENCY_IN_PROGRESS';
    END IF;
    RETURN v_record.response_body || pg_catalog.jsonb_build_object('replayed', true);
  END IF;

  -- #1813 already keeps the full booking/order/add-on/ledger aggregate in this
  -- statement transaction. A raised error also removes the processing claim.
  v_base := public.fn_create_booking_draft_with_addons_and_points_atomic(
    p_traveler_id,
    p_activity_plan_id,
    p_start_at,
    p_end_at,
    p_timezone,
    p_participants,
    p_source_channel,
    p_contact_name,
    p_contact_phone,
    p_contact_email,
    p_customer_note,
    p_conflict_override_id,
    p_conflict_override_snapshot,
    p_correlation_id,
    p_payment_deadline_at,
    p_addon_selections,
    p_redeem_points
  );

  IF pg_catalog.jsonb_typeof(v_base->'booking_id') <> 'string'
    OR pg_catalog.jsonb_typeof(v_base->'order_id') <> 'string'
    OR pg_catalog.jsonb_typeof(v_base->'total_twd') <> 'number' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'IDEMPOTENCY_IN_PROGRESS';
  END IF;

  SELECT booking_type INTO v_booking_type
    FROM public.activity_plans
   WHERE id = p_activity_plan_id;
  IF v_booking_type NOT IN ('scheduled', 'request', 'instant') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'IDEMPOTENCY_IN_PROGRESS';
  END IF;

  v_response := pg_catalog.jsonb_build_object(
    'booking_id', v_base->'booking_id',
    'order_id', v_base->'order_id',
    'total_twd', v_base->'total_twd',
    'booking_type', v_booking_type
  );

  UPDATE public.midao_idempotency_records
     SET state = 'completed',
         response_status = 200,
         response_body = v_response,
         resource_type = 'order',
         resource_id = v_base->>'order_id',
         locked_at = v_now,
         completed_at = v_now
   WHERE id = v_idempotency_id
     AND state = 'processing';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'IDEMPOTENCY_IN_PROGRESS';
  END IF;

  RETURN v_response || pg_catalog.jsonb_build_object('replayed', false);
END;
$issue1814$;

REVOKE ALL ON FUNCTION public.fn_create_booking_draft_with_addons_points_idempotent(
  uuid, uuid, timestamptz, timestamptz, text, integer, text, text, text, text, text, uuid, jsonb, text, timestamptz, jsonb, integer, text, text, text, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.fn_create_booking_draft_with_addons_points_idempotent(
  uuid, uuid, timestamptz, timestamptz, text, integer, text, text, text, text, text, uuid, jsonb, text, timestamptz, jsonb, integer, text, text, text, text
) TO service_role;

COMMENT ON FUNCTION public.fn_create_booking_draft_with_addons_points_idempotent(
  uuid, uuid, timestamptz, timestamptz, text, integer, text, text, text, text, text, uuid, jsonb, text, timestamptz, jsonb, integer, text, text, text, text
) IS
  'Issue #1814: service-role-only atomic checkout idempotency claim/replay around #1811–#1813 booking, add-on and points materialization.';
