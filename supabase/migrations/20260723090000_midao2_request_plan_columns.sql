-- 20260723090000_midao2_request_plan_columns.sql
-- Plan 3：需求單記錄旅客所選方案（輕量：id＋名稱快照）。只增不改。
ALTER TABLE midao_requests ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES activity_plans(id) ON DELETE SET NULL;
ALTER TABLE midao_requests ADD COLUMN IF NOT EXISTS plan_title_snapshot text;
