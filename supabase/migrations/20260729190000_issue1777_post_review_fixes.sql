-- #1777 獨立審查後的修復（P0 ＋ P1）
--
-- 由三個 fresh-context 獨立 reviewer 於 2026-07-29 審查 #1777 變更後發現。
--
-- ── P0：ON CONFLICT 無法推論部分唯一索引（production 已 live，功能全停）──────
--
-- 20260729170000 把 payout_items_order_kind_unique 改成部分索引：
--     CREATE UNIQUE INDEX … (order_id, settlement_kind)
--       WHERE settlement_kind IN ('settlement','reversal')
-- 但 20260729160000 的 fn_record_settlement_atomic 仍用不帶 predicate 的
--     ON CONFLICT (order_id, settlement_kind) DO NOTHING
-- Postgres 無法把它推論到部分索引，直接 42P10。production 實測（EXPLAIN）：
--     ERROR: 42P10 there is no unique or exclusion constraint matching the
--            ON CONFLICT specification
-- 補上與索引一致的 predicate 後 EXPLAIN 正確顯示
--     Conflict Arbiter Indexes: payout_items_order_kind_unique
--
-- 影響：每日 02:00 UTC 的 settlement sweep 會整批失敗（fail-closed，不會算錯
-- 錢，但完全不結算）。fn_apply_refund_adjustment_atomic 未受影響——它的
-- ON CONFLICT 本來就帶了 predicate。
--
-- 本檔只改 fn_record_settlement_atomic 的那一行 ON CONFLICT；其餘邏輯逐字保持
-- 與 20260729160000 相同。
--
-- ── P1（無法在此修，已改走稽核防線）：supabase_admin 的 default privileges ──
--
-- 20260729180000 寫的是
--     ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
-- 未帶 FOR ROLE 時只影響「目前角色建立的物件」。production 實查 pg_default_acl：
--     grantor=postgres        → {postgres=X, service_role=X}                     ✅
--     grantor=supabase_admin  → {postgres=X, anon=X, authenticated=X, service_role=X}  ❌
-- 因此由 supabase_admin 建立的新函式仍會自動授權給 anon。
--
-- **為什麼這裡不修**：修它需要 `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin`，
-- 而該語句要求執行者是 supabase_admin 本人或其成員。production 實測：
--     current_user = postgres／is_member_of_supabase_admin = false／is_superuser = false
--     → ERROR 42501: permission denied to change default privileges
-- 且因 apply_migration 是單一交易，把它留在檔內會連帶讓上面的 P0 一起回滾。
--
-- **替代防線**（比改 default privileges 涵蓋更廣）：
--   tests/api/issue1777-function-grants-audit.test.mjs 直接稽核 production 上
--   所有 public.fn_* 的實際 ACL，任何一支對 anon／authenticated 開放即紅燈。
--   default privileges 只在「建立當下」生效；ACL 稽核則不論函式從哪個角色、
--   哪個管道（migration／Dashboard／擴充套件）建立都抓得到。
--
-- 若仍要收斂 default privileges 本身，須由 owner 在 Supabase Dashboard 以
-- supabase_admin 連線執行（見 docs/operations/issue1777-historical-data-proposal.md）。
--
-- 註：三支既有財務函式的權限本身是乾淨的（proacl 實查僅 postgres／service_role）。
--
-- 回滾：同名 .rollback.sql。

BEGIN;

-- ── P0 修復 ──────────────────────────────────────────────────────────────────

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

    IF v_order_status <> 'completed'
       OR v_order_paid_at IS NULL
       OR v_hold
       OR coalesce(v_order_total, 0) - v_refund <= 0 THEN
      v_rejected := v_rejected + 1;
      v_rejected_ids := array_append(v_rejected_ids, v_order_id);
      CONTINUE;
    END IF;

    -- P0 修復：predicate 必須與 payout_items_order_kind_unique 的部分索引一致，
    -- 否則 Postgres 無法推論該索引（42P10）。
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
