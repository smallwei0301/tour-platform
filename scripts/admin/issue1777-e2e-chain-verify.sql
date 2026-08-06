-- #1777 — 財務全鏈端到端驗證（payment → settlement → partial refund → payout confirm）
--
-- ## 為什麼是這個形式
--
-- issue Verification 要求「staging／production-equivalent fixture 走
-- payment→settlement→partial refund→payout confirm，含重送與 fault injection」。
-- 現況：沒有 staging DB（Supabase 專案只有 production 一個 ACTIVE），而 production
-- 是冷啟動環境、沒有可安全操作的測試訂單，且 owner 授權明訂**不得**改真實訂單、
-- 執行真實退款或真實 payout confirm。
--
-- 因此本腳本用**合成資料 ＋ 強制 rollback 的單一交易**：
--   - 在交易內建立臨時的 guide_profiles／orders／operations_tracking；
--   - 依真實呼叫順序跑完整條鏈（含重送與冪等驗證）；
--   - 每一步都以 RAISE EXCEPTION 斷言，任一步不符即中止並指出哪一條掛掉；
--   - 結尾必定 RAISE，整個交易 rollback ⇒ **零資料落地**。
--
-- 這比 fixture 更強：跑的是 production 上真正生效的 plpgsql、真正的唯一索引、
-- 真正的 FOR UPDATE 鎖與 CHECK 約束。它唯一不涵蓋的是 provider（ECPay）那一段，
-- 那部分維持 NOT_AUTOMATABLE-env。
--
-- ## 用法
--
--   透過 Supabase MCP 的 execute_sql 或 Dashboard SQL Editor 整段貼上執行。
--   **預期結果是一個 P0001 例外**，訊息開頭為 `E2E PASS` —— 那就是通過。
--   任何 `E2E FAIL:` 開頭的例外代表該條斷言不成立。
--
-- ⚠️ 本腳本會在交易內 INSERT／UPDATE，但結尾必定 RAISE 使其全部回滾。
--    請勿把結尾的 RAISE 拿掉後執行。

DO $$
DECLARE
  v_guide uuid;
  v_order_a uuid;   -- 情境 A：結算 → 兩次等額部分退款 → 全額退款
  v_order_b uuid;   -- 情境 B：結算 → payout confirm → 重送
  v_rate numeric;
  v_items jsonb;
  r record;
  j jsonb;
  v_bal integer;
  v_ledger integer;
  v_payout uuid;
  v_log text := '';

