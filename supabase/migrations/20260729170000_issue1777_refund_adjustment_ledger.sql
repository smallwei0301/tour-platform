-- #1777 Phase 3 — 退款差額 adjustment（owner 決策 B）
--
-- 背景（#1777 缺口 2）：
--   recordRefundReversalDb 固定以原 settlement 的完整 gmv／commission／net 建
--   一筆負值 reversal，完全不看本次退款金額；而 sweep 又排除任何已有 payout
--   item 的訂單，因此不會依剩餘實收金額重建分錄。結果是「已結算後發生部分
--   退款」的訂單，導遊剩餘應收被整筆歸零，而不是
--   `max(0, 總額 − 累積退款) × 導遊分潤率`。多次部分退款更沒有可靠模型——
--   `(order_id, settlement_kind)` 唯一鍵只容得下一筆 reversal。
--
-- owner 決策 B：導遊最終應付 = max(0, 訂單總額 − 累積退款) × active 分潤率；
--   每次退款只追加本次差額，不得重複全額紅沖。
--
-- 修法：把 payout_items 從「一正一反」擴充為 append-only ledger。
--   - 新增 settlement_kind = 'refund_adjustment'
--   - 新增 refund_event_id：退款事件冪等鍵，同一事件只記一次差額
--   - 原 (order_id, settlement_kind) 唯一鍵縮為部分索引（只約束 settlement／
--     reversal），讓同一訂單可以有多筆 adjustment 並存
--   - fn_apply_refund_adjustment_atomic：交易內把該訂單的 ledger 淨額調整到
--     目標值，只追加差額列並同步餘額
--
-- 為什麼是「調整到目標值」而不是「算出本次退款該扣多少」：
--   既有的 reversal 路徑仍在（與 order 狀態機、修復路徑深度耦合，本 phase 不
--   拆），因此 ledger 現值可能已被整筆紅沖。以「目標 − 現值」計算差額，能讓
--   最終淨額在任何前置狀態下都收斂到正確值，且天然冪等——這也涵蓋「先前漏記
--   或多記」的自我修復。
--
-- 整數規則：commission 與 net 各自 floor、殘差歸平台，與 computeSweepPayoutItem
--   （settlement-config.ts）一致。對帳時 gmv ≠ commission + net 屬預期。
--
-- 回滾：同名 .rollback.sql（移除函式與新欄位，還原原本的複合唯一鍵）。

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Schema：ledger 支援多筆退款差額分錄
-- ─────────────────────────────────────────────────────────────────────────────

-- 退款事件冪等鍵。由呼叫端以確定性方式產生（訂單 + 累積退款額），因此
-- 「同一次退款重送」得到相同鍵而不重複記帳，「第二次部分退款」因累積額不同
-- 而得到新鍵、各自留下一筆差額。
ALTER TABLE public.payout_items
  ADD COLUMN IF NOT EXISTS refund_event_id text;

-- 擴充 settlement_kind 允許值（保留既有 settlement／reversal）
ALTER TABLE public.payout_items
  DROP CONSTRAINT IF EXISTS payout_items_settlement_kind_check;

ALTER TABLE public.payout_items
  ADD CONSTRAINT payout_items_settlement_kind_check
  CHECK (settlement_kind IN ('settlement', 'reversal', 'refund_adjustment'));

-- 原本的 (order_id, settlement_kind) 全表唯一鍵會讓同一訂單只能有一筆
-- adjustment；縮為部分索引後，settlement／reversal 仍各自唯一（冪等不變），
-- 而 adjustment 可多筆並存。
DROP INDEX IF EXISTS payout_items_order_kind_unique;

CREATE UNIQUE INDEX IF NOT EXISTS payout_items_order_kind_unique
  ON public.payout_items (order_id, settlement_kind)
  WHERE settlement_kind IN ('settlement', 'reversal');

-- adjustment 的冪等鍵：同一退款事件在同一訂單上只允許一筆差額分錄。
CREATE UNIQUE INDEX IF NOT EXISTS payout_items_refund_event_unique
  ON public.payout_items (order_id, refund_event_id)
  WHERE refund_event_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- fn_apply_refund_adjustment_atomic
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 把指定訂單的 ledger 淨額調整到「未退款有效金額 × 導遊分潤率」，只追加差額。
--
-- @param p_order_id       目標訂單
-- @param p_refund_event_id 退款事件冪等鍵（同一事件重送不重複記帳）
-- @param p_actor          稽核用操作者
--
-- 回傳本次是否真的記了差額、差額多少、調整後的目標淨額與導遊餘額。

