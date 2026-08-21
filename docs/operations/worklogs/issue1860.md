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

---

## Run 2 返工：Rita 審查阻擋缺陷 B1（2026-08-21）

### 缺陷內容（Rita run 999 判定「未通過／需修正」）

`apps/web/src/lib/midao/db-midao-service-plans.mjs` 的 `normalizePlanInput(input, partial=true)`
只在 `min_participants` 與 `max_participants` **同時**出現在 patch 內時才做跨欄檢查；
`updateServicePlanDb` 又未像既有 `db-midao-showcase.mjs:234-241`（服務層）那樣先讀既有列合併驗證。

因此「單欄 PATCH」可寫出非法人數區間：

- in-memory／fallback：直接寫入 `min > max` 並依本卡「直接生效」語意即時上到公開介面；
- Supabase canonical：撞上 `activity_plans` 的 `CHECK (max_participants >= min_participants)`，
  以 `throw new Error(...)` 冒泡成 500，而非契約要求的 422 `INVALID_PLAN_INPUT`。

兩路徑行為分歧，違反 `CLAUDE.md` 的 gateway/fallback 契約平價，也違反本卡「preserve validation」。

### 最小修正

`updateServicePlanDb` 於既有 `readPlanRow` 之後、寫入之前，補上合併式跨欄檢查：

```js
if (norm.value.min_participants !== undefined || norm.value.max_participants !== undefined) {
  const nextMin = norm.value.min_participants ?? existing.min_participants ?? 1;
  const nextMax = norm.value.max_participants ?? existing.max_participants ?? 10;
  if (nextMax < nextMin) throw planError('INVALID_PLAN_INPUT', '人數區間不合法（最多需大於等於最少）', 422);
}
```

語意刻意對齊既有服務層 `updateMidaoServiceDb`（同樣以 `?? existing ?? 預設` 合併後比較），
避免同專案內兩套人數驗證語意。`normalizePlanInput` 本身未改動，既有完整建立路徑行為不變。

### RED 轉 GREEN 證據（皆為實跑）

| 階段 | 指令 | 結果 |
|---|---|---|
| RED（unit） | `node --test --test-concurrency=1 tests/unit/db-midao-service-plans.test.mjs` | pass 12 / **fail 2**（`Missing expected rejection`） |
| GREEN（unit） | 同上 | **pass 14 / fail 0** |
| RED（route，反證法） | 暫時停用 guard 後跑 contract 測試 | pass 12 / **fail 1**（新測試） |
| 還原驗證 | `sha256sum db-midao-service-plans.mjs` | `b89b2b5dd71d862fe9a68646f9429d2759e55108bd0337d9b67ea0ac1b9413fe`（與修正後版本 byte-identical） |
| GREEN（route） | `node --test --test-concurrency=1 tests/api/v2-midao-guide-service-plans-contract.test.mjs` | **pass 13 / fail 0** |
| 合併證據 | `.claude/hooks/run-checks.sh <5 檔> --typecheck` | **tests 52 / pass 52 / fail 0** 加 `tsc --noEmit` 綠燈，exit 0 |

測試數由 48 增至 52，即本輪新增 4 筆（3 unit 加 1 route contract），無既有測試被移除或放寬。

### 新增測試涵蓋

1. 只送 `max_participants`（小於既有 min）回 422 `INVALID_PLAN_INPUT`，資料與 `updated_at` 完全不變。
2. 只送 `min_participants`（大於既有 max）回 422，資料不變。
3. 單欄 patch 合併後**合法**時仍可正常寫入（確認未過度封鎖）。
4. Route 層：422 回應加目標方案零寫入加該次**零稽核事件**，同批合法 patch 仍只寫一筆稽核。

### 本輪異動檔案（3 檔，皆在卡片允許清單內）

- `apps/web/src/lib/midao/db-midao-service-plans.mjs`
- `apps/web/tests/unit/db-midao-service-plans.test.mjs`
- `apps/web/tests/api/v2-midao-guide-service-plans-contract.test.mjs`

未新增檔案、未觸碰 migration／`.rpc()`／`review_state`／`pending_changes`／`db.mjs`／
orders／payments／`middleware.ts`／UI／Playwright／Production。Rita 已通過的部分（樂觀鎖、
稽核 metadata、結構不變式、F4 讀取形狀、路由邊界）均未被改動。

### 仍保留的已知風險

稽核非原子（Canary OPEN_FINDING）維持原狀，本卡未授權補償路徑，續於 #1863 或後續卡追蹤。
