# Tour Platform 文件總索引

> 本檔是 `docs/` 的穩定導航與任務路由。它不保存 open issue／PR 數量、當前 issue number、Phase 百分比或其他容易漂移的 live state。
>
> Agent 開工順序仍以 [`../CLAUDE.md`](../CLAUDE.md) → [`.cursor/harness/00_INDEX.md`](../.cursor/harness/00_INDEX.md) 為準；本檔負責把任務導到正確的文件類別與真值來源。

## 先看這些

- [`../README.md`](../README.md) — 品牌與 repo 穩定入口
- [`../CLAUDE.md`](../CLAUDE.md) — 工程治理、凍結區、migration 與測試鐵律
- [`../BRAND_BOOK.md`](../BRAND_BOOK.md) — UI／文案／品牌真值
- [`.cursor/harness/00_INDEX.md`](../.cursor/harness/00_INDEX.md) — session 開機順序與 harness 路由
- [`04-tech/README.md`](04-tech/README.md) — 技術文件與 runtime 真值邊界
- [`implementation/README.md`](implementation/README.md) — issue/date-bounded implementation contract
- [`operations/README.md`](operations/README.md) — runbook、worklog、readiness 與 evidence
- [`qa/README.md`](qa/README.md) — QA policy、測試指令與 dated evidence 邊界
- [`04-tech/04-tech-architecture/17-testing-strategy-and-agent-standard.md`](04-tech/04-tech-architecture/17-testing-strategy-and-agent-standard.md) — 測試充分性、分層、去重與停止條件
- [`security/README.md`](security/README.md) — incident/security 文件與 redaction 邊界

## 文件狀態標籤

使用下列固定詞彙閱讀文件；標籤描述文件用途，不代表文件內的每一段文字都仍然是最新狀態。

| 狀態 | 用途 | 不可誤讀為 |
|---|---|---|
| `CURRENT EXECUTION` | live issue／PR、該任務 worklog、目前可執行交接 | 穩定 README 內的靜態 backlog |
| `TECHNICAL CONTRACT` | 架構、API、資料模型、implementation contract 與治理規則 | production schema 或 runtime 行為的唯一真值 |
| `QA` | testing playbook、package scripts、E2E、focused test 與帶 SHA 的驗證結果 | 沒有實跑證據的「應該會過」 |
| `OPS` | runbook、worklog、release／rollback、operator evidence | 可自動執行的 production mutation 授權 |
| `PRODUCT / BUSINESS CONTEXT` | strategy、product、design、business、legal、transformation 背景 | 沒有 owner decision 的工程 queue |
| `AUTO-GENERATED` | bounded snapshot 或 generator 產出的狀態摘要 | live GitHub、live DB、runtime/provider console |
| `ARCHIVE` | 歷史背景、closure、過往 evidence | 目前安全、目前 backlog 或目前 release 狀態 |

## 任務路由矩陣

從 root README 到本檔後，沿著「首讀 → 次讀 → 真值來源」走；最多兩跳即可抵達首讀文件。若首讀文件與現行實作衝突，停止猜測並回到真值來源。

| 任務類型 | 首讀 | 次讀 | 真值來源 |
|---|---|---|---|
| API／DB | [`../CLAUDE.md`](../CLAUDE.md) + [`04-tech/README.md`](04-tech/README.md) | [`implementation/README.md`](implementation/README.md)、[`../supabase/migrations/README.md`](../supabase/migrations/README.md)、對應 migration SOP | live issue／PR + `apps/web/app/api/**`、`apps/web/src/lib/**`、`supabase/migrations/**`、focused tests |
| UI／互動 | [`../CLAUDE.md`](../CLAUDE.md) + [`../BRAND_BOOK.md`](../BRAND_BOOK.md) | [`.cursor/harness/07_testing_playbook.md`](../.cursor/harness/07_testing_playbook.md)、[`04-tech/04-tech-architecture/11-frontend-perf-pitfalls.md`](04-tech/04-tech-architecture/11-frontend-perf-pitfalls.md)、相關 product/design | live issue／PR + `apps/web/app/**`、components、Playwright／E2E output |
| QA／測試設計 | [`04-tech/04-tech-architecture/17-testing-strategy-and-agent-standard.md`](04-tech/04-tech-architecture/17-testing-strategy-and-agent-standard.md) + [`.cursor/harness/07_testing_playbook.md`](../.cursor/harness/07_testing_playbook.md) | [`qa/README.md`](qa/README.md)、[`../apps/web/e2e/README.md`](../apps/web/e2e/README.md)、[`../scripts/qa/README.md`](../scripts/qa/README.md) | issue AC + current head SHA + actual test／CI／preview result；owner layer完整矩陣與consumer seam不重複 |
| Ops／release | [`operations/README.md`](operations/README.md) + 對應 runbook | `operations/worklogs/`、`operations/reports/`、`operations/qa-reports/` | live issue／PR + runtime／provider console + fresh generated/evidence output；依 action domain 分流至 DML audit、schema `SQL-OVERRIDE`／migration SOP，或付款、credential、restore、incident 的既有 gate |
| 產品／roadmap | [`07-transformation/midao-travel-hotcake-transformation-plan.md`](07-transformation/midao-travel-hotcake-transformation-plan.md) | [`01-strategy/README.md`](01-strategy/README.md)、`02-product/`、`05-business/`、`06-legal/` | owner-approved live issue／decision；未被接受的 roadmap 只作 context/proposal |
| Incident／security | [`../CLAUDE.md`](../CLAUDE.md) + [`security/README.md`](security/README.md) | [`../.cursor/harness/01_diagnostics.md`](../.cursor/harness/01_diagnostics.md)、[`security/evidence-artifact-governance.md`](security/evidence-artifact-governance.md)、對應 runbook | live security issue + 現行 guards/config + redacted evidence；高風險 side effect 不得自行執行 |

