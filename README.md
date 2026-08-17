# Tour Platform — 台灣在地導遊交易平台

> **一句話定位：** 讓旅客直接預約在地導遊與特色行程，讓導遊管理場次、接單、收款與營運。
>
> **品牌：** Midao（祕島）。這份 README 是穩定入口與文件路由，不保存會快速過期的 issue／PR 數字、即時數量、Phase 百分比或單一 rollout 判斷。

## 品牌入口

所有對外文案、配色、設計、社群內容與命名，先讀 [`BRAND_BOOK.md`](./BRAND_BOOK.md)。

| 需求 | 首讀 |
|---|---|
| 品牌語氣與文案 | [`BRAND_BOOK.md`](./BRAND_BOOK.md) |
| 工程限制、凍結區與開工規則 | [`CLAUDE.md`](./CLAUDE.md) |
| 測試充分性、分層、去重與停止條件 | [`測試策略與 Agent 施工規範`](./docs/04-tech/04-tech-architecture/17-testing-strategy-and-agent-standard.md) |
| 文件分類與任務路由 | [`docs/README.md`](./docs/README.md) |
| 專案即時 issue／PR／readiness | [`docs/operations/reports/readiness-live-state-latest.md`](./docs/operations/reports/readiness-live-state-latest.md)；先跑 `npm run readiness:check` |

## Agent／維護者開工順序

1. 先讀 [`CLAUDE.md`](./CLAUDE.md)，遵守凍結區、migration、測試與 production side-effect 規則。
2. 任務涉及測試、bug、API／DB／UI變更或驗收聲明時，讀 [`測試策略與 Agent 施工規範`](./docs/04-tech/04-tech-architecture/17-testing-strategy-and-agent-standard.md)，先建立AC → 風險 → owner layer → seam矩陣。
3. 再讀 [`.cursor/harness/00_INDEX.md`](./.cursor/harness/00_INDEX.md)，依任務需要進入 testing、orchestration 或 branch hygiene 文件；每個 issue 都必須先建立或接續對應的 worklog（`docs/operations/worklogs/issueNNNN.md`），先讀 worklog，再依 worklog讀取並在每個里程碑雙寫狀態。
4. 進入 [`docs/README.md`](./docs/README.md)，依任務類型選擇首讀、次讀與真值來源。
5. 需要即時狀態時查 live GitHub issue／PR；readiness snapshot只作bounded snapshot，不能取代live query。

不要從舊 roadmap、dated QA report、歷史 incident closure 或設計草稿推導目前 backlog。若文件與現行 code、tests、migrations、live issue／PR 或 runtime evidence 衝突，以對應領域的真值來源為準。

## 依任務找文件

從本檔進入 [`docs/README.md`](./docs/README.md)，再依下表到達正確的領域索引；不需要掃描整棵 `docs/`。

| 任務類型 | 領域入口 | 執行真值 |
|---|---|---|
| API／DB | [`docs/04-tech/README.md`](./docs/04-tech/README.md) | live issue／PR、現行 route／gateway、`supabase/migrations/`、focused tests |
| UI／互動 | [`docs/README.md`](./docs/README.md) → `BRAND_BOOK.md` 與 QA／frontend 規則 | live issue／PR、`apps/web/app/`、components、Playwright／E2E |
| QA | [`docs/qa/README.md`](./docs/qa/README.md) | issue AC、current head SHA、實際 test／CI／preview output |
| Ops／release | [`docs/operations/README.md`](./docs/operations/README.md) | live issue／PR、runbook、runtime／provider console、fresh evidence |
| 產品／roadmap | [`docs/07-transformation/midao-travel-hotcake-transformation-plan.md`](./docs/07-transformation/midao-travel-hotcake-transformation-plan.md) | owner-approved live issue／decision；策略文件只是 context／proposal |
| Incident／security | [`docs/security/README.md`](./docs/security/README.md) | live security issue、現行 guards／config、redacted evidence |

## 真值與 freshness 邊界

- `CURRENT EXECUTION`：目前執行中的 live issue／PR 與該任務 worklog；穩定 README 不複製即時 queue。
- `TECHNICAL CONTRACT`：`CLAUDE.md`、`.cursor/harness/`、`docs/04-tech/`、`docs/implementation/`；若與 code／tests／migrations 衝突，回到現行實作驗證。
- `QA`：testing playbook、package scripts、E2E／focused tests 與帶 SHA 的實際結果；dated report 只證明當時環境。
- `OPS`：可執行 runbook、worklog 與 evidence；production action 依領域分流：DML 由 `sql-guard` 逐句 audit 並在執行後立即回報實際影響；schema apply 另受 `SQL-OVERRIDE` 與 migration SOP 約束；付款、credential、restore、incident 則各走對應 runbook、operator／owner approval 與必要的 audit／rollback 證據。
- `AUTO-GENERATED`：[`readiness-live-state-latest.md`](./docs/operations/reports/readiness-live-state-latest.md) 是有限範圍的自動快照，不是 live truth。先跑 `npm run readiness:check`；過期時以 `npm run readiness:snapshot` 重生或直接查 live GitHub，不可手改 snapshot。
- `ARCHIVE`：[`docs/99-archive/README.md`](./docs/99-archive/README.md) 只供考古，不作目前執行依據。

## 常用指令

Node 版本遵循 `.nvmrc` 與 package `engines`（Node 22）。依任務範圍選擇 focused check，不要用未實跑結果宣稱完成：

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
npm run readiness:check
npm run readiness:snapshot
```

測試選擇、充分性、去重與停止條件以 [`測試策略與 Agent 施工規範`](./docs/04-tech/04-tech-architecture/17-testing-strategy-and-agent-standard.md) 為準。測試命令與QA證據流程以 [`.cursor/harness/07_testing_playbook.md`](./.cursor/harness/07_testing_playbook.md) 及 [`docs/qa/README.md`](./docs/qa/README.md) 為準。

## Repo 結構

```text
tour-platform/
├── apps/web/       Next.js App Router、UI、API、Admin、Guide
├── supabase/       migrations 與資料庫相關腳本
├── docs/           技術契約、implementation、QA、Ops、產品與歷史文件
├── scripts/        readiness、QA、release 與維運工具
└── README.md       穩定入口（本文件）
```

## README 維護規則

1. 根 README 與各層 README 只負責穩定導航、文件分類、真值與 freshness 邊界。
2. 不在 README 靜態寫入 open issue／PR 數量、當前 issue number、Phase 百分比或未經 live 驗證的 rollout 結論。
3. 新增或修改文件前，先確認是否為 current execution、technical contract、QA、Ops、product context、auto-generated 或 archive。
4. 若主線變動，更新對應的 live issue／worklog 與領域文件；README 只補路由，不複製完整狀態。
