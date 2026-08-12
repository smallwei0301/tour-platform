-- Issue #1813: make points redemption part of the draft booking transaction.
--
-- This source-only migration deliberately layers on #1812's validated base and
-- add-on materialization. Client money is never accepted: the function derives
-- the payable amount from persisted line items, validates the authenticated
-- traveler identity supplied by the server gateway, then records a single
-- append-only redemption ledger row and matching discount item before updating
-- orders.total_twd. A raised validation or write error aborts every prior row
-- in this statement transaction.

CREATE FUNCTION public.fn_create_booking_draft_with_addons_and_points_atomic(
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
  p_redeem_points integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $issue1813$
DECLARE
  v_base jsonb;
  v_order_id uuid;
  v_total_twd integer;
  v_requested_points integer := COALESCE(p_redeem_points, 0);
  v_available_points bigint;
  v_max_redeemable integer;
  v_now timestamptz := pg_catalog.statement_timestamp();
BEGIN
  IF v_requested_points < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'POINTS_UNAVAILABLE';
  END IF;

  -- #1812 owns validated base pricing, add-on pricing/snapshots, and the
  -- initial only-payable total. Its entire call remains within this outer
  -- statement transaction; a points failure cannot leave its aggregate behind.
  v_base := public.fn_create_booking_draft_with_addons_atomic(
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
    p_addon_selections
  );

  IF v_requested_points = 0 THEN
    RETURN v_base;
  END IF;

  IF p_traveler_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'POINTS_UNAVAILABLE';
  END IF;

  v_order_id := (v_base ->> 'order_id')::uuid;
  v_total_twd := (v_base ->> 'total_twd')::integer;
  IF v_order_id IS NULL OR v_total_twd IS NULL OR v_total_twd < 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POINTS_ORDER_TOTAL_MISSING';
  END IF;

  -- Balance is append-only ledger truth. Positive earned/adjusted entries with
  -- expired timestamps are excluded; prior redemption/expiry/reclaim deltas
  -- remain in the sum. #1814 owns replay and cross-request concurrency policy.
  SELECT COALESCE(SUM(delta) FILTER (WHERE expires_at IS NULL OR expires_at > v_now), 0)
    INTO v_available_points
    FROM public.user_points_ledger
   WHERE user_id = p_traveler_id;

  v_max_redeemable := (v_total_twd::bigint * 30 / 100)::integer;
  IF v_requested_points > v_available_points OR v_requested_points > v_max_redeemable THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'POINTS_UNAVAILABLE';
  END IF;

  -- Required write seam: a failure here proves the #1811/#1812 rows above are
  -- all rolled back, rather than attempting a compensating credit afterwards.
  INSERT INTO public.user_points_ledger (
    user_id,
    delta,
    reason,
    order_id,
    expires_at,
    created_at
  ) VALUES (
    p_traveler_id,
    -v_requested_points,
    'redeem_order',
    v_order_id,
    NULL,
    v_now
  );

  -- The ledger is explanatory, not an alternate payment truth. This discount
  -- item makes the persisted payable-line reconciliation equal total_twd.
  INSERT INTO public.order_items (
    order_id,
    item_type,
    ref_id,
    title,
    quantity,
    unit_price,
    subtotal_amount,
    metadata,
    created_at
  ) VALUES (
    v_order_id,
    'discount',
    v_order_id,
    '點數折抵',
    1,
    -v_requested_points,
    -v_requested_points,
    pg_catalog.jsonb_build_object(
      'kind', 'points_redemption',
      'requestedPoints', v_requested_points,
      'redeemedPoints', v_requested_points
    ),
    v_now
  );

  -- Required final write seam. Payments and API responses subsequently read
  -- only this committed column, never an in-memory redemption calculation.
  UPDATE public.orders
     SET total_twd = v_total_twd - v_requested_points,
         discount_amount = v_requested_points,
         updated_at = v_now
   WHERE id = v_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POINTS_ORDER_TOTAL_UPDATE_FAILED';
  END IF;

  RETURN pg_catalog.jsonb_set(
    v_base,
    '{total_twd}',
    pg_catalog.to_jsonb(v_total_twd - v_requested_points),
    true
  );
END;
$issue1813$;

REVOKE ALL ON FUNCTION public.fn_create_booking_draft_with_addons_and_points_atomic(
  uuid, uuid, timestamptz, timestamptz, text, integer, text, text, text, text, text, uuid, jsonb, text, timestamptz, jsonb, integer
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.fn_create_booking_draft_with_addons_and_points_atomic(
  uuid, uuid, timestamptz, timestamptz, text, integer, text, text, text, text, text, uuid, jsonb, text, timestamptz, jsonb, integer
) TO service_role;

COMMENT ON FUNCTION public.fn_create_booking_draft_with_addons_and_points_atomic(
  uuid, uuid, timestamptz, timestamptz, text, integer, text, text, text, text, text, uuid, jsonb, text, timestamptz, jsonb, integer
) IS
  'Issue #1813: service-role-only atomic draft booking with validated add-ons and points redemption ledger/discount item; orders.total_twd is the sole payable amount.';
