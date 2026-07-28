# Operations 文件索引

> `operations/` 同時保存可執行 runbook、任務 worklog、dated evidence 與自動產生的 bounded reports。四者用途不同，不能互相當成目前 runtime truth。
>
> Production action 必須依領域分流：DML 依 [`../../CLAUDE.md`](../../CLAUDE.md) 由 `sql-guard` audit 並立即回報影響；schema apply 走 `SQL-OVERRIDE` 與 migration SOP；付款、credential、restore、incident 走各自 runbook、operator／owner approval 與必要的 audit／rollback／containment gate。

## OPS 文件分類

| 類別 | 內容 | 狀態邊界 |
|---|---|---|
| `CURRENT EXECUTION` | live issue／PR、任務 worklog、目前 operator handoff | 先核對 live 狀態與 owner；不是由 README 靜態維護 |
| `OPS` | runbook、SOP、rollback、drill、release 操作 | 可執行流程，但不等於已獲 production mutation 授權 |
| `AUTO-GENERATED` | readiness／dashboard／latest reports | 由 generator 產生的 bounded snapshot，不是 live GitHub／DB／provider console |
| `QA` | dated QA report、sign-off、實跑輸出 | 只證明指定 SHA、環境與時間點 |
| `ARCHIVE` | 舊 runbook、closure、過往 drill | 只供歷史稽核，不能推導目前安全或 release 狀態 |

## 先讀入口

- [`../README.md`](../README.md) — `docs/` 總索引與任務路由
- [`worklogs/README.md`](worklogs/README.md) — 每個進行中 issue 的記憶錨點與更新規則
- [`reports/readiness-live-state-latest.md`](reports/readiness-live-state-latest.md) — auto-generated readiness snapshot
- [`current-issue-priority.md`](current-issue-priority.md) — bounded routing snapshot；使用前仍須查 live issue／PR
- [`../../.cursor/harness/07_testing_playbook.md`](../../.cursor/harness/07_testing_playbook.md) — QA、evidence 與 production gate 摘要

## 可執行 runbook

- [`booking-v2-rollback-runbook.md`](booking-v2-rollback-runbook.md) — Booking rollback 步驟；先讀文件中的 deprecated／owner permission 邊界，勿把歷史 flag 段落當現行 capability。
- [`booking-v2-daily-go-no-go.md`](booking-v2-daily-go-no-go.md) — daily go/no-go 節奏與證據欄位。
- [`migration-apply-ledger-sop.md`](migration-apply-ledger-sop.md) — backup → apply → verify → ledger 與 owner approval gate。
- [`supabase-backup-restore-runbook.md`](supabase-backup-restore-runbook.md) — backup／restore 操作與限制。
- [`ecpay-production-cutover.md`](ecpay-production-cutover.md) — ECPay production cutover 與驗證。
- [`monitoring-alert-drill-plan-2026-05-17.md`](monitoring-alert-drill-plan-2026-05-17.md) — monitoring／alert drill 參考。
- [`security/rls-grants-preflight-runbook.md`](security/rls-grants-preflight-runbook.md) — RLS／grant preflight。

Runbook 是程序契約，不是單獨的執行許可。若步驟會改 production：DML 先確認 `sql-guard` audit 與執行後影響回報；schema 先確認 `SQL-OVERRIDE`、timestamp migration、PR／CI 與 ledger；付款、credential、restore、incident 則先確認各自 runbook 要求的 operator／owner approval、權限與 audit／rollback／containment 證據。

## Worklog 與 evidence

- [`worklogs/README.md`](worklogs/README.md) — 依 issue 建立或接續 `issueNNNN.md`，記錄「絕不重做」與里程碑。
- [`reports/`](reports/) — bounded reports 與自動產生的 snapshot；檔名含日期不代表目前狀態。
- [`qa-reports/`](qa-reports/) — 繁體中文 QA evidence；需綁定 URL、head/deploy SHA、Asia/Taipei 時間與逐條 AC 結果，且不得含 secrets／token／未遮蔽 PII。
- [`../security/evidence-artifact-governance.md`](../security/evidence-artifact-governance.md) — evidence 分級、redaction 與保存規範。
- [`templates/`](templates/) 與 [`drills/`](drills/) — 可重用的演練模板；執行前仍需依 live issue／owner decision 補齊實際上下文。

## AUTO-GENERATED readiness snapshot

[`reports/readiness-live-state-latest.md`](reports/readiness-live-state-latest.md) 只保存 generator 規定範圍內的 issue／PR／readiness 摘要。它不是 live truth，也不應被其他 README 複製成固定數字。

```bash
npm run readiness:check
npm run readiness:snapshot
```

- 先跑 `npm run readiness:check` 判斷 freshness。
- snapshot 過期時，查 live `gh issue`／`gh pr`，或由 generator 重生；禁止直接手改 snapshot。
- 若 snapshot 與 live GitHub 不一致，live query、current issue／PR 與當次 command output 優先。
- `current-issue-priority.md` 同樣是 bounded routing aid，不可跳過 live re-check。

## Production／高風險邊界

- Migration 只增不改；先寫 timestamp migration，依 [`../../supabase/migrations/README.md`](../../supabase/migrations/README.md) 與本目錄 migration ledger SOP 走 PR／CI／核准流程。
- Production data remediation 的 DML 先做 read-only preflight，並依 `CLAUDE.md` 讓 `sql-guard` audit；執行後立即回報實際影響。技術 review 不等於 schema apply 的 `SQL-OVERRIDE`，也不等於付款、credential、restore 或 incident 的領域核准。
- Payment／ECPay、auth、RLS、secrets、credential rotation、restore 與 release cutover 不可因 runbook 已存在就自動執行；各自依 operator／owner approval、provider／runtime evidence 與對應 rollback／containment path。
- 完成任何 Ops 任務後，回到 live issue／PR、worklog、runtime evidence 與 reviewer gate；不要只以 dated report 的文字宣稱完成。
