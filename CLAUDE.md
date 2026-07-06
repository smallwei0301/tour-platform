# CLAUDE.md

本檔是所有 Claude Code session 的主入口。**開工順序：讀完本檔 → 讀 `.cursor/harness/00_INDEX.md` → 建立或接續 `docs/operations/worklogs/issueNNNN.md`。**（改版前全文備份：`CLAUDE.md.bak`）

## 🔒 十條鐵律（由 hooks 強制執行；違反任一條 = 本輪工作無效）

1. **語言**：對話回覆、維運/QA 文件、commit 說明一律繁體中文；程式碼、指令、檔名、API/欄位名、錯誤碼、log 不翻譯。使用者文案以 `BRAND_BOOK.md` 為準。
2. **生產 SQL：`execute_sql` 讀寫全自動＋事後審計**（owner 2026-07-06 拍板）：查詢與資料寫入（DML）免確認自動執行，sql-guard 逐句寫入 `.claude/state/sql-audit.log`；**agent 執行任何寫入後必須立刻回報實際影響**（動到哪張表、幾筆、結果）。硬地板永遠擋：災難級語句（drop database/schema、alter system）＋危險系統函式（pg_terminate/pg_read_file…）。**`apply_migration`（schema 變更）例外**：仍需 `SQL-OVERRIDE` 授權，且 schema 變更必須先落時間戳 migration 檔 → PR → CI 綠燈 → 授權套用 → 補 ledger（協議見 harness/01 §4b；`docs/operations/migration-apply-ledger-sop.md`）。
3. **凍結區不碰**（file-guard 強制）：`apps/web/app/api/{orders,payments}/**`、legacy availability 路徑、既有 `supabase/migrations/**`、受保護 e2e spec（`t0-*`…`t7-t8-*`、`funnel-*`、`deeplink-*`、`booking-flow-*`）、`apps/web/middleware.ts`、`src/config/{security-env,startup-env}.mjs`。新功能一律落 `app/api/v2/**`。
4. **migration 只增不改**，新檔必為時間戳命名（`supabase/migrations/README.md`）。
5. **沒有實跑證據不得宣稱完成**：commit 觸碰程式碼前必須 `.claude/hooks/run-checks.sh <targeted tests>` 綠燈（bash-guard 強制擋無證據 commit）。「應該會過」＝未完成。
6. **紅燈絕不 merge**：merge PR 前必須確認 CI conclusion=success，並把 check-run 連結記入 worklog。
7. **記憶錨點雙寫**：每個里程碑把狀態寫回 GitHub issue 留言＋`docs/operations/worklogs/issueNNNN.md`（模板見 harness/04）。**永遠以 worklog 為準，不信任自己的上下文記憶**；context 被壓縮或恢復後，第一件事是重讀 worklog。
8. **同一錯誤連續兩次修不動就停**：按 `.cursor/harness/03_rubrics.md` 熔斷/換路徑，不在錯誤代碼上盲目疊改。
9. **不改 harness 治理檔**（本檔、`.claude/**`、`.cursor/harness/0*.md`）；唯一可自行追加的是 `.cursor/harness/lessons.md`。凍結區 P0 修復需使用者在對話中回覆 `P0-OVERRIDE: <路徑>` 授權（協議見 harness/01 §4）。
10. **`yarn.lock` 改動不 commit；force-push 一律禁止**（替代流程見 harness/08）。

## 這是什麼專案

Tour Platform（品牌 **Midao／祕島**）——台灣在地嚮導旅遊市集。旅人瀏覽活動、訂位、付款（ECPay）、管理訂單；嚮導管理檔期與預約；管理員操作後台 POS/訂單/退款。目前**冷啟動：生產環境已連線、尚未收正式訂單**。多數文件與註解為繁體中文。

## Commands（Node 22 固定；fresh container 先 `npm install`——遠端環境用 `npm install --ignore-scripts`，見 lessons.md，裝完丟棄 yarn.lock 改動）

Root scripts 代理到 `@tour/web` workspace：

- `npm run dev` / `npm run build` / `npm run lint`（Node 22 上跑）/ `npm run typecheck` / `npm test`
- 測試用 **Node 內建 test runner**（`.mjs`，非 Jest/Vitest）；單檔：`node --test apps/web/tests/api/xxx.test.mjs`
- **commit 證據**：`.claude/hooks/run-checks.sh <test 檔…>`（`--typecheck`／`--all`）
- E2E：`npm run test:e2e -w @tour/web`（需另開 `npm run dev`）；CI smoke lane：`test:e2e:smoke`
- `npm run readiness:snapshot` 重生 readiness 報告（live 數字不手寫）
- 完整測試/QA 細節 → `.cursor/harness/07_testing_playbook.md`

## 架構速覽

