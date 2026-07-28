# Implementation 文件索引

> `implementation/` 保存多數以 issue 或日期為界的 contract、rollout skeleton、release checklist 與工程 handoff。
>
> 這些文件是 `TECHNICAL CONTRACT` 或 `CURRENT EXECUTION` 的輔助材料，不是 runtime truth，也不會自動形成目前 backlog。

## CURRENT EXECUTION

1. 先用 live GitHub issue／PR 確認 scope、Acceptance criteria、review、checks 與目前狀態。
2. 再讀對應的 issue/date-bounded contract 與本任務 worklog（見 [`../operations/worklogs/README.md`](../operations/worklogs/README.md)）。
3. 最後回到現行 code、tests、migrations 與實際 CI／preview evidence；若 contract 與實作衝突，不能只更新索引來掩蓋差異。

## TECHNICAL CONTRACT

### Rollout／release 入口

- [`issue-96-rollout-contract.md`](issue-96-rollout-contract.md) — rollout contract 參考；目前執行狀態仍以 live issue／PR 為準。
- [`issue-96-phase-b1-contract.md`](issue-96-phase-b1-contract.md) — 分階段 contract。
- [`issue-181-line-liff-go-no-go-readiness.md`](issue-181-line-liff-go-no-go-readiness.md) — LINE／LIFF Go／No-Go readiness contract。
- [`release-checklist.md`](release-checklist.md) — release checklist。
- [`release-commands.md`](release-commands.md) — release command 參考。
- [`vercel-deploy-checklist.md`](vercel-deploy-checklist.md) — deploy checklist。

### Booking／availability／data contract

- [`issue-619-v2-availability-source-of-truth.md`](issue-619-v2-availability-source-of-truth.md) — V2 availability source-of-truth 與 legacy fallback 邊界。
- [`phase-12-mainline-matrix.md`](phase-12-mainline-matrix.md) — dated mainline matrix；只作背景與交接索引。
- [`phase-12-audit-coverage-matrix.md`](phase-12-audit-coverage-matrix.md) — dated coverage matrix；驗收需回到 current tests／CI。
- [`mvp-web-architecture.md`](mvp-web-architecture.md) — MVP 架構背景，不取代現行 app 結構。

## 執行真值

| 類別 | 索引文件可提供 | 必須回查 |
|---|---|---|
| API／backend | endpoint、contract、邊界與驗收意圖 | live issue／PR、`apps/web/app/api/**`、`apps/web/src/lib/**`、focused tests |
| DB／migration | schema／migration 設計與 rollout 順序 | `supabase/migrations/**`、migration ledger、核准的 live probe |
| Release／rollout | checklist、go/no-go 欄位與 rollback 入口 | current deployment／CI／preview、runtime evidence、owner decision |
| QA／evidence | 建議測試與證據欄位 | current head SHA、實際 command output、CI／preview／live result |

API／DB 任務先讀 [`../04-tech/README.md`](../04-tech/README.md) 與 [`../../CLAUDE.md`](../../CLAUDE.md)；migration 命名與 apply gate 讀 [`../../supabase/migrations/README.md`](../../supabase/migrations/README.md) 及 [`../operations/migration-apply-ledger-sop.md`](../operations/migration-apply-ledger-sop.md)。

## 不可誤用

- Issue number 或日期出現在檔名，不代表該 issue 仍 open，也不代表它是目前優先工作。
- Contract 內的數字、Phase、路由與 status 若沒有 current code／tests／live evidence 支持，不得當作目前產品狀態。
- 不要把歷史 rollout checklist 當成 production action 授權。DML 須依 `CLAUDE.md` 由 `sql-guard` audit 並立即回報影響；schema apply 須有 `SQL-OVERRIDE` 並依 migration SOP；付款、credential／secret、restore、incident 則依各自 runbook 的 operator／owner approval、reviewer、audit 或 rollback／containment gate。
- 不在此目錄複製 readiness snapshot 的即時數字；請到 [`../operations/README.md`](../operations/README.md) 查 freshness 與 live-state 路由。
