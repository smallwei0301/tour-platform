-- Rollback for 20260722100000_midao2_requests_availability.sql
-- 依 migration-apply-ledger-sop.md：執行前先確認備份點；執行後把 ledger record 改回 pending 並註明原因。
DROP TABLE IF EXISTS midao_day_overrides;
DROP TABLE IF EXISTS midao_availability_defaults;
DROP TABLE IF EXISTS midao_requests;
