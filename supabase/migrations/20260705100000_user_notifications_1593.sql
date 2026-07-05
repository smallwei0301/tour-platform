-- Issue #1593 — 站內通知中心：user_notifications 表。
-- 站內事件（留言回覆／改期結果／訂單狀態）寫一筆通知，旅客站內鈴鐺可見＋標已讀。
-- RLS：使用者只能讀寫自己的通知（對齊 #1563 收斂後的 service_role/authenticated 模式）。

CREATE TABLE IF NOT EXISTS user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('message_reply', 'reschedule_result', 'order_status', 'review_invited')),
  title text NOT NULL,
  body text,
  link_path text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created
  ON user_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_notifications_unread
  ON user_notifications(user_id) WHERE read_at IS NULL;

ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;

-- 讀：本人可讀自己的（authenticated，比對 auth.uid()）
CREATE POLICY user_notifications_select_own ON user_notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 更新（標已讀）：本人可更新自己的
CREATE POLICY user_notifications_update_own ON user_notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 寫入由 service_role（server 掛點）進行；不開放 anon/authenticated INSERT
CREATE POLICY user_notifications_service_all ON user_notifications
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE user_notifications IS '#1593 站內通知中心';
