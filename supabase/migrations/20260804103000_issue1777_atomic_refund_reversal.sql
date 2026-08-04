-- #1777 F4 — 退款紅沖收斂為單一交易（決策 C：atomic RPC 為唯一 writer）
--
-- 缺口：`recordRefundReversalDb`（apps/web/src/lib/db.mjs）是本 issue 四個缺口裡
-- 唯一沒被改掉的應用層 read-modify-write，而且**仍在 live 退款路徑上**
-- （refund-execute 的三個呼叫點 ＋ refund-requests 的自動執行）。
--
-- 它做了六件事，全部沒有交易、沒有鎖：
--   1. 讀 settlement 分錄
--   2. upsert reversal 分錄（ignoreDuplicates）
--   3. 讀回 reversal id
--   4. 讀 audit_logs 判斷「上次是不是做到一半」（自己用 status='started' 標記做崩潰復原）
--   5. **讀 guide_balances → 在 JS 算出新餘額 → 寫回絕對值**
--   6. 補寫兩筆 audit_logs
--
-- 第 5 步是核心問題：寫回的是**絕對值**而非增減量。
--   - 兩個併發 writer（sweep／另一筆退款／payout confirm）各自讀到同一個舊餘額，
--     後寫的那筆會把前一筆的變更整個蓋掉 —— 典型 lost update。
--   - 而且新餘額是從「可能已經過期的讀值」＋「audit marker 的歷史值」湊出來的，
--     湊法本身有三個分支（markerBefore／markerAfter／markerDebit 不一致時改用
--     currentBalance），任何一個分支判斷錯就把錯的絕對值寫進餘額。
--   - 第 2 步成功、第 5 步失敗 → reversal 分錄存在但餘額沒扣，而下次重跑因為
--     reversal 已存在會走 already_reversed，餘額**永久漏扣**（第 4 步的 marker
--     機制就是為了補這個洞而長出來的，但它自己也是非原子的）。
--
-- 修法：整包搬進 plpgsql，與 orders 的 FOR UPDATE 鎖同交易。
--   - 「是否已紅沖」直接交給 payout_items 的部分唯一索引判定
--     （INSERT … ON CONFLICT DO NOTHING RETURNING id），不再需要讀 audit 猜狀態；
--     只有真的插入新分錄才動餘額 ⇒ 天然冪等，marker 機制整個消失。
--   - 餘額改成 SQL 層增減（balance + delta），不再寫絕對值 ⇒ lost update 消失。
--   - before_balance 由 `after + debit` 反推，精確且不需要額外一次讀取。
--
-- 保留的既有語意（呼叫端契約不變）：
--   - 沒有 settlement 分錄 → pre_settlement，零寫入
--   - 已有 reversal 分錄 → already_reversed，零寫入、不重複扣款
--   - 餘額**允許扣成負數**（carry-forward，#449 既有行為），刻意不截斷成 0
--   - 兩筆 audit：payout_reversal_created ＋ guide_balance_debited_reversal
--
-- 行為上的一處收緊（刻意）：訂單不存在時 RAISE P0002。舊版不檢查 orders，
-- 會對孤兒 payout_item 照樣紅沖；新版因為要靠 orders 列加鎖，順帶把它擋成
-- fail-closed。
--
-- ON CONFLICT 的 predicate 必須與 payout_items_order_kind_unique 的部分索引一致
-- ——否則推論不到索引直接 42P10（#1777 前一次踩過，見 20260729190000）。
--
-- 回滾：同名 .rollback.sql。

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_record_refund_reversal_atomic(
  p_order_id uuid,
  p_actor text DEFAULT 'system'
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_settlement_id uuid;
  v_guide_id uuid;
  v_gmv integer;
  v_commission integer;
  v_net integer;
  v_rules_version text;
  v_reversal_id uuid;
  v_debit integer;
  v_before integer;
  v_after integer;
  v_now timestamptz := now();
  v_actor text := coalesce(nullif(btrim(p_actor), ''), 'system');
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'orderId is required' USING ERRCODE = '22023';
  END IF;

  -- 鎖訂單：與 settlement sweep／refund adjustment 走同一把鎖，序列化同一訂單上
  -- 的所有帳務寫入。
  PERFORM 1 FROM orders o WHERE o.id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT pi.id, pi.guide_id, pi.gmv_twd, pi.commission_twd, pi.net_twd, pi.rules_version
    INTO v_settlement_id, v_guide_id, v_gmv, v_commission, v_net, v_rules_version
  FROM payout_items pi
  WHERE pi.order_id = p_order_id
    AND pi.settlement_kind = 'settlement';

  -- 尚未結算：退款由 sweep 的 effective-gmv 直接處理，這裡不介入（零寫入）。
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'pre_settlement');
  END IF;

  -- 冪等就是這一句：只有真正插入新分錄才會往下動餘額。
  -- predicate 必須與 payout_items_order_kind_unique 一致，否則 42P10。
  INSERT INTO payout_items (
    order_id, guide_id, gmv_twd, commission_twd, net_twd,
    rules_version, settlement_kind, settled_at
  )
  VALUES (
    p_order_id,
    v_guide_id,
    -coalesce(v_gmv, 0),
    -coalesce(v_commission, 0),
    -coalesce(v_net, 0),
    coalesce(v_rules_version, 'v1'),
    'reversal',
    v_now
  )
  ON CONFLICT (order_id, settlement_kind)
    WHERE settlement_kind IN ('settlement', 'reversal')
    DO NOTHING
  RETURNING id INTO v_reversal_id;

  IF v_reversal_id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'already_reversed');
  END IF;

  -- 餘額以 SQL 層增減（balance + delta），不是應用層算好的絕對值 —— 這是 F4 的修法。
  -- 刻意允許扣成負數：那代表錢已經付出去了，必須留下欠款而非靜默截成 0（#449）。
  v_debit := abs(coalesce(v_net, 0));

  INSERT INTO guide_balances (guide_id, balance_twd, updated_at)
  VALUES (v_guide_id, -v_debit, v_now)
  ON CONFLICT (guide_id) DO UPDATE
    SET balance_twd = guide_balances.balance_twd + EXCLUDED.balance_twd,
        updated_at = EXCLUDED.updated_at
  RETURNING balance_twd INTO v_after;

  -- 由結果反推扣款前餘額：精確（不受併發影響）且省一次讀取。
  v_before := v_after + v_debit;

  INSERT INTO audit_logs (order_id, actor, action, metadata)
  VALUES (
    p_order_id,
    v_actor,
    'payout_reversal_created',
    jsonb_build_object(
      'order_id', p_order_id,
      'guide_id', v_guide_id,
      'net_twd', v_net,
      'reversal_id', v_reversal_id,
      'settlement_id', v_settlement_id,
      'settled_at', v_now
    )
  );

  INSERT INTO audit_logs (order_id, actor, action, metadata)
  VALUES (
    p_order_id,
    v_actor,
    'guide_balance_debited_reversal',
    jsonb_build_object(
      'order_id', p_order_id,
      'guide_id', v_guide_id,
      'before_balance', v_before,
      'after_balance', v_after,
      'debit', v_debit,
      'reversal_id', v_reversal_id,
      'settlement_id', v_settlement_id,
      'status', 'completed'
    )
  );

  RETURN jsonb_build_object(
    'outcome', 'reversed',
    'reversal_id', v_reversal_id,
    'guide_id', v_guide_id,
    'settlement_id', v_settlement_id,
    'debit', v_debit,
    'before_balance', v_before,
    'after_balance', v_after
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_record_refund_reversal_atomic(uuid, text)
  FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.fn_record_refund_reversal_atomic(uuid, text) TO service_role;

COMMIT;
