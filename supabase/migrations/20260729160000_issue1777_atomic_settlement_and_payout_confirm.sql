-- #1777 Phase 2 — 結算與確認出款收斂為單一交易（owner 決策 C）
--
-- 背景（#1777 缺口 3／4）：
--   (a) settlement 目前先 upsert payout_items、再由 JS 讀出 guide_balances 加
--       delta 後整列寫回。payout item 成功而 balance 失敗時，重跑會因 sweep
--       「已有 payout item 就排除」而永久跳過該訂單 → 餘額永久漏加；且整列
--       回寫在 sweep × 紅沖 × confirm 併發下必然 lost update。
--   (b) payout confirm 把「扣餘額 → pending→paid → audit」拆成三次獨立呼叫。
--       扣款成功但 update 失敗時 payout 仍 pending、餘額已扣，重試即重複扣款；
--       `Math.max(0, …)` 還把餘額不足靜默截成 0。
--
-- 修法：兩支 plpgsql 函式，各自在單一交易內完成全部寫入，同成同敗且可安全重送。
--   - 冪等以 ledger 為準：只有真正插入新的 payout_items 列時才動 balance
--     （INSERT … ON CONFLICT DO NOTHING RETURNING 判定），因此重跑不會重複累加。
--   - 併發以 row lock 為準：guide_balances／payouts 皆 SELECT … FOR UPDATE，
--     且 balance 以 SQL 層 `balance_twd + delta` 增減，不做 read-modify-write。
--   - 安全閘門在交易內重驗（見 fn_record_settlement_atomic 的 recheck 區塊），
--     避免 JS 端讀取到寫入之間訂單被標記爭議／安全案件。
--
-- 本 migration 只建立函式，不改任何既有表結構、不寫入任何資料列。
-- 回滾：同名 .rollback.sql（DROP 兩支函式；呼叫端切回舊路徑即恢復原行為）。
--
-- ⚠️ 部署順序：settlement sweep 由 GitHub Actions cron 每日 02:00 UTC 自動執行。
--    本 migration 必須先套用，才能 merge 改呼叫 RPC 的應用程式碼，否則隔日排程
--    整批失敗。呼叫端在 RPC 缺席時 fail-closed（不入帳、記 cron error），不會
--    退回舊的非原子路徑。

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- fn_record_settlement_atomic — 結算分錄與導遊餘額同成同敗
-- ─────────────────────────────────────────────────────────────────────────────
--
-- @param p_items jsonb 陣列，每筆：
--   { order_id, guide_id, gmv_twd, commission_twd, net_twd, rules_version }
--   （由 computeSweepPayoutItem 算出，金額語意：gmv 為扣退款後的有效金額，
--     commission／net 各自 floor、殘差歸平台——此為 by-design，不在此重算。）
-- @param p_settled_at 結算時間戳；NULL 則用 now()
--
-- 回傳單列統計。任何一筆拋錯 → 整批回滾（呼叫端重跑即可，冪等安全）。

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
  v_net integer;
  v_settled_at timestamptz := coalesce(p_settled_at, now());
  v_inserted_id uuid;
  v_order_status text;
  v_order_paid_at timestamptz;
  v_order_total integer;
  v_refund integer;
  v_hold boolean;
  v_settled integer := 0;
  v_skipped integer := 0;
  v_rejected integer := 0;
  v_rejected_ids uuid[] := ARRAY[]::uuid[];
  v_guides uuid[] := ARRAY[]::uuid[];
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'p_items must be a jsonb array' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_order_id := (v_item ->> 'order_id')::uuid;
    v_guide_id := (v_item ->> 'guide_id')::uuid;
    v_net := (v_item ->> 'net_twd')::integer;

    IF v_order_id IS NULL OR v_guide_id IS NULL THEN
      RAISE EXCEPTION 'order_id and guide_id are required' USING ERRCODE = '22023';
    END IF;

    -- 鎖住訂單並在交易內重驗資格。JS 端讀取與此刻之間，訂單可能已被標記付款
    -- 爭議／安全案件，或被退款。這裡是最後一道閘門——錯過就是真的把錢撥出去。
    SELECT o.status, o.paid_at, o.total_twd
      INTO v_order_status, v_order_paid_at, v_order_total
    FROM orders o
    WHERE o.id = v_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'order not found: %', v_order_id USING ERRCODE = 'P0002';
    END IF;

    -- 四個 payout-hold 旗標與退款金額（operations_tracking 可能整列不存在）
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

    -- 資格：completed ＋ 已實收 ＋ 無任何 hold ＋ 未全額退款。
    -- （T+N 時間閘門由呼叫端計算——需要 booking／schedule 的 start_at 回退邏輯，
    --   且該條件不會在秒級內反轉，重複實作反而有分歧風險。）
    IF v_order_status <> 'completed'
       OR v_order_paid_at IS NULL
       OR v_hold
       OR coalesce(v_order_total, 0) - v_refund <= 0 THEN
      v_rejected := v_rejected + 1;
      v_rejected_ids := array_append(v_rejected_ids, v_order_id);
      CONTINUE;
    END IF;

    -- Ledger 寫入。UNIQUE(order_id, settlement_kind) 使重送不會產生第二列；
    -- RETURNING 為空即代表「本次沒有新增分錄」，因此**不得**再動餘額。
    INSERT INTO payout_items (
      order_id, guide_id, gmv_twd, commission_twd, net_twd, rules_version,
      settlement_kind, settled_at
    )
    VALUES (
      v_order_id,
      v_guide_id,
      (v_item ->> 'gmv_twd')::integer,
      (v_item ->> 'commission_twd')::integer,
      v_net,
      coalesce(v_item ->> 'rules_version', 'v1'),
      'settlement',
      v_settled_at
    )
    ON CONFLICT (order_id, settlement_kind) DO NOTHING
    RETURNING id INTO v_inserted_id;

    IF v_inserted_id IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- 餘額投影。SQL 層增減＋唯一鍵衝突時更新，避免 read-modify-write 的
    -- lost update；與上方 INSERT 同屬一個交易，不可能只寫一半。
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

