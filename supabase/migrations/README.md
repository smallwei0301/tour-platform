# Migrations 命名與執行規範

- **新 migration 一律 timestamp 制**（`YYYYMMDDHHmm_<issue 或主題>.sql`，例：`20260409xxxx_issue1234_xxx.sql`）。早期的編號制（`001_…`–`022_…`）為歷史遺留，不要再新增編號制檔案。
- Canonical 的 migration／rollback 執行流程見 `docs/operations/booking-v2-rollback-runbook.md`（Supabase CLI 為準）。
- Root 目錄過去的一次性 scratch scripts（`apply_migrations.sh`、`execute-migrations.*`、`auto-migrate-*`）已於 #1377 移除，請勿復刻該模式。
