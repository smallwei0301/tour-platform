-- Rollback for 20260723090000_midao2_request_plan_columns.sql
-- 依 migration-apply-ledger-sop.md：執行前先確認備份點；執行後把 ledger record 改回 pending 並註明原因。
ALTER TABLE midao_requests DROP COLUMN IF EXISTS plan_id;
ALTER TABLE midao_requests DROP COLUMN IF EXISTS plan_title_snapshot;
