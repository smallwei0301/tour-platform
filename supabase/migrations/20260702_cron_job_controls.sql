-- 排程工作流後台控制台（admin cron console）
-- 1) cron_job_controls — 每支 internal sweep job 的啟用開關（admin 可停用）
-- 2) cron_run_log      — 每次執行的 outcome 與彙總（僅計數/旗標，不存 PII）
--
-- 兩表僅 service-role 存取（啟用 RLS、不建 anon/authenticated policy）。
-- App 端 fail-open：表不存在或讀取失敗時 job 一律視為 enabled、run log 只 warn，
-- 因此本 migration 未套用前功能仍安全運作（僅後台顯示空資料）。

create table if not exists cron_job_controls (
  job_key text primary key,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by text,
  reason text
);

create table if not exists cron_run_log (
  id bigint generated always as identity primary key,
  job_key text not null,
  outcome text not null check (outcome in ('success', 'error', 'skipped_by_admin')),
  summary jsonb,
  source text not null default 'schedule',
  started_at timestamptz not null,
  finished_at timestamptz not null default now()
);

create index if not exists idx_cron_run_log_job_finished
  on cron_run_log (job_key, finished_at desc);

alter table cron_job_controls enable row level security;
alter table cron_run_log enable row level security;
