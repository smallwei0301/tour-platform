-- #1777 退款鏈修復 — 累積退款額原子累加 ＋ 冪等鍵改由 DB 端推導
--
-- 由 #1777 收尾稽核（2026-07-30）在**呼叫端**抓到的兩個 P0，以及 Phase 3 函式
-- 內的一個 P1。金額模型（owner 決策 B）不變，改的是誰負責累積、以及冪等鍵從
-- 哪裡來。
--
-- ── F1（P0）累積退款額被覆寫而非累加 ────────────────────────────────────────
--   refund-execute/route.ts 的 recordOperationsRefundAmount 以
--       .update({ refund_amount_twd: <本次金額> })
--   直接**覆寫**。NT$2,000 的訂單先退 500 再退 500，欄位最終停在 500 而非
--   1,000 → effective GMV 多算 500 → 導遊被多撥 floor(500 × 0.85) = 425。
--   且該寫入在應用層 read-modify-write，與 #1777 要消滅的模式相同：兩筆併發
--   退款會 lost update。
--
-- ── F2（P0）冪等鍵用「本次金額」而非「累積額」──────────────────────────────
--   buildRefundEventId(orderId, opsRefundTwd) 的第二參數在 route 傳的是**本次**
--   退款額。兩次等額部分退款（500、500）算出同一把鍵 → 第二次差額分錄被
--   ON CONFLICT DO NOTHING 吃掉 → ledger 只調整一次，導遊淨應付偏高。
--   （helper 的 docstring 寫的是「累積額」，單元測試也只用累積額當輸入，因此
--   測試全綠而 production 錯——測試從未斷言呼叫端真正傳了什麼。）
--
-- ── F5（P1）delta=0 早退跳過 carry-forward 檢查 ─────────────────────────────
--   舊版在 `v_delta = 0` 時直接 RETURN，早於餘額轉負的 carry-forward 稽核。
--   若上游 recordRefundReversalDb 已整筆紅沖（ledger 淨額已為 0、餘額已被扣成
--   負數），本函式算出 target=0、previous=0、delta=0 → 早退 → **不留任何
--   payout_carry_forward_created**。已經付出去的錢因此沒有可追蹤的回收紀錄。
--
-- ── 修法 ────────────────────────────────────────────────────────────────────
--   把「累積退款額」的維護搬進本函式，與 ledger 調整共用同一個交易與同一把
--   `orders FOR UPDATE` 鎖：
--     1. 參數從 (p_order_id, p_refund_event_id, p_actor) 改為
--        (p_order_id, p_refund_delta_twd, p_actor)——呼叫端只需說「本次退了多少」。
--     2. 函式內 upsert operations_tracking.refund_amount_twd += delta，取得
--        **交易內的**累積額，據此推導冪等鍵 'cum:<累積額>'。
--        累積額單調遞增（delta 不得為負）⇒ 每個退款事件必得唯一鍵，等額的第二次
--        部分退款不再撞鍵；同一事件重送（delta 相同但累積額已推進）則會是新事件
--        ——這是正確的，因為 route 只在 provider 本次真的退款成功後才呼叫。
--     3. delta=0 代表「只對帳、不累加」，鍵等於當前累積額 ⇒ 天然冪等，可安全
--        重跑做修復。
--     4. carry-forward 與超額退款稽核改為在**所有**路徑上檢查（F5），並以
--        (order_id, action, metadata->>'refund_event_id') 去重，重跑不刷重複列。
--
-- ── 另外修掉的潛在解析風險 ──────────────────────────────────────────────────
--   舊版 `RETURNS TABLE (order_id uuid, …, refund_event_id text)` 讓 plpgsql
--   變數與資料表欄位同名，而
--       ON CONFLICT (order_id, refund_event_id)
--   的 inference specification 是以**運算式**解析的，同名變數會被代換成參數
--   placeholder。本檔改為 `RETURNS jsonb`，函式體內不再有任何與欄位同名的變數，
--   整類問題消失。（回傳欄位名對呼叫端不變——由 wrapper 正規化。）
--
-- 影響資料：本 migration 只換函式定義，不動任何既有列。production 目前
-- refund_adjustment 分錄為 0 筆、payout confirm 仍 HOLD。
--
-- 回滾：同名 .rollback.sql。

BEGIN;

-- 舊的三參數簽章必須移除：新簽章第二個參數型別不同，兩者並存會讓 PostgREST
-- 無法決定要呼叫哪一支（PGRST203）。
DROP FUNCTION IF EXISTS public.fn_apply_refund_adjustment_atomic(uuid, text, text);

