-- Rollback：20260702_cron_job_controls.sql
-- App 端對兩表 fail-open（視為全部 enabled、run log 靜默略過），移除後功能安全退化。

drop index if exists idx_cron_run_log_job_finished;
drop table if exists cron_run_log;
drop table if exists cron_job_controls;