CREATE OR REPLACE FUNCTION public.fn_apply_refund_adjustment_atomic(
  p_order_id uuid,
  p_refund_event_id text,
  p_actor text DEFAULT 'refund-execute'
)
RETURNS TABLE (
  order_id uuid,
  guide_id uuid,
  target_net_twd integer,
  previous_net_twd integer,
  delta_twd integer,
  applied boolean,
  carry_forward_twd integer,
  balance_after integer
)
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_total integer;
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
  v_now timestamptz := now();
  v_actor text := coalesce(nullif(btrim(p_actor), ''), 'refund-execute');
  v_event_id text := nullif(btrim(p_refund_event_id), '');
  v_inserted uuid;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'orderId is required' USING ERRCODE = '22023';
  END IF;
  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'refundEventId is required（冪等鍵不可為空）' USING ERRCODE = '22023';
  END IF;

  -- 鎖訂單，序列化同一訂單上的併發退款／結算。
  SELECT o.total_twd INTO v_total
  FROM orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  -- 該訂單既有的 ledger 淨額（settlement + reversal + 先前的 adjustment）。
  -- 沒有任何分錄代表尚未結算——結算前的退款由 sweep 的 effective-gmv 處理，
  -- 這裡不介入（避免對從未入帳的訂單記出負數餘額）。
  SELECT coalesce(sum(pi.net_twd), 0), max(pi.guide_id::text)::uuid, max(pi.rules_version)
    INTO v_previous, v_guide_id, v_rules_version
  FROM payout_items pi
  WHERE pi.order_id = p_order_id;

  IF v_guide_id IS NULL THEN
    order_id := p_order_id;
    guide_id := NULL;
    target_net_twd := 0;
    previous_net_twd := 0;
    delta_twd := 0;
    applied := false;
    carry_forward_twd := 0;
    balance_after := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT coalesce(ot.refund_amount_twd, 0) INTO v_refund
  FROM operations_tracking ot
  WHERE ot.order_id = p_order_id;

  IF NOT FOUND THEN
    v_refund := 0;
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

  IF v_delta = 0 THEN
    SELECT gb.balance_twd INTO v_balance FROM guide_balances gb WHERE gb.guide_id = v_guide_id;
    order_id := p_order_id;
    guide_id := v_guide_id;
    target_net_twd := v_target;
    previous_net_twd := v_previous;
    delta_twd := 0;
    applied := false;
    carry_forward_twd := 0;
    balance_after := coalesce(v_balance, 0);
    RETURN NEXT;
    RETURN;
  END IF;

  -- 追加差額分錄。冪等鍵衝突（同一退款事件重送）→ 不重複記帳。
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

  IF v_inserted IS NULL THEN
    SELECT gb.balance_twd INTO v_balance FROM guide_balances gb WHERE gb.guide_id = v_guide_id;
    order_id := p_order_id;
    guide_id := v_guide_id;
    target_net_twd := v_target;
    previous_net_twd := v_previous;
    delta_twd := 0;
    applied := false;
    carry_forward_twd := 0;
    balance_after := coalesce(v_balance, 0);
    RETURN NEXT;
    RETURN;
  END IF;

  -- 餘額同步（與分錄同交易）。差額為負代表要扣回已入帳的金額。
  INSERT INTO guide_balances (guide_id, balance_twd, updated_at)
  VALUES (v_guide_id, v_delta, v_now)
  ON CONFLICT (guide_id) DO UPDATE
    SET balance_twd = guide_balances.balance_twd + EXCLUDED.balance_twd,
        updated_at = EXCLUDED.updated_at
  RETURNING balance_twd INTO v_balance;

  -- 餘額被扣成負數＝該筆錢已經付出去了，必須回收。這裡刻意**不**截成 0
  -- （AC：不得靜默截斷），改為留下負餘額並記一筆可追蹤的 carry-forward 稽核，
  -- 由後續期別回收或人工處理。
  IF v_balance < 0 THEN
    v_carry := -v_balance;
    INSERT INTO audit_logs (order_id, actor, action, metadata)
    VALUES (
      p_order_id,
      v_actor,
      'payout_carry_forward_created',
      jsonb_build_object(
        'order_id', p_order_id,
        'guide_id', v_guide_id,
        'refund_event_id', v_event_id,
        'delta_twd', v_delta,
        'carry_forward_twd', v_carry,
        'reason', 'refund exceeded settled balance; amount already paid out must be recovered'
      )
    );
  END IF;

  INSERT INTO audit_logs (order_id, actor, action, metadata)
  VALUES (
    p_order_id,
    v_actor,
    'payout_refund_adjustment_applied',
    jsonb_build_object(
      'order_id', p_order_id,
      'guide_id', v_guide_id,
      'refund_event_id', v_event_id,
      'previous_net_twd', v_previous,
      'target_net_twd', v_target,
      'delta_twd', v_delta,
      'balance_after', v_balance
    )
  );

  order_id := p_order_id;
  guide_id := v_guide_id;
  target_net_twd := v_target;
  previous_net_twd := v_previous;
  delta_twd := v_delta;
  applied := true;
  carry_forward_twd := v_carry;
  balance_after := v_balance;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_apply_refund_adjustment_atomic(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_apply_refund_adjustment_atomic(uuid, text, text) TO service_role;

COMMIT;
