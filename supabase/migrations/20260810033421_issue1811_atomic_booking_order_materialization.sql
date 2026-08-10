-- Issue #1811: atomically materialize the base payable booking/order aggregate.
--
-- The public draft route performs availability and authentication checks before
-- this command. The command nevertheless re-reads the active plan and derives
-- every pricing/ownership field from database truth. It deliberately accepts no
-- client total. Add-ons, points and idempotency remain #1812-#1814 follow-ups.

CREATE OR REPLACE FUNCTION public.fn_create_booking_draft_atomic(
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
  p_payment_deadline_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $issue1811$
DECLARE
  v_activity_id uuid;
  v_guide_id uuid;
  v_activity_title text;
  v_plan_name text;
  v_price_type text;
  v_base_price integer;
  v_min_participants integer;
  v_max_participants integer;
  v_booking_type text;
  v_total_bigint bigint;
  v_total_twd integer;
  v_quantity integer;
  v_order_id uuid;
  v_booking_id uuid;
  v_booking_no text;
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_timezone text := pg_catalog.btrim(p_timezone);
  v_source_channel text := pg_catalog.btrim(p_source_channel);
  v_contact_name text := pg_catalog.btrim(p_contact_name);
  v_contact_phone text := pg_catalog.btrim(p_contact_phone);
  v_contact_email text := pg_catalog.lower(pg_catalog.btrim(p_contact_email));
  v_customer_note text := NULLIF(pg_catalog.btrim(p_customer_note), '');
  v_correlation_id text := pg_catalog.btrim(p_correlation_id);
BEGIN
  IF p_activity_plan_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_PLAN_ID';
  END IF;
  IF p_start_at IS NULL OR p_end_at IS NULL OR p_end_at <= p_start_at THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_BOOKING_WINDOW';
  END IF;
  IF v_timezone IS NULL OR v_timezone = '' OR pg_catalog.octet_length(v_timezone) > 128 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_TIMEZONE';
  END IF;
  IF p_participants IS NULL OR p_participants < 1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_PARTICIPANTS';
  END IF;
  IF v_source_channel IS NULL OR v_source_channel NOT IN ('web', 'line', 'admin_pos') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_SOURCE_CHANNEL';
  END IF;
  IF v_contact_name IS NULL OR v_contact_name = '' OR pg_catalog.octet_length(v_contact_name) > 512 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_CONTACT_NAME';
  END IF;
  IF v_contact_phone IS NULL OR v_contact_phone = '' OR pg_catalog.octet_length(v_contact_phone) > 128 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_CONTACT_PHONE';
  END IF;
  IF v_contact_email IS NULL OR v_contact_email = '' OR pg_catalog.octet_length(v_contact_email) > 512 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_CONTACT_EMAIL';
  END IF;
  IF v_customer_note IS NOT NULL AND pg_catalog.octet_length(v_customer_note) > 16000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_CUSTOMER_NOTE';
  END IF;
  IF v_correlation_id IS NULL OR v_correlation_id = '' OR pg_catalog.octet_length(v_correlation_id) > 512 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_CORRELATION_ID';
  END IF;

  SELECT plan.activity_id,
         activity.guide_id,
         activity.title,
         plan.name,
         plan.price_type,
         plan.base_price,
         plan.min_participants,
         plan.max_participants,
         plan.booking_type
    INTO v_activity_id,
         v_guide_id,
         v_activity_title,
         v_plan_name,
         v_price_type,
         v_base_price,
         v_min_participants,
         v_max_participants,
         v_booking_type
    FROM public.activity_plans AS plan
    JOIN public.activities AS activity
      ON activity.id = plan.activity_id
   WHERE plan.id = p_activity_plan_id
     AND plan.status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'PLAN_NOT_FOUND_OR_INACTIVE';
  END IF;
  IF v_guide_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLAN_GUIDE_REQUIRED';
  END IF;
  IF p_participants < v_min_participants OR p_participants > v_max_participants THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PARTICIPANTS_OUT_OF_PLAN_RANGE';
  END IF;

  IF v_booking_type = 'request' THEN
    IF p_payment_deadline_at IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REQUEST_PAYMENT_DEADLINE_MUST_BE_NULL';
    END IF;
  ELSIF p_payment_deadline_at IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PAYMENT_DEADLINE_REQUIRED';
  END IF;

  IF v_price_type = 'per_person' THEN
    v_quantity := p_participants;
    v_total_bigint := v_base_price::bigint * p_participants::bigint;
  ELSIF v_price_type = 'per_group' THEN
    v_quantity := 1;
    v_total_bigint := v_base_price::bigint;
  ELSE
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'UNSUPPORTED_PLAN_PRICE_TYPE';
  END IF;
  IF v_total_bigint < 0 OR v_total_bigint > 2147483647 THEN
    RAISE EXCEPTION USING ERRCODE = '22003', MESSAGE = 'ORDER_TOTAL_OUT_OF_RANGE';
  END IF;
  v_total_twd := v_total_bigint::integer;

  -- Canonical lock/write order: orders first, then bookings, then the reciprocal
  -- order link. Every row below belongs to this one statement transaction.
  INSERT INTO public.orders (
    booking_id,
    activity_id,
    schedule_id,
    user_id,
    people_count,
    contact_name,
    contact_phone,
    contact_email,
    status,
    payment_status,
    total_twd,
    source_channel,
    discount_amount,
    payment_deadline_at,
    created_at,
    updated_at
  ) VALUES (
    NULL,
    v_activity_id,
    NULL,
    p_traveler_id,
    p_participants,
    v_contact_name,
    v_contact_phone,
    v_contact_email,
    'pending_payment',
    'pending',
    v_total_twd,
    v_source_channel,
    0,
    p_payment_deadline_at,
    v_now,
    v_now
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.bookings (
    traveler_id,
    guide_id,
    activity_id,
    activity_plan_id,
    source_channel,
    start_at,
    end_at,
    timezone,
    participants,
    status,
    order_id,
    customer_note,
    conflict_override_id,
    conflict_override_snapshot,
    guide_approval_status,
    created_at,
    updated_at
  ) VALUES (
    p_traveler_id,
    v_guide_id,
    v_activity_id,
    p_activity_plan_id,
    v_source_channel,
    p_start_at,
    p_end_at,
    v_timezone,
    p_participants,
    'draft',
    v_order_id,
    v_customer_note,
    p_conflict_override_id,
    p_conflict_override_snapshot,
    CASE WHEN v_booking_type = 'request' THEN 'pending' ELSE 'not_required' END,
    v_now,
    v_now
  )
  RETURNING id, booking_no INTO v_booking_id, v_booking_no;

  UPDATE public.orders
     SET booking_id = v_booking_id,
         updated_at = v_now
   WHERE id = v_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ORDER_LINK_UPDATE_FAILED';
  END IF;

  INSERT INTO public.order_items (
    order_id,
    item_type,
    ref_id,
    booking_id,
    title,
    quantity,
    unit_price,
    subtotal_amount,
    metadata,
    created_at
  ) VALUES (
    v_order_id,
    'activity_booking',
    v_booking_id,
    v_booking_id,
    v_activity_title || ' - ' || v_plan_name,
    v_quantity,
    v_base_price,
    v_total_twd,
    pg_catalog.jsonb_build_object(
      'planId', p_activity_plan_id,
      'activityId', v_activity_id,
      'startAt', p_start_at,
      'endAt', p_end_at,
      'participants', p_participants
    ),
    v_now
  );

  INSERT INTO public.booking_status_logs (
    booking_id,
    from_status,
    to_status,
    actor_user_id,
    actor_role,
    reason,
    metadata,
    created_at
  ) VALUES (
    v_booking_id,
    NULL,
    'draft',
    p_traveler_id,
    CASE WHEN p_traveler_id IS NULL THEN 'system' ELSE 'traveler' END,
    'Booking draft created',
    pg_catalog.jsonb_build_object(
      'sourceChannel', v_source_channel,
      'correlationId', v_correlation_id,
      'contactEmail', v_contact_email,
      'auditSignal', 'line_liff_draft_entry',
      'conflictOverride', p_conflict_override_snapshot,
      'overrideId', p_conflict_override_id
    ),
    v_now
  );

  RETURN pg_catalog.jsonb_build_object(
    'booking_id', v_booking_id,
    'booking_no', v_booking_no,
    'booking_status', 'draft',
    'order_id', v_order_id,
    'order_status', 'pending_payment',
    'total_twd', v_total_twd
  );
END;
$issue1811$;

REVOKE ALL ON FUNCTION public.fn_create_booking_draft_atomic(
  uuid, uuid, timestamptz, timestamptz, text, integer, text, text, text, text, text, uuid, jsonb, text, timestamptz
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.fn_create_booking_draft_atomic(
  uuid, uuid, timestamptz, timestamptz, text, integer, text, text, text, text, text, uuid, jsonb, text, timestamptz
) TO service_role;

COMMENT ON FUNCTION public.fn_create_booking_draft_atomic(
  uuid, uuid, timestamptz, timestamptz, text, integer, text, text, text, text, text, uuid, jsonb, text, timestamptz
) IS
  'Issue #1811: atomically creates a base booking, reciprocal order, activity item and initial status log using active plan pricing. Service role only; client totals are never accepted.';
