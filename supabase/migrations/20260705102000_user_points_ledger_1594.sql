-- Issue #1594 — 點數/會員：append-only ledger。餘額永遠由 ledger 加總（含效期），不存快照欄位。
-- earn 為正（帶 expires_at）；redeem / expire / 退款回收 為負。冪等以 (reason, order_id) 唯一約束擋重複發點。

CREATE TABLE IF NOT EXISTS user_points_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta integer NOT NULL,                 -- 正=獲得、負=折抵/回收/過期
  reason text NOT NULL CHECK (reason IN ('earn_order', 'redeem_order', 'expire', 'refund_reclaim', 'adjust')),
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  expires_at timestamptz,                 -- 僅 earn 有效期
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_points_ledger_user ON user_points_ledger(user_id, created_at);
-- 冪等：同一訂單的 earn 只發一次（redeem 亦然）
CREATE UNIQUE INDEX IF NOT EXISTS uq_points_earn_per_order
  ON user_points_ledger(order_id, reason) WHERE reason IN ('earn_order', 'redeem_order');

ALTER TABLE user_points_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY points_ledger_select_own ON user_points_ledger
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY points_ledger_service_all ON user_points_ledger
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE user_points_ledger IS '#1594 點數 append-only ledger（餘額由加總得出）';
