# 技術文件索引

> 本檔是 `docs/04-tech/` 的技術入口，不保存目前 route 數量、migration 數量、Phase 百分比或 dated release status。
>
> 技術文件是設計與契約的導航；若內容與現行 code、tests、migrations、live issue／PR 或 runtime evidence 衝突，先停止引用文件，回到真值來源驗證。

## TECHNICAL CONTRACT

### 技術架構入口

- [`04-tech-architecture/README.md`](04-tech-architecture/README.md) — 詳細架構背景與歷史設計索引；其中的版本、示意 schema、route 說明仍需對照現行實作。
- [`04-tech-architecture/01-system-diagram.md`](04-tech-architecture/01-system-diagram.md) — 系統邊界與元件圖。
- [`04-tech-architecture/11-frontend-perf-pitfalls.md`](04-tech-architecture/11-frontend-perf-pitfalls.md) — 前端效能與 SSR／資源載入風險。
- [`04-tech-architecture/15-architecture-modularity-review.md`](04-tech-architecture/15-architecture-modularity-review.md) — 模組邊界與架構檢視。
- [`04-tech-architecture/17-testing-strategy-and-agent-standard.md`](04-tech-architecture/17-testing-strategy-and-agent-standard.md) — 測試充分性、分層、去重、真DB／瀏覽器門檻與Agent停止條件。

### API／Booking／Payment

- [`04-tech-architecture/10-api-spec-v2-booking-pos.md`](04-tech-architecture/10-api-spec-v2-booking-pos.md) — V2 Booking／Order／Payment API contract；新 API 以 `apps/web/app/api/v2/**` 現行 wiring 為準。
- [`04-tech-architecture/12-payment-callback-atomicity.md`](04-tech-architecture/12-payment-callback-atomicity.md) — payment callback 原子性與狀態鏈約束。
- [`04-tech-architecture/14-availability-copy-cross-surface-decision.md`](04-tech-architecture/14-availability-copy-cross-surface-decision.md) — availability 文案跨介面決策。
- [`../implementation/issue-619-v2-availability-source-of-truth.md`](../implementation/issue-619-v2-availability-source-of-truth.md) — V2 availability source-of-truth contract；實作仍以現行 route、resolver 與 tests 驗證。

### Schema／Migration

- [`04-tech-architecture/02-database-schema.md`](04-tech-architecture/02-database-schema.md) — schema 設計參考，不是 production schema 唯一真值。
- [`04-tech-architecture/03-api-spec.md`](04-tech-architecture/03-api-spec.md) — 舊版 API 設計參考；不可覆蓋現行 V2 route contract。
- [`../../supabase/migrations/README.md`](../../supabase/migrations/README.md) — 新 migration timestamp 命名與 rollback 規範。
- [`../operations/migration-apply-ledger-sop.md`](../operations/migration-apply-ledger-sop.md) — production schema apply 的 backup／verify／ledger／owner approval gate。
- [`../implementation/README.md`](../implementation/README.md) — implementation contract 與 live issue／PR 對照方式。

## 真值來源

| 問題 | 先看 | 真值 |
|---|---|---|
| API route 是否存在、如何驗證與回應 | [`../../apps/web/app/api/v2/orders/route.ts`](../../apps/web/app/api/v2/orders/route.ts) 及同域 route | current `apps/web/app/api/**`、route tests、live issue／PR、CI |
| DB gateway 行為 | [`../../apps/web/src/lib/db.mjs`](../../apps/web/src/lib/db.mjs) | current domain gateway、Supabase 分支與 in-memory fallback、契約／focused tests |
| production schema | [`../../supabase/migrations/README.md`](../../supabase/migrations/README.md) | migration files、ledger、核准的 live schema probe；設計文件不可單獨取代 |
| payment callback 狀態鏈 | [`04-tech-architecture/12-payment-callback-atomicity.md`](04-tech-architecture/12-payment-callback-atomicity.md) | current callback code、payment／booking tests、核准的 preview／live evidence |
| availability | [`../implementation/issue-619-v2-availability-source-of-truth.md`](../implementation/issue-619-v2-availability-source-of-truth.md) | current resolver／route、availability tests、live issue／PR |

## API／DB 開工邊界

- 先讀 [`../../CLAUDE.md`](../../CLAUDE.md) 的凍結區與 migration 規則，再確認 issue／PR scope。
- 新 API 一律走 V2 route；不要以索引、舊版設計或 legacy availability snapshot 推測目前行為。
- 新資料存取函式優先放在 domain module；`db.mjs` 的既有 guard、fallback contract 與行數 ceiling 必須遵守。
- 新 migration 只增不改，檔名遵守 [`../../supabase/migrations/README.md`](../../supabase/migrations/README.md)；任何 production apply 走 [`../operations/migration-apply-ledger-sop.md`](../operations/migration-apply-ledger-sop.md)。
- 付款、auth、RLS、secrets 與 production schema 是高風險領域；付款、credential／secret、restore 與 incident 依各自 runbook 的 operator／owner approval、audit 或 rollback／containment gate；production DML 依 `CLAUDE.md` 走 `sql-guard` audit，schema apply 則走 `SQL-OVERRIDE` 與 migration SOP，不能混用成單一 approval 規則。

## QA 對接

- Backend／API任務先依 [`測試策略與 Agent 施工規範`](04-tech-architecture/17-testing-strategy-and-agent-standard.md)選擇owner layer與最小seam，再依 [`.cursor/harness/07_testing_playbook.md`](../../.cursor/harness/07_testing_playbook.md)執行focused regression並按風險擴大。
- 代表性契約／防回歸檢查包括 [`../../apps/web/tests/unit/db-mjs-size-guard.test.mjs`](../../apps/web/tests/unit/db-mjs-size-guard.test.mjs)；實際應跑哪些 tests 由 issue AC 與變更範圍決定。
- UI 或 API↔UI hybrid 任務不可只靠 source-contract 代替必要的 Playwright／preview evidence，詳見 [`../qa/README.md`](../qa/README.md)。

## 歷史背景

- [`03-dev-timeline/README.md`](03-dev-timeline/README.md) 是 milestone／handoff／歷史紀錄索引，不是當前工程 queue。
- 舊版設計與 dated implementation 文件可以協助理解決策，但不能覆寫 current code、tests、migrations 或 live issue／PR。
