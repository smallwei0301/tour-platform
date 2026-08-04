-- #1777 F3 — 結算金額改由 DB 端在交易內重算，不再信任呼叫端傳值
--
-- 缺口：fn_record_settlement_atomic 對資格（completed／paid_at／四個 hold 旗標／
-- 未全額退款）做了交易內重驗，**但金額直接採用 p_items 傳進來的 gmv_twd／
-- commission_twd／net_twd**。也就是說：
--
--   - sweep 在 JS 端算好金額 → 中間任何一步算錯／用到過期的 refund 值／用到過期
--     的分潤率，DB 都照單全收；
--   - 資格重驗讀的是**交易內**的 refund_amount_twd，金額用的卻是**交易外**算好的
--     值 —— 兩者可能來自不同時點。sweep 讀完訂單後、RPC 執行前發生一筆部分退款，
--     資格會用新的退款額判斷，金額卻還是舊的 → 導遊多領。
--   - 決策 C 說「RPC 是唯一 writer」，但金額的真實來源仍在應用層，等於留了個後門。
--
-- 修法：金額與資格用**同一份交易內讀到的資料**重算：
--     effective  = max(0, total_twd − 累積退款)
--     commission = floor(effective × rate)
--     net        = floor(effective × (1 − rate))
--   rate 取 settlement_rules 的 active 列（與 sweep、與 fn_apply_refund_adjustment_atomic
--   同一來源）。commission 與 net 各自 floor、殘差歸平台
--   （docs/05-business/06-payment-plan/03-settlement-rules.md §4）。
--
-- 呼叫端傳來的金額不再被採用，但**會被比對**：不一致時寫一筆
-- `settlement_amount_mismatch` 稽核（不阻斷結算，因為 DB 算的才是對的）。
-- 這筆稽核同時是 #1777 F8 的偵測器 —— JS 的 IEEE754 與 SQL 的 numeric 若在某個
-- 分潤率下對 floor 給出不同答案，會直接在這裡浮現，而不是等到有人核對帳目。
--
-- p_items 仍需帶 order_id 與 guide_id（決定「結算誰、算給誰」），只有金額欄位
-- 從「輸入」降級為「對照值」。rules_version 改用 DB 的 active 版本，不再由呼叫端指定。
--
-- 其餘邏輯（FOR UPDATE、資格重驗、ON CONFLICT predicate、只有真正插入才動餘額）
-- 逐字保持與 20260729190000 相同。
--
-- 回滾：同名 .rollback.sql。

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_record_settlement_atomic(
  p_items jsonb,
  p_settled_at timestamptz DEFAULT NULL
)
RETURNS TABLE (
  settled_count integer,
  skipped_existing integer,
  rejected_ineligible integer,
  guides_updated integer,
  rejected_order_ids uuid[]
)
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_item jsonb;
  v_order_id uuid;
  v_guide_id uuid;
  v_settled_at timestamptz := coalesce(p_settled_at, now());
  v_inserted_id uuid;
  v_order_status text;
  v_order_paid_at timestamptz;
  v_order_total integer;
  v_refund integer;
  v_hold boolean;
  v_rate numeric;
  v_rules_version text;
  v_effective integer;
  v_gmv integer;
  v_commission integer;
  v_net integer;
  v_claimed_gmv integer;
  v_claimed_commission integer;
  v_claimed_net integer;
  v_settled integer := 0;
  v_skipped integer := 0;
  v_rejected integer := 0;
  v_rejected_ids uuid[] := ARRAY[]::uuid[];
  v_guides uuid[] := ARRAY[]::uuid[];
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'p_items must be a jsonb array' USING ERRCODE = '22023';
  END IF;

  -- 分潤率與版本：交易內取 active 列（與 sweep 讀同一張表），呼叫端不得指定。
  SELECT sr.commission_rate, sr.version
    INTO v_rate, v_rules_version
  FROM settlement_rules sr
  WHERE sr.is_active = true
  LIMIT 1;

  IF v_rate IS NULL THEN
    v_rate := 0.15;
    v_rules_version := 'v1';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_order_id := (v_item ->> 'order_id')::uuid;
    v_guide_id := (v_item ->> 'guide_id')::uuid;

    IF v_order_id IS NULL OR v_guide_id IS NULL THEN
      RAISE EXCEPTION 'order_id and guide_id are required' USING ERRCODE = '22023';
    END IF;

    SELECT o.status, o.paid_at, o.total_twd
      INTO v_order_status, v_order_paid_at, v_order_total
    FROM orders o
    WHERE o.id = v_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'order not found: %', v_order_id USING ERRCODE = 'P0002';
    END IF;

    SELECT coalesce(ot.refund_amount_twd, 0),
           coalesce(ot.is_disputed, false)
             OR coalesce(ot.is_safety_case, false)
             OR coalesce(ot.has_complaint, false)
             OR coalesce(ot.has_oversell_issue, false)
      INTO v_refund, v_hold
    FROM operations_tracking ot
    WHERE ot.order_id = v_order_id;

    IF NOT FOUND THEN
      v_refund := 0;
      v_hold := false;
    END IF;

    -- F3：金額與資格用同一份交易內資料重算，不再採用 p_items 的金額。
    v_effective := greatest(0, coalesce(v_order_total, 0) - v_refund);
    v_gmv := v_effective;
    v_commission := floor(v_effective * v_rate)::integer;
    v_net := floor(v_effective * (1 - v_rate))::integer;

    IF v_order_status <> 'completed'
       OR v_order_paid_at IS NULL
       OR v_hold
       OR v_effective <= 0 THEN
      v_rejected := v_rejected + 1;
      v_rejected_ids := array_append(v_rejected_ids, v_order_id);
      CONTINUE;
    END IF;

    -- 呼叫端傳來的金額只作對照：不一致代表 JS 與 DB 對同一筆訂單算出不同結果
    -- （過期的 refund 值、過期的分潤率，或浮點與 numeric 的 floor 分歧 = F8）。
    -- 不阻斷結算——DB 算的才是對的——但必須留下可查的稽核。
    v_claimed_gmv := nullif(v_item ->> 'gmv_twd', '')::integer;
    v_claimed_commission := nullif(v_item ->> 'commission_twd', '')::integer;
    v_claimed_net := nullif(v_item ->> 'net_twd', '')::integer;

    IF (v_claimed_gmv IS NOT NULL AND v_claimed_gmv <> v_gmv)
       OR (v_claimed_commission IS NOT NULL AND v_claimed_commission <> v_commission)
       OR (v_claimed_net IS NOT NULL AND v_claimed_net <> v_net) THEN
      INSERT INTO audit_logs (order_id, actor, action, metadata)
      VALUES (
        v_order_id,
        'settlement-sweep',
        'settlement_amount_mismatch',
        jsonb_build_object(
          'order_id', v_order_id,
          'guide_id', v_guide_id,
          'rules_version', v_rules_version,
          'commission_rate', v_rate,
          'order_total_twd', coalesce(v_order_total, 0),
          'refund_amount_twd', v_refund,
          'computed_gmv_twd', v_gmv,
          'computed_commission_twd', v_commission,
          'computed_net_twd', v_net,
          'claimed_gmv_twd', v_claimed_gmv,
          'claimed_commission_twd', v_claimed_commission,
          'claimed_net_twd', v_claimed_net,
          'reason', 'caller-supplied amounts disagree with in-transaction recomputation; DB values were used'
        )
      );
    END IF;

    -- predicate 必須與 payout_items_order_kind_unique 的部分索引一致，
    -- 否則 Postgres 無法推論該索引（42P10）。
    INSERT INTO payout_items (
      order_id, guide_id, gmv_twd, commission_twd, net_twd, rules_version,
      settlement_kind, settled_at
    )
    VALUES (
      v_order_id,
      v_guide_id,
      v_gmv,
      v_commission,
      v_net,
      coalesce(v_rules_version, 'v1'),
      'settlement',
      v_settled_at
    )
    ON CONFLICT (order_id, settlement_kind)
      WHERE settlement_kind IN ('settlement', 'reversal')
      DO NOTHING
    RETURNING id INTO v_inserted_id;

    IF v_inserted_id IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO guide_balances (guide_id, balance_twd, last_settled_at, updated_at)
    VALUES (v_guide_id, v_net, v_settled_at, v_settled_at)
    ON CONFLICT (guide_id) DO UPDATE
      SET balance_twd = guide_balances.balance_twd + EXCLUDED.balance_twd,
          last_settled_at = EXCLUDED.last_settled_at,
          updated_at = EXCLUDED.updated_at;

    v_settled := v_settled + 1;
    IF NOT (v_guide_id = ANY (v_guides)) THEN
      v_guides := array_append(v_guides, v_guide_id);
    END IF;
  END LOOP;

  settled_count := v_settled;
  skipped_existing := v_skipped;
  rejected_ineligible := v_rejected;
  guides_updated := coalesce(array_length(v_guides, 1), 0);
  rejected_order_ids := v_rejected_ids;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_record_settlement_atomic(jsonb, timestamptz)
  FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.fn_record_settlement_atomic(jsonb, timestamptz) TO service_role;

COMMIT;
