# issue1860 — /midao2 方案直接生效（Stage 1B / API foundation）

- Kanban 卡：`t_7a7c9d3f`（assignee `tp-builder-api`）
- Repo：`/root/.openclaw/workspace/tour-platform`
- Worktree：`/root/.hermes/worktrees/tour-platform/release-1763-production`
- Branch：`release/1763-production-integration`（**凍結 index**，本卡不 commit）
- 時區：Asia/Taipei

## 凍結 index 協議

本卡在 dirty candidate 上工作，Canary 明確授權「不動 HEAD／branch／staged index」的建置模式。
所有變更留在工作目錄，證據以外部 manifest（`/root/.hermes/profiles/default/workspace/issue1860/stage1b/`）綁定。

| 檢查 | 期望 | 結果 |
|---|---|---|
| `git rev-parse HEAD` | `28dac019017a1d698c5366f746b477006c441ce5` | 相符（pre/post） |
| `git rev-parse --abbrev-ref HEAD` | `release/1763-production-integration` | 相符（pre/post） |
| `git diff --cached --binary \| sha256sum` | `cc9a895428e87a4523d6fb8a0320fed4a887ee17a449d801c03555a3e6e2df88` | 相符（pre/post） |
| staged 路徑數 | `112` | 相符（pre/post） |

## 本卡完成範圍（僅 API foundation）

### F1 新增 `apps/web/src/lib/midao/db-midao-service-plans.mjs`

單方案領域寫入器，只讀寫 canonical `activities` / `activity_plans`（不經 `db.mjs`）。

- `normalizePlanInput(input, partial)`：伺服端八欄驗證（name／description／duration_minutes／
  price_type／base_price／min_participants／max_participants／booking_type）；
  一律丟棄 client 送來的 `id`／`slug`／`status`／`activity_id`／審核欄位。
- `listServicePlansDb`：回傳所有非封存方案（含 `inactive`）；越權／不存在皆 `NOT_FOUND` 404。
- `createServicePlanDb`：只 insert 一列，slug 走既有 `generatePlanSlug({ name })`。
- `updateServicePlanDb`：以 `planId` + `activityId` + `updated_at=expectedUpdatedAt` 三重條件寫單列。
- `deactivateServicePlanDb`：只寫 `status='inactive'`，永不 DELETE、永不 `archived`。
- 測試 seam：`__resetMidaoServicePlansForTest` / `__seed*ForTest` / `__setMidaoServicePlanClockForTest`
  / `__listMidaoServicePlanRowsForTest`。

**結構不變式**：所有 `.update(` 都必須綁定 `.eq('id', …)`，禁止以 `activity_id` 做整批寫入；
有測試以原始碼掃描鎖住此不變式，並同時擋 `.rpc(`、`db.mjs` import、`review_state`／`pending_changes`。

### 稽核 `apps/web/src/lib/midao/db-midao-audit-events.mjs`

只寫 canonical `midao_audit_events`（migration `20260723002500_midao_audit_events.sql` 已存在，本卡不新增 migration）。

- 固定欄位：`actor_type='guide'`、`actor_id=String(guideId)`、`resource_type='activity_plan'`、`reason=null`。
- `action`：POST → `midao.plan.create`，PATCH／下架 → `midao.plan.update`。
- metadata 只允許 `{route, activityId, planId, changedFields, before, after, expectedUpdatedAt, resultUpdatedAt, requestHash}`；
  序列化 > 8000 字元時 `before:null, after:null, truncated:true`。
- `requestHash` 用既有 `hashIdempotentRequest`；**絕不**記錄原始 Idempotency-Key、cookie、token、金流或旅客 PII。

### F2／F3 新 route

- `app/api/v2/guide/midao/services/[activityId]/plans/route.ts`（GET／POST）
- `app/api/v2/guide/midao/services/[activityId]/plans/[planId]/route.ts`（PATCH）

兩者一律走既有 `withMidaoGuideQuery` / `withMidaoGuideCommand`、`MidaoRouteError` /
`handleMidaoRouteError`，不複製 legacy service route 的認證邏輯，不發明平行錯誤外殼。