## CURRENT EXECUTION

目前執行狀態應從 live GitHub issue／PR、Kanban task 與該任務 worklog 取得。`docs/` 的索引不複製 queue，也不把歷史 issue number 當成目前優先順序。

- Issue／PR：先用 live `gh issue view`／`gh pr view` 驗證狀態、AC、review 與 checks。
- Worklog：依 [`operations/worklogs/README.md`](operations/worklogs/README.md) 建立或接續 `issueNNNN.md`；它是任務記憶錨點，不是產品 runtime truth。
- 目前程式行為：回到 `apps/web/` 的現行 route、component、service、tests。
- 目前資料庫：回到 `supabase/migrations/`、migration ledger、必要時使用核准的 live probe。

## TECHNICAL CONTRACT

- [`04-tech/README.md`](04-tech/README.md) 是技術文件入口，明確區分 design／contract 與 code／tests／migrations 真值。
- [`implementation/README.md`](implementation/README.md) 收 issue/date-bounded contract；先核對 live issue／PR，再讀 contract。
- [`../supabase/migrations/README.md`](../supabase/migrations/README.md) 定義新 migration 的 timestamp 命名與 rollback 期待；既有 migration 不因索引工作重寫。
- 技術文件不能取代 production schema、現行 API wiring 或 focused regression tests。

## QA

- QA policy 首指 [`.cursor/harness/07_testing_playbook.md`](../.cursor/harness/07_testing_playbook.md)。
- 測試選擇、充分性、分層、去重與停止條件首指 [`測試策略與 Agent 施工規範`](04-tech/04-tech-architecture/17-testing-strategy-and-agent-standard.md)。
- [`qa/README.md`](qa/README.md) 定義 root／app scripts、E2E、QA script 與 dated evidence 的邊界。
- `docs/qa/**` 與 `docs/operations/qa-reports/**` 多為帶日期的 checklist／evidence；只有與 current head SHA、CI、preview 或 live output 綁定時，才能支持目前驗收結論。

## OPS

- [`operations/README.md`](operations/README.md) 定義 runbook、worklog、reports 與 auto-generated snapshot 的差異。
- [`operations/reports/readiness-live-state-latest.md`](operations/reports/readiness-live-state-latest.md) 是產生器輸出的 bounded snapshot；先跑 `npm run readiness:check`，過期則執行 `npm run readiness:snapshot` 或查 live GitHub。
- `operations/` 內的 production action 不使用 blanket approval 規則：DML 依 `CLAUDE.md` 走 `sql-guard` audit 並立即回報影響；schema apply 走 `SQL-OVERRIDE` 與 [`operations/migration-apply-ledger-sop.md`](operations/migration-apply-ledger-sop.md)；付款、credential、restore、incident 各自依對應 runbook、operator／owner approval、audit 與 rollback／containment 證據執行。

## PRODUCT / BUSINESS CONTEXT

- [`01-strategy/README.md`](01-strategy/README.md)、[`02-product/README.md`](02-product/README.md)、[`03-design/README.md`](03-design/README.md)、[`05-business/README.md`](05-business/README.md)、[`06-legal/README.md`](06-legal/README.md)、[`07-transformation/midao-travel-hotcake-transformation-plan.md`](07-transformation/midao-travel-hotcake-transformation-plan.md) 保存 context／proposal／decision 背景。
- 這些文件不自動形成 engineering backlog；執行優先順序必須回到 owner-approved live issue／decision。

## AUTO-GENERATED

- [`operations/reports/readiness-live-state-latest.md`](operations/reports/readiness-live-state-latest.md) 由 `npm run readiness:snapshot` 產生，header timestamp 與 `npm run readiness:check` 決定 freshness。
- Snapshot 過期時不得手改數字，也不得把舊數字寫回其他 README；請重生或直接查 live GitHub。
- `operations/current-issue-priority.md` 是 bounded routing snapshot，使用前仍須重新查 live issue／PR。

## ARCHIVE

- [`99-archive/README.md`](99-archive/README.md) 與各 dated closure／evidence 文件只供考古、稽核與背景理解。
- Archive 不可用來推論目前 backlog、目前安全狀態、目前 schema 或目前 release／rollout 狀態。

## 維護規則

1. 新增 README 前先確認它提供穩定路由，而不是複製 live state。
2. 優先補領域索引與真值邊界，不批量重寫歷史文件。
3. 相對 Markdown link 必須指向現存檔案或目錄；提交前執行 link scan 與 `git diff --check`。
4. 任何與 production、付款、auth、security、RLS、migration 或 secrets 有關的文件，只能描述核准流程，不得在索引內放入 secrets、PII 或未核准操作指令。