-- ─────────────────────────────────────────────────────────────────────────────
-- fn_confirm_payout_atomic — 扣餘額／pending→paid／audit 同成同敗
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 冪等：同一 payout 重送回 already_paid，不重複扣款。
-- 餘額不足一律 RAISE（絕不 max(0) 靜默截斷——那會讓帳面憑空少掉差額）。

CREATE OR REPLACE FUNCTION public.fn_confirm_payout_atomic(
  p_payout_id uuid,
  p_confirmed_by text DEFAULT 'admin',
  p_transfer_ref text DEFAULT NULL
)
RETURNS TABLE (
  payout_id uuid,
  guide_id uuid,
  total_twd integer,
  state text,
  confirmed_at timestamptz,
  transfer_ref text,
  before_balance integer,
  after_balance integer,
  already_paid boolean
)
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_payout payouts%ROWTYPE;
  v_before integer;
  v_after integer;
  v_now timestamptz := now();
  v_actor text := coalesce(nullif(btrim(p_confirmed_by), ''), 'admin');
BEGIN
  IF p_payout_id IS NULL THEN
    RAISE EXCEPTION 'payoutId is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_payout FROM payouts WHERE id = p_payout_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payout not found' USING ERRCODE = 'P0002';
  END IF;

  -- 重送冪等：已 paid 直接回現況，不再扣一次餘額。
  IF v_payout.state = 'paid' THEN
    payout_id := v_payout.id;
    guide_id := v_payout.guide_id;
    total_twd := v_payout.total_twd;
    state := v_payout.state;
    confirmed_at := v_payout.confirmed_at;
    transfer_ref := v_payout.transfer_ref;
    SELECT gb.balance_twd INTO v_before FROM guide_balances gb WHERE gb.guide_id = v_payout.guide_id;
    before_balance := coalesce(v_before, 0);
    after_balance := coalesce(v_before, 0);
    already_paid := true;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_payout.state <> 'pending' THEN
    RAISE EXCEPTION 'payout already %', v_payout.state USING ERRCODE = '22000';
  END IF;

  -- 鎖餘額列後再讀，確保與扣減之間沒有其他交易介入。
  SELECT gb.balance_twd INTO v_before
  FROM guide_balances gb
  WHERE gb.guide_id = v_payout.guide_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'guide balance row not found for guide %', v_payout.guide_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 餘額不足＝帳務異常，必須擋下讓人工處理，不得截成 0 讓差額憑空消失。
  IF v_before < v_payout.total_twd THEN
    RAISE EXCEPTION 'insufficient guide balance: have %, need %', v_before, v_payout.total_twd
      USING ERRCODE = '22000';
  END IF;

  v_after := v_before - v_payout.total_twd;

  UPDATE guide_balances
     SET balance_twd = v_after,
         updated_at = v_now
   WHERE guide_balances.guide_id = v_payout.guide_id;

  UPDATE payouts
     SET state = 'paid',
         confirmed_by = v_actor,
         confirmed_at = v_now,
         transfer_ref = p_transfer_ref
   WHERE id = p_payout_id;

  INSERT INTO audit_logs (actor, action, metadata)
  VALUES (
    v_actor,
    'payout_confirmed',
    jsonb_build_object(
      'payout_id', p_payout_id,
      'guide_id', v_payout.guide_id,
      'total_twd', v_payout.total_twd,
      'before_balance', v_before,
      'after_balance', v_after,
      'transfer_ref', p_transfer_ref,
      'atomic', true
    )
  );

  payout_id := p_payout_id;
  guide_id := v_payout.guide_id;
  total_twd := v_payout.total_twd;
  state := 'paid';
  confirmed_at := v_now;
  transfer_ref := p_transfer_ref;
  before_balance := v_before;
  after_balance := v_after;
  already_paid := false;
  RETURN NEXT;
END;
$$;

-- 權限：只有 service-role 可執行（#1678 grants hardening 同款收斂）。
REVOKE ALL ON FUNCTION public.fn_record_settlement_atomic(jsonb, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_confirm_payout_atomic(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_record_settlement_atomic(jsonb, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_confirm_payout_atomic(uuid, text, text) TO service_role;

COMMIT;