BEGIN
  SELECT sr.commission_rate INTO v_rate FROM settlement_rules sr WHERE sr.is_active = true LIMIT 1;
  v_rate := coalesce(v_rate, 0.15);

  -- ── 合成資料 ───────────────────────────────────────────────────────────────
  INSERT INTO guide_profiles (slug, display_name)
  VALUES ('e2e-verify-1777-' || gen_random_uuid()::text, 'E2E Verify #1777')
  RETURNING id INTO v_guide;

  INSERT INTO orders (status, total_twd, paid_at)
  VALUES ('completed', 10000, now() - interval '30 days') RETURNING id INTO v_order_a;
  INSERT INTO orders (status, total_twd, paid_at)
  VALUES ('completed', 6000, now() - interval '30 days') RETURNING id INTO v_order_b;

  INSERT INTO operations_tracking (order_id) VALUES (v_order_a), (v_order_b);

  -- ══ 情境 A ════════════════════════════════════════════════════════════════
  -- A1. 結算
  v_items := jsonb_build_array(
    jsonb_build_object('order_id', v_order_a, 'guide_id', v_guide,
                       'gmv_twd', 10000, 'commission_twd', 1500, 'net_twd', 8500));
  SELECT * INTO r FROM fn_record_settlement_atomic(v_items, now());

  IF r.settled_count <> 1 THEN
    RAISE EXCEPTION 'E2E FAIL: A1 settled_count=% (expected 1)', r.settled_count;
  END IF;

  SELECT sum(net_twd) INTO v_ledger FROM payout_items WHERE order_id = v_order_a;
  SELECT balance_twd INTO v_bal FROM guide_balances WHERE guide_id = v_guide;
  IF v_ledger <> floor(10000 * (1 - v_rate))::integer OR v_bal <> v_ledger THEN
    RAISE EXCEPTION 'E2E FAIL: A1 ledger=% balance=% (expected both %)',
      v_ledger, v_bal, floor(10000 * (1 - v_rate))::integer;
  END IF;
  v_log := v_log || format('A1 settle: ledger=%s balance=%s; ', v_ledger, v_bal);

  -- A2. 結算重送 → 冪等（不得重複入帳）
  SELECT * INTO r FROM fn_record_settlement_atomic(v_items, now());
  SELECT balance_twd INTO v_bal FROM guide_balances WHERE guide_id = v_guide;
  IF r.skipped_existing <> 1 OR r.settled_count <> 0 OR v_bal <> v_ledger THEN
    RAISE EXCEPTION 'E2E FAIL: A2 resend not idempotent (skipped=% settled=% balance=%)',
      r.skipped_existing, r.settled_count, v_bal;
  END IF;
  v_log := v_log || 'A2 settle-resend idempotent; ';

  -- A3. 第一次部分退款 3000 —— 依 refund-execute 的真實順序：先紅沖、再 adjustment
  j := fn_record_refund_reversal_atomic(v_order_a, 'e2e');
  IF j ->> 'outcome' <> 'reversed' THEN
    RAISE EXCEPTION 'E2E FAIL: A3 reversal outcome=%', j ->> 'outcome';
  END IF;
  SELECT sum(net_twd) INTO v_ledger FROM payout_items WHERE order_id = v_order_a;
  IF v_ledger <> 0 THEN
    RAISE EXCEPTION 'E2E FAIL: A3 ledger after full reversal=% (expected 0)', v_ledger;
  END IF;

  j := fn_apply_refund_adjustment_atomic(v_order_a, 3000, 'e2e');
  SELECT sum(net_twd) INTO v_ledger FROM payout_items WHERE order_id = v_order_a;
  SELECT balance_twd INTO v_bal FROM guide_balances WHERE guide_id = v_guide;
  IF v_ledger <> floor(7000 * (1 - v_rate))::integer THEN
    RAISE EXCEPTION 'E2E FAIL: A3 ledger=% (expected floor(7000×(1-rate))=%)',
      v_ledger, floor(7000 * (1 - v_rate))::integer;
  END IF;
  IF (j ->> 'refund_event_id') <> 'cum:3000' THEN
    RAISE EXCEPTION 'E2E FAIL: A3 event_id=% (expected cum:3000)', j ->> 'refund_event_id';
  END IF;
  v_log := v_log || format('A3 refund#1: ledger=%s balance=%s key=%s; ',
                           v_ledger, v_bal, j ->> 'refund_event_id');

  -- A4. 第二次**等額** 3000 —— F2 的關鍵：必須拿到不同的鍵、各記一次差額
  j := fn_record_refund_reversal_atomic(v_order_a, 'e2e');
  IF j ->> 'outcome' <> 'already_reversed' THEN
    RAISE EXCEPTION 'E2E FAIL: A4 second reversal outcome=% (expected already_reversed)', j ->> 'outcome';
  END IF;

  j := fn_apply_refund_adjustment_atomic(v_order_a, 3000, 'e2e');
  SELECT sum(net_twd) INTO v_ledger FROM payout_items WHERE order_id = v_order_a;
  IF (j ->> 'refund_event_id') <> 'cum:6000' THEN
    RAISE EXCEPTION 'E2E FAIL: A4 event_id=% (expected cum:6000 — equal-amount refunds must not collide)',
      j ->> 'refund_event_id';
  END IF;
  IF (j ->> 'applied')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'E2E FAIL: A4 second equal refund was swallowed as duplicate';
  END IF;
  IF v_ledger <> floor(4000 * (1 - v_rate))::integer THEN
    RAISE EXCEPTION 'E2E FAIL: A4 ledger=% (expected floor(4000×(1-rate))=%)',
      v_ledger, floor(4000 * (1 - v_rate))::integer;
  END IF;
  IF (SELECT refund_amount_twd FROM operations_tracking WHERE order_id = v_order_a) <> 6000 THEN
    RAISE EXCEPTION 'E2E FAIL: A4 cumulative refund not accumulated (F1)';
  END IF;
  v_log := v_log || format('A4 refund#2(equal): ledger=%s key=%s cum=6000; ', v_ledger, j ->> 'refund_event_id');

  -- A5. 對帳重跑（delta=0）→ 冪等
  j := fn_apply_refund_adjustment_atomic(v_order_a, 0, 'e2e');
  IF (j ->> 'applied')::boolean IS NOT FALSE OR (j ->> 'delta_twd')::integer <> 0 THEN
    RAISE EXCEPTION 'E2E FAIL: A5 reconcile-only rerun was not idempotent (%)', j;
  END IF;
  v_log := v_log || 'A5 reconcile-rerun idempotent; ';

  -- A6. 補到全額退款 → 最終淨應付歸 0
  j := fn_apply_refund_adjustment_atomic(v_order_a, 4000, 'e2e');
  SELECT sum(net_twd) INTO v_ledger FROM payout_items WHERE order_id = v_order_a;
  IF v_ledger <> 0 THEN
    RAISE EXCEPTION 'E2E FAIL: A6 ledger after full refund=% (expected 0)', v_ledger;
  END IF;
  v_log := v_log || 'A6 full-refund ledger=0; ';

  -- ══ 情境 B：payout confirm ════════════════════════════════════════════════
  -- B1. 結算訂單 B（total 6000）
  SELECT * INTO r FROM fn_record_settlement_atomic(
    jsonb_build_array(jsonb_build_object('order_id', v_order_b, 'guide_id', v_guide,
                                         'gmv_twd', 6000, 'commission_twd', 900, 'net_twd', 5100)), now());
  IF r.settled_count <> 1 THEN
    RAISE EXCEPTION 'E2E FAIL: B1 settled_count=%', r.settled_count;
  END IF;

  SELECT balance_twd INTO v_bal FROM guide_balances WHERE guide_id = v_guide;
  v_log := v_log || format('B1 settle-B: balance=%s; ', v_bal);

  -- B2. 建 pending payout（金額 = 目前餘額）並確認出款
  INSERT INTO payouts (guide_id, total_twd) VALUES (v_guide, v_bal) RETURNING id INTO v_payout;

  SELECT to_jsonb(t) INTO j FROM fn_confirm_payout_atomic(v_payout, 'e2e', 'E2E-REF-1') t;
  IF (j ->> 'state') <> 'paid' OR (j ->> 'already_paid')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'E2E FAIL: B2 confirm result=%', j;
  END IF;
  IF (j ->> 'after_balance')::integer <> 0 THEN
    RAISE EXCEPTION 'E2E FAIL: B2 after_balance=% (expected 0)', j ->> 'after_balance';
  END IF;
  v_log := v_log || format('B2 confirm: %s->%s state=paid; ',
                           j ->> 'before_balance', j ->> 'after_balance');

  -- B3. 重送同一 payout → already_paid 且**不得**重扣
  SELECT to_jsonb(t) INTO j FROM fn_confirm_payout_atomic(v_payout, 'e2e', 'E2E-REF-1') t;
  SELECT balance_twd INTO v_bal FROM guide_balances WHERE guide_id = v_guide;
  IF (j ->> 'already_paid')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'E2E FAIL: B3 resend did not report already_paid (%)', j;
  END IF;
  IF v_bal <> 0 THEN
    RAISE EXCEPTION 'E2E FAIL: B3 balance=% after resend (double debit!)', v_bal;
  END IF;
  v_log := v_log || 'B3 confirm-resend no double debit; ';

  -- ══ 情境 C：fault injection —— 餘額不足必須 RAISE，不得靜默截斷 ═══════════
  INSERT INTO payouts (guide_id, total_twd) VALUES (v_guide, 999999) RETURNING id INTO v_payout;
  BEGIN
    PERFORM * FROM fn_confirm_payout_atomic(v_payout, 'e2e', 'E2E-REF-2');
    RAISE EXCEPTION 'E2E FAIL: C1 insufficient balance was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%insufficient guide balance%' THEN
      RAISE EXCEPTION 'E2E FAIL: C1 unexpected error: %', SQLERRM;
    END IF;
  END;
  SELECT balance_twd INTO v_bal FROM guide_balances WHERE guide_id = v_guide;
  IF v_bal <> 0 THEN
    RAISE EXCEPTION 'E2E FAIL: C1 balance changed to % after rejected confirm', v_bal;
  END IF;
  v_log := v_log || 'C1 insufficient-balance rejected, balance intact; ';

  -- ── 全部通過 ───────────────────────────────────────────────────────────────
  RAISE EXCEPTION 'E2E PASS (all assertions held; transaction rolled back) :: %', v_log;
END $$;