CREATE OR REPLACE FUNCTION public.fn_apply_refund_adjustment_atomic(
  p_order_id uuid,
  p_refund_delta_twd integer,
  p_actor text DEFAULT 'refund-execute'
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_total integer;
  v_delta_in integer := coalesce(p_refund_delta_twd, 0);
  v_refund integer;
  v_effective integer;
  v_rate numeric;
  v_rules_version text;
  v_guide_id uuid;
  v_previous integer;
  v_target integer;
  v_delta integer;
  v_balance integer;
  v_carry integer := 0;
  v_over boolean := false;
  v_applied boolean := false;
  v_now timestamptz := now();
  v_actor text := coalesce(nullif(btrim(p_actor), ''), 'refund-execute');
  v_event_id text;
  v_inserted uuid;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'orderId is required' USING ERRCODE = '22023';
  END IF;

  -- 負 delta 會讓累積額回退，破壞「累積額單調遞增 ⇒ 冪等鍵唯一」的前提。
  IF v_delta_in < 0 THEN
    RAISE EXCEPTION 'refundDeltaTwd must not be negative（累積額必須單調遞增）'
      USING ERRCODE = '22023';
  END IF;

  -- 鎖訂單：序列化同一訂單上的併發退款／結算。以下所有讀寫都在這把鎖之內。
  SELECT o.total_twd INTO v_total
  FROM orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  -- ── F1 修復：累積退款額在交易內累加（不是覆寫、不是應用層 read-modify-write）
  -- operations_tracking.order_id 有 UNIQUE 索引（operations_tracking_order_id_key），
  -- 故可直接 ON CONFLICT 推論。只動 refund_amount_twd 與 updated_at，保留
  -- manual_minutes／holds 等人工欄位。
  INSERT INTO operations_tracking AS ot (order_id, refund_amount_twd, updated_at)
  VALUES (p_order_id, v_delta_in, v_now)
  ON CONFLICT (order_id) DO UPDATE
    SET refund_amount_twd = coalesce(ot.refund_amount_twd, 0) + v_delta_in,
        updated_at = v_now
  RETURNING refund_amount_twd INTO v_refund;

  v_refund := coalesce(v_refund, 0);

  -- ── F2 修復：冪等鍵由交易內的累積額推導，呼叫端無從傳錯。
  v_event_id := 'cum:' || v_refund::text;

  -- 累積退款額超過訂單總額＝上游驗證漏掉了「本次金額 ≤ 剩餘可退」。金額模型以
  -- greatest(0, …) 收斂，不會算出負的應付，但這是需要人工查的異常，留稽核。
  IF v_refund > coalesce(v_total, 0) THEN
    v_over := true;
  END IF;

  -- 該訂單既有的 ledger 淨額（settlement + reversal + 先前的 adjustment）。
  -- 沒有任何分錄代表尚未結算——結算前的退款由 sweep 的 effective-gmv 處理，
  -- 這裡不介入（避免對從未入帳的訂單記出負數餘額）。但**累積額已經記好了**，
  -- 這正是 sweep 之後要讀的值。
  SELECT coalesce(sum(pi.net_twd), 0), max(pi.guide_id::text)::uuid, max(pi.rules_version)
    INTO v_previous, v_guide_id, v_rules_version
  FROM payout_items pi
  WHERE pi.order_id = p_order_id;

  IF v_guide_id IS NULL THEN
    RETURN jsonb_build_object(
      'order_id', p_order_id,
      'guide_id', NULL,
      'refund_event_id', v_event_id,
      'cumulative_refund_twd', v_refund,
      'target_net_twd', 0,
      'previous_net_twd', 0,
      'delta_twd', 0,
      'applied', false,
      'settled', false,
      'carry_forward_twd', 0,
      'balance_after', 0,
      'over_refund', v_over
    );
  END IF;

  -- active 分潤率（與 sweep 讀同一張 settlement_rules；缺列時退回 0.15 預設）
  SELECT sr.commission_rate INTO v_rate
  FROM settlement_rules sr
  WHERE sr.is_active = true
  LIMIT 1;

  IF v_rate IS NULL THEN
    v_rate := 0.15;
  END IF;

  -- 決策 B：導遊最終應付 = max(0, 總額 − 累積退款) × (1 − 分潤率)，floor 取整。
  v_effective := greatest(0, coalesce(v_total, 0) - v_refund);
  v_target := floor(v_effective * (1 - v_rate))::integer;
  v_delta := v_target - v_previous;

  IF v_delta <> 0 THEN
    -- 追加差額分錄。冪等鍵衝突（同一累積額狀態重跑）→ 不重複記帳。
    INSERT INTO payout_items (
      order_id, guide_id, gmv_twd, commission_twd, net_twd,
      rules_version, settlement_kind, refund_event_id, settled_at
    )
    VALUES (
      p_order_id,
      v_guide_id,
      0,
      0,
      v_delta,
      coalesce(v_rules_version, 'v1'),
      'refund_adjustment',
      v_event_id,
      v_now
    )
    ON CONFLICT (order_id, refund_event_id) WHERE refund_event_id IS NOT NULL
    DO NOTHING
    RETURNING id INTO v_inserted;

    IF v_inserted IS NOT NULL THEN
      -- 餘額同步（與分錄同交易）。差額為負代表要扣回已入帳的金額。
      INSERT INTO guide_balances (guide_id, balance_twd, updated_at)
      VALUES (v_guide_id, v_delta, v_now)
      ON CONFLICT (guide_id) DO UPDATE
        SET balance_twd = guide_balances.balance_twd + EXCLUDED.balance_twd,
            updated_at = EXCLUDED.updated_at
      RETURNING balance_twd INTO v_balance;

      v_applied := true;

      INSERT INTO audit_logs (order_id, actor, action, metadata)
      VALUES (
        p_order_id,
        v_actor,
        'payout_refund_adjustment_applied',
        jsonb_build_object(
          'order_id', p_order_id,
          'guide_id', v_guide_id,
          'refund_event_id', v_event_id,
          'cumulative_refund_twd', v_refund,
          'previous_net_twd', v_previous,
          'target_net_twd', v_target,
          'delta_twd', v_delta,
          'balance_after', v_balance
        )
      );
    ELSE
      -- 冪等命中：本次沒有記帳，差額對外回 0（ledger 現值已經是目標值）。
      v_delta := 0;
    END IF;
  END IF;

  IF v_balance IS NULL THEN
    SELECT gb.balance_twd INTO v_balance
    FROM guide_balances gb
    WHERE gb.guide_id = v_guide_id;
    v_balance := coalesce(v_balance, 0);
  END IF;

  -- ── F5 修復：carry-forward 檢查不再被 delta=0 早退跳過。
  -- 餘額為負＝該筆錢已經付出去了，必須回收。刻意**不**截成 0（AC：不得靜默
  -- 截斷），改為留下負餘額＋可追蹤的稽核列。以 refund_event_id 去重，重跑不刷
  -- 重複列。
  IF v_balance < 0 THEN
    v_carry := -v_balance;

    IF NOT EXISTS (
      SELECT 1 FROM audit_logs al
      WHERE al.order_id = p_order_id
        AND al.action = 'payout_carry_forward_created'
        AND al.metadata ->> 'refund_event_id' = v_event_id
    ) THEN
      INSERT INTO audit_logs (order_id, actor, action, metadata)
      VALUES (
        p_order_id,
        v_actor,
        'payout_carry_forward_created',
        jsonb_build_object(
          'order_id', p_order_id,
          'guide_id', v_guide_id,
          'refund_event_id', v_event_id,
          'cumulative_refund_twd', v_refund,
          'delta_twd', v_delta,
          'carry_forward_twd', v_carry,
          'reason', 'refund exceeded settled balance; amount already paid out must be recovered'
        )
      );
    END IF;
  END IF;

  IF v_over THEN
    IF NOT EXISTS (
      SELECT 1 FROM audit_logs al
      WHERE al.order_id = p_order_id
        AND al.action = 'refund_exceeds_order_total'
        AND al.metadata ->> 'refund_event_id' = v_event_id
    ) THEN
      INSERT INTO audit_logs (order_id, actor, action, metadata)
      VALUES (
        p_order_id,
        v_actor,
        'refund_exceeds_order_total',
        jsonb_build_object(
          'order_id', p_order_id,
          'refund_event_id', v_event_id,
          'order_total_twd', coalesce(v_total, 0),
          'cumulative_refund_twd', v_refund,
          'reason', 'cumulative refund exceeds order total; upstream remaining-amount validation was bypassed'
        )
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'guide_id', v_guide_id,
    'refund_event_id', v_event_id,
    'cumulative_refund_twd', v_refund,
    'target_net_twd', v_target,
    'previous_net_twd', v_previous,
    'delta_twd', v_delta,
    'applied', v_applied,
    'settled', true,
    'carry_forward_twd', v_carry,
    'balance_after', v_balance,
    'over_refund', v_over
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_apply_refund_adjustment_atomic(uuid, integer, text)
  FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.fn_apply_refund_adjustment_atomic(uuid, integer, text) TO service_role;

COMMIT;