- **單一 app（npm workspaces 骨架）**：`package.json` 宣告 `workspaces: ["apps/*"]`，實際只有 `apps/web`（整個 Next.js 15 App Router + React 19 app，package 名 `@tour/web`）。共用 config／i18n 住在 `apps/web/src/{config,i18n}`，**不存在 `packages/` 目錄**（#1617 已移除歷史遺留的 `packages/*` 空殼宣告；若日後真要抽共用套件再另建）。Stack：TypeScript、Supabase（Postgres）、Sentry、Vercel。
- **Data layer**：`apps/web/src/lib/db.mjs` 是資料 gateway；`hasSupabaseEnv()` 無環境變數時 fallback 到 in-memory store（`store.mjs`/`services.mjs`/`admin.mjs`）——測試靠這個 seam。**strangler 硬規則（#1385／#1570）**：新的資料存取函式禁止寫進 `db.mjs`，一律開領域檔（`db-kpi.mjs`、`db-auto-complete.mjs`…）；CI 有行數天花板 guard（`tests/unit/db-mjs-size-guard.test.mjs`，只能降不能升）。改 gateway 函式必須同步 fallback＋契約測試（harness/07 §3 完整條款）。
- **三個 auth realms**（`apps/web/middleware.ts` 是唯一前門）：Traveler＝Supabase cookies（SSR anon client）；Guide＝`guide_token` HMAC cookie（edge 只做格式檢查，完整驗證在 API 的 `verifyGuideSession()`）；Admin＝token＋email allowlist＋session-version。CSRF：`tp_csrf` cookie vs `x-csrf-token` header 雙提交。
- **Soft-launch kill-switch**：middleware 讀 `soft_launch_controls`，`public_paused` 時非豁免請求 503/redirect `/maintenance`，fail-open。
- **Booking＝V2 單軌（legacy 已退役，#1407 owner 拍板 2026-07-03）**：legacy checkout/orders 頁與 `/api/orders` route 已刪除、`NEXT_PUBLIC_BOOKING_V2_ENABLED`／`BOOKING_V2` flags 已退場，無回滾開關。V2 routes 在 `app/api/v2/**`，availability 邏輯在 `src/lib/availability-v2/`＋`slot-generator.ts`。booking→order→payment 三層鏈必須一致；ECPay callback 必須冪等（`checkout-idempotency.ts`、`payment-reconciliation.ts`）。舊路徑 `/checkout`／`/orders` 由 next.config 301 導向 V2；唯一保留的 legacy 殘餘＝availability route 內部的資料 snapshot fallback（#839/#1133 安全網，待 V2 slots 全量回填後另案移除）；殘留守門測試：`tests/api/issue1407-legacy-retirement-residue-guard.test.mjs`。**可用性文案跨介面（#1321 選項 C，by-design）**：Traveler 動態 `messageZh` 與 Admin/Guide `getCanonicalReasonCopy` 語意一致但字面不同，稽核時不得 re-flag，見 `docs/04-tech/04-tech-architecture/14-availability-copy-cross-surface-decision.md`。
- **`.ts` vs `.mjs`**：要被 edge middleware import 或免編譯執行的（auth、sessions、soft-launch、store）是 `.mjs`，其餘 `.ts`。strict 開啟但覆蓋仍在擴張（#68）——跟隨所在檔案風格。
- **Migrations**：`supabase/migrations/`，新檔一律時間戳命名；套用/回滾程序見 `docs/operations/booking-v2-rollback-runbook.md`。

## 檔案路由表（先查表，再開檔）

| 主題 | 檔案 |
|---|---|
| Harness 總覽／session 開機順序 | `.cursor/harness/00_INDEX.md` |
| 防線設計與能力極限 | `.cursor/harness/01_diagnostics.md` |
| 派工、升降級、隔離驗證 | `.cursor/harness/02_orchestration.md` |
| 換路徑／完成定義／熔斷檢核表 | `.cursor/harness/03_rubrics.md` |
| 派工與 worklog 模板 | `.cursor/harness/04_templates.md` |
| harness 自我維護規則 | `.cursor/harness/05_maintenance.md` |
| 交接信＋腐化預防 | `.cursor/harness/06_manifesto.md` |
| 測試/QA playbook（完整版） | `.cursor/harness/07_testing_playbook.md` |
| branch 衛生（完整版） | `.cursor/harness/08_branch_hygiene.md` |
| 踩坑教訓（可追加） | `.cursor/harness/lessons.md` |
| V2 API 契約 | `docs/04-tech/04-tech-architecture/10-api-spec-v2-booking-pos.md` |
| payment callback 原子性 | `docs/04-tech/04-tech-architecture/12-payment-callback-atomicity.md` |
| V2 回滾 runbook | `docs/operations/booking-v2-rollback-runbook.md` |
| migration 套用 SOP | `docs/operations/migration-apply-ledger-sop.md` |
| 品牌文案/色彩/語氣 | `BRAND_BOOK.md` |

## QA 驗收（摘要；完整標準＝harness/07 §1，逐條照辦）

實測綠燈才算過（不得推測）；使用者可見流程必跑真實瀏覽器（Playwright）；無法安全執行才標 `NOT_VERIFIED-live` 並附 blocker；驗收報告繁中寫入 `docs/operations/qa-reports/`（含 URL、SHA、Asia/Taipei 時間、逐條 AC 證據，不含密鑰/PII）；流程＝開 PR → 盯 CI → merge → 逐條 AC → sign-off → 關 issue。

## Conventions

- 新 API 一律 v2 routes/contracts，除非是修 legacy 行為。
- readiness/ops 文件用 `npm run readiness:snapshot` 同步，不手改 live 數字。
- Secrets 由 `src/config/security-env.mjs`、`startup-env.mjs` 與 CI secret-scan 守護——不 commit 真秘密、不弱化 guard。
