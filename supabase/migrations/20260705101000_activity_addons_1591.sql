-- Issue #1591 — 加購（add-on）：活動加購項目＋訂單加購快照。
-- activity_addons：導遊/admin 維護的加購選項。order_addons：下單當下的價格快照（不隨後續改價變動）。

CREATE TABLE IF NOT EXISTS activity_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_twd integer NOT NULL CHECK (price_twd >= 0),
  unit text NOT NULL DEFAULT 'per_person' CHECK (unit IN ('per_person', 'per_group')),
  stock integer,                          -- NULL = 不限
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_addons_activity ON activity_addons(activity_id, sort_order);

CREATE TABLE IF NOT EXISTS order_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  addon_id uuid NOT NULL REFERENCES activity_addons(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_twd integer NOT NULL CHECK (unit_price_twd >= 0),  -- 下單當下快照
  subtotal_twd integer NOT NULL CHECK (subtotal_twd >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_addons_order ON order_addons(order_id);

ALTER TABLE activity_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_addons ENABLE ROW LEVEL SECURITY;

-- activity_addons：公開可讀 is_active（旅客選購頁）；寫入走 service_role
CREATE POLICY activity_addons_select_active ON activity_addons
  FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY activity_addons_service_all ON activity_addons
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- order_addons：service_role only（跟訂單同等敏感，經 API 讀）
CREATE POLICY order_addons_service_all ON order_addons
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE activity_addons IS '#1591 活動加購項目';
COMMENT ON TABLE order_addons IS '#1591 訂單加購快照';
