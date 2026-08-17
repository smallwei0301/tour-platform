# Issue 1841 工作紀錄

## 範圍

在資源足夠且隔離的 CI runner 上，執行 #1825 套用前唯一剩餘的 gate：
`apps/web/tests/integration/midao-legacy-draft-materialization-postgres.test.mjs`
精確 PostgreSQL replay。

本任務不授權 Production migration apply、DDL/DML、ledger 更新、部署、
acceptance 修改或 Issue 關閉。

## 不可變輸入

- 被測 commit：`fbc0f65628d3df4e1caf5c2bca15c1744081d320`
- Migration：`supabase/migrations/20260813085910_issue1825_legacy_midao_draft_materialization.sql`
- Migration SHA-256：`4ea5094f497e953076d41b3e8f878b331398f66f6694f5e2145dc1a845612ff9`
- Supabase CLI：`2.87.2`
- PostgreSQL server image：`public.ecr.aws/supabase/postgres:17.6.1.104`
- PostgreSQL server image digest：
  `sha256:5deba92e50cd17bfacf8603834d317cdf3bfc1c016ec8293991997fa3b55fa3d`

## 執行方式

PR #1842 新增一支只供驗證的 workflow；在讀取或執行 repo 程式碼前，
一律 checkout 到上述不可變 commit。

第一次執行已證明精確測試 4/4 PASS，但外部清理斷言把 runner 有意保留、
且已釋放的 kernel lock metadata 誤判為殘留，因此 job 正確維持紅燈。
後續修正為要求 `released=true`；containers、networks 與 volumes 仍須完全不存在。

雙軸 code review 另發現：原證據雖有 PostgreSQL image identity，卻未直接輸出
server version。Workflow 已補上執行 pinned image 的 `postgres --version`，
並記錄 `postgres (PostgreSQL) 17.6`。

## 最終驗證

- Workflow source commit：`f90000f20ebf1d49a5533066a033e4e74c0566cb`
- Run：https://github.com/smallwei0301/tour-platform/actions/runs/31998401725
- Job：https://github.com/smallwei0301/tour-platform/actions/runs/31998401725/job/95294116786
- Artifact：https://github.com/smallwei0301/tour-platform/actions/runs/31998401725/artifacts/9277602514
- Artifact digest：
  `sha256:73459fa40df55ce4bfe2dd152324b642a374f5bd612fb60000b14c62d1f76e0b`
- 精確測試：`tests 4`、`pass 4`、`fail 0`、exit `0`
- PostgreSQL server：`postgres (PostgreSQL) 17.6`
- Supabase CLI：`2.87.2`
- 執行後專案 containers：none
- 執行後專案 networks：none
- 執行後專案 volumes：none
- Kernel runner lock：released
- Cleanup exit：`0`

完成收據已回報到 Issue #1825：
https://github.com/smallwei0301/tour-platform/issues/1825#issuecomment-5312236805

## 最終狀態

#1841 的 exact replay 證據已完成。PR #1842 維持 draft evidence PR；
沒有 owner 另行指示前不得合併。Issue #1825 維持 OPEN。
本次未執行任何 Production mutation。
