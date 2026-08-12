-- Issue #1812: materialize selected add-ons inside the same statement transaction
-- as #1811's booking/order aggregate. This migration is source only; it is never
-- applied automatically by this change.
--
-- The RPC intentionally accepts selections, never a client-side monetary value.
-- It preserves #1591's pricing/stock policy and writes two reconciliation views:
-- order_addons is the selected add-on price snapshot; order_items is the payable
-- line-item explanation. orders.total_twd remains the only payable amount.

CREATE FUNCTION public.fn_create_booking_draft_with_addons_atomic(
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
  p_addon_selections jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $issue1812$
DECLARE
  v_base jsonb;
  v_order_id uuid;
  v_activity_id uuid;
  v_total_twd integer;
  v_selection jsonb;
  v_addon_id_text text;
  v_addon_id uuid;
  v_quantity integer;
  v_addon_name text;
  v_price_twd integer;
  v_unit text;
  v_stock integer;
  v_is_active boolean;
  v_subtotal_bigint bigint;
  v_subtotal_twd integer;
  v_item_quantity integer;
  v_seen_addon_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF p_addon_selections IS NULL THEN
    p_addon_selections := '[]'::jsonb;
  END IF;
  IF pg_catalog.jsonb_typeof(p_addon_selections) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ADDON_SELECTIONS_INVALID';
  END IF;
  -- 保持既有 checkout 選擇上限；超量不可藉由新 RPC 改變計價或 materialization。
  IF pg_catalog.jsonb_array_length(p_addon_selections) > 20 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ADDON_SELECTIONS_INVALID';
  END IF;

  -- The #1811 call and every add-on write below execute inside this one outer
  -- statement transaction. Any validation or required-write error aborts all rows.
  v_base := public.fn_create_booking_draft_atomic(
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
    p_payment_deadline_at
  );
  v_order_id := (v_base ->> 'order_id')::uuid;
  v_total_twd := (v_base ->> 'total_twd')::integer;

  SELECT activity_id INTO v_activity_id
    FROM public.orders
   WHERE id = v_order_id;
  IF v_activity_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ADDON_ORDER_ACTIVITY_MISSING';
  END IF;

  FOR v_selection IN SELECT value FROM pg_catalog.jsonb_array_elements(p_addon_selections)
  LOOP
    IF pg_catalog.jsonb_typeof(v_selection) <> 'object' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ADDON_SELECTIONS_INVALID';
    END IF;
    v_addon_id_text := pg_catalog.btrim(v_selection ->> 'addonId');
    IF v_addon_id_text IS NULL
       OR v_addon_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ADDON_UNAVAILABLE', DETAIL = 'invalid-addon-id';
    END IF;
    v_addon_id := v_addon_id_text::uuid;
    -- 同一加購只能有一個 selection。這也杜絕把有限庫存拆成多筆輸入的繞過；
    -- 錯誤 detail 保留 UUID，公開入口可指出需修正的項目。
    IF v_addon_id = ANY(v_seen_addon_ids) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ADDON_SELECTIONS_INVALID', DETAIL = v_addon_id_text;
    END IF;
    v_seen_addon_ids := pg_catalog.array_append(v_seen_addon_ids, v_addon_id);
    IF pg_catalog.jsonb_typeof(v_selection -> 'quantity') <> 'number'
       OR (v_selection ->> 'quantity') !~ '^(?:[1-9]|[1-9][0-9])$' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ADDON_SELECTIONS_INVALID', DETAIL = v_addon_id_text;
    END IF;
    v_quantity := (v_selection ->> 'quantity')::integer;

    SELECT name, price_twd, unit, stock, is_active
      INTO v_addon_name, v_price_twd, v_unit, v_stock, v_is_active
      FROM public.activity_addons
     WHERE id = v_addon_id
       AND activity_id = v_activity_id
     FOR KEY SHARE;

    IF NOT FOUND OR v_is_active IS NOT TRUE OR (v_stock IS NOT NULL AND v_quantity > v_stock) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ADDON_UNAVAILABLE', DETAIL = v_addon_id_text;
    END IF;

    IF v_unit = 'per_person' THEN
      v_item_quantity := v_quantity * p_participants;
    ELSIF v_unit = 'per_group' THEN
      v_item_quantity := v_quantity;
    ELSE
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ADDON_UNIT_INVALID';
    END IF;
    v_subtotal_bigint := v_price_twd::bigint * v_item_quantity::bigint;
    IF v_subtotal_bigint < 0 OR v_subtotal_bigint > 2147483647
       OR v_total_twd::bigint + v_subtotal_bigint > 2147483647 THEN
      RAISE EXCEPTION USING ERRCODE = '22003', MESSAGE = 'ORDER_TOTAL_OUT_OF_RANGE';
    END IF;
    v_subtotal_twd := v_subtotal_bigint::integer;

    INSERT INTO public.order_addons (
      order_id, addon_id, quantity, unit_price_twd, subtotal_twd
    ) VALUES (
      v_order_id, v_addon_id, v_quantity, v_price_twd, v_subtotal_twd
    );

    INSERT INTO public.order_items (
      order_id, item_type, ref_id, title, quantity, unit_price, subtotal_amount, metadata, created_at
    ) VALUES (
      v_order_id,
      'fee',
      v_addon_id,
      v_addon_name,
      v_item_quantity,
      v_price_twd,
      v_subtotal_twd,
      pg_catalog.jsonb_build_object(
        'kind', 'addon',
        'addonId', v_addon_id,
        'selectedQuantity', v_quantity,
        'unit', v_unit
      ),
      pg_catalog.statement_timestamp()
    );
    v_total_twd := (v_total_twd::bigint + v_subtotal_bigint)::integer;
  END LOOP;

  -- This deliberate final write is a required seam: fault injection here proves
  -- already-written add-on snapshots/items still roll back with the base aggregate.
  UPDATE public.orders
     SET total_twd = v_total_twd,
         updated_at = pg_catalog.statement_timestamp()
   WHERE id = v_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ADDON_ORDER_TOTAL_UPDATE_FAILED';
  END IF;

  RETURN pg_catalog.jsonb_set(v_base, '{total_twd}', pg_catalog.to_jsonb(v_total_twd), true);
END;
$issue1812$;

REVOKE ALL ON FUNCTION public.fn_create_booking_draft_with_addons_atomic(
  uuid, uuid, timestamptz, timestamptz, text, integer, text, text, text, text, text, uuid, jsonb, text, timestamptz, jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.fn_create_booking_draft_with_addons_atomic(
  uuid, uuid, timestamptz, timestamptz, text, integer, text, text, text, text, text, uuid, jsonb, text, timestamptz, jsonb
) TO service_role;

COMMENT ON FUNCTION public.fn_create_booking_draft_with_addons_atomic(
  uuid, uuid, timestamptz, timestamptz, text, integer, text, text, text, text, text, uuid, jsonb, text, timestamptz, jsonb
) IS
  'Issue #1812: creates the #1811 booking/order aggregate plus validated add-on snapshots and fee items in one service-role-only transaction. Client totals are never accepted.';