樂觀鎖契約：

| 情境 | 結果 |
|---|---|
| 正確 `expectedUpdatedAt` | 200，`{plan, appliedToPublicSurface:true}`，`updated_at` 前進 |
| 缺漏／格式錯誤 `expectedUpdatedAt` | 422 `INVALID_EXPECTED_UPDATED_AT` |
| 時間戳過期 | 409 `PLAN_REVISION_CONFLICT` + `currentUpdatedAt` + `currentPlan` |
| 非擁有者／方案不存在 | 404 `NOT_FOUND`（不洩漏存在性） |
| 缺 CSRF | 403 `CSRF_REQUIRED` / `CSRF_INVALID` |
| 缺 Idempotency-Key | 422 `INVALID_IDEMPOTENCY_KEY` |

### F4 `db-midao-showcase.mjs` 讀取形狀一致性

- `fetchPlansByActivityIds()` 加選 `slug, min_participants, max_participants, booking_type`。
- `serviceShape()` 新增完整 `plans` 欄位（含 `inactive`，排除 `archived`）；
  既有 `planOptions`／`priceFromTwd` 的 active-only／最低價語意**完全不變**。
- `updateMidaoServiceDb()` 回傳前先撈方案，避免服務 PATCH 誤報零方案。
- `normalizeServiceInput` 與服務 PATCH payload **未**加入 `plans`。

## 測試證據

RED → GREEN 皆為實跑：

| 階段 | 指令 | 結果 |
|---|---|---|
| RED F1 | `node --test tests/unit/db-midao-service-plans.test.mjs` | fail 1（`ERR_MODULE_NOT_FOUND`） |
| GREEN F1 | 同上 | pass 11 / fail 0 |
| RED 稽核 | `node --test tests/unit/midao-audit-events-writer.test.mjs` | fail 1（模組不存在） |
| GREEN 稽核 | 同上 | pass 9 / fail 0 |
| RED F4 | `node --test tests/unit/db-midao-showcase.test.mjs` | pass 12 / **fail 2**（新 F4 斷言） |
| GREEN F4 | 同上 | pass 14 / fail 0 |
| RED F2/F3 | `node --test tests/api/v2-midao-guide-service-plans-contract.test.mjs` | fail 1（route 不存在） |
| GREEN F2/F3 | 同上 | pass 12 / fail 0 |
| 合併證據 | `.claude/hooks/run-checks.sh <5 檔> --typecheck` | **pass 48 / fail 0 + tsc --noEmit 綠燈**（exit 0） |

註：本 worktree shell 的 `NODE_ENV` 預設為 `production`，會觸發 `SECURITY_ENV_BLOCK`；
執行測試需先 `export NODE_ENV=test`（`run-checks.sh` 亦以此環境執行）。

## 已知缺口（稽核非原子）

`midao_audit_events` 寫入與 `activity_plans` 寫入**不在同一交易**。稽核 insert 失敗時：

- canonical 資料**不回滾**，HTTP 仍為 200；
- 由 `reportRouteError` 上報（metadata 標 `auditGap: true`）；
- 因此存在「資料已生效但稽核缺一筆」的可能，屬本階段已知並刻意接受的缺口，
  待後續階段以 DB 端原子寫入或補償流程收斂。

409／422／驗證失敗／越權路徑一律寫**零筆**稽核事件（已有測試鎖定）。

## 本卡明確未做（依卡片禁令）

F5–F7／F11（`ServiceForm`、編輯頁、services list type、UI、Playwright）；任何 migration／
`supabase/migrations/**`／`guide_service_drafts`／`review_state`／`pending_changes` 寫入／`.rpc()`／
admin 審核 UI；`activity_id` 整批 UPDATE；`db.mjs`／orders／payments／`middleware.ts`／security config／
受保護 E2E spec／legacy availability；Production 查詢或寫入、SQL、ledger、deploy、push／PR／merge。

## 下一步

交由 `tp-reviewer`（Rita）做 manifest-bound fresh review；
binding 為 `sha256-manifest`（`foundation-manifest.json`），`commit_sha=null`（Canary 凍結 index 例外）。
