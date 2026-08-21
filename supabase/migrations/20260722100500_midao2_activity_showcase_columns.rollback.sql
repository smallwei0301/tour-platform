-- Rollback for 20260722100500_midao2_activity_showcase_columns.sql
-- 依 migration-apply-ledger-sop.md：執行前先確認備份點；執行後把 ledger record 改回 pending 並註明原因。
ALTER TABLE activities DROP COLUMN IF EXISTS midao_status;
ALTER TABLE activities DROP COLUMN IF EXISTS midao_deal_mode;
ALTER TABLE activities DROP COLUMN IF EXISTS midao_questions;
ALTER TABLE activities DROP COLUMN IF EXISTS languages;
ALTER TABLE activities DROP COLUMN IF EXISTS midao_sort_order;
ALTER TABLE guide_profiles DROP COLUMN IF EXISTS experience_years;
