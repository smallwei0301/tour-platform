# 導遊方案（含每方案價格）自助編輯 + 管理者審核上架 — 驗收報告（Phase 2）

- **功能**：導遊可在「方案管理」自助新建／編輯活動方案（含每方案價格、人數、內容），一律走送審；管理者核准才生效上架（per-plan pending overlay 模型，沿用 Phase 1）。
- **分支**：`claude/guide-itinerary-editing-design-q5g8ny`
- **驗收時間**：2026-06-24 13:07 Asia/Taipei
- **環境**：本地 Node 22.22.2 + npm workspaces；E2E 走本地 `npm run dev`（PORT=3333, NODE_ENV=development）+ Playwright chromium 真實瀏覽器。無連線 production Supabase（gateway 走 `hasSupabaseEnv()` 真實分支需 Supabase，本地以單測／source-contract + 真實瀏覽器 mock-backend 驗證）。
- **判定**：**PASS（後端 / 型別 / Lint / 建置 / 單測 / live browser smoke 全綠）。**

## 範圍（Phase 2，依 owner 拍板）
- **專注方案開放**：場次／時間管理（`/guide/availability` availability rules + blackout、`/guide/schedules`）原本即為導遊自助、即時生效，本輪不動；本輪補齊「方案」這條斷掉的自助鏈。
- **每個方案各自送審**：每個 `activity_plans` row 各自帶 pending overlay；
  - 已上架（status=active）方案改動 → 寫 `pending_changes`，前台照常以原方案售票，核准才套用；
  - 新建方案 → 以 `status='inactive'` + `pending_new_plan=true` 落地（不對外售票），核准後轉 `active` 上架；
  - 退回（changes_requested）保留 pending_changes、附退回原因，導遊改完可再送審。

## 逐條 AC 證據

| # | 驗收項目 | 結果 | 證據 |
|---|---------|------|------|
| 1 | 方案可編欄位白名單（含價格/人數/內容），剔除 status/slug/activity_id/審核欄位 | ✅ PASS | `node --test tests/unit/guide-editable-plan-fields.test.mjs` → 7/7 綠 |
| 2 | 核准套用欄位映射：部分更新不得把未提供 rich 欄位寫成 null（防清空既有內容） | ✅ PASS | `tests/unit/plan-column-patch.test.mjs` → 5/5 綠 |
| 3 | gateway 接線：ownership、白名單、新方案 inactive+pending_new_plan、狀態機、audit、核准轉 active、衝突偵測 | ✅ PASS | `tests/api/guide-plan-review-gateway-contract.test.mjs` → 6/6 綠 |
| 4 | route 接線：guide 路由 verifyGuideSession+CSRF+ownership(404)、admin 審核 approve/reject+NOT_PENDING_REVIEW(409)+核准刷新 ISR | ✅ PASS | `tests/api/guide-plan-review-routes-contract.test.mjs` → 5/5 綠 |
| 5 | 型別檢查 | ✅ PASS | `npm run typecheck` 0 error |
| 6 | Lint（Node 22） | ✅ PASS | `npm run lint` 0 error（僅 eslintrc 棄用警告） |
| 7 | 全套單測無回歸 | ✅ PASS | `npm test` → 3752 pass / 0 fail / 3 skip（2744 top-level，299 suites） |
| 8 | production 建置 | ✅ PASS | `npm run build`（NODE_ENV=production＋強密鑰）成功；新路由皆入 manifest（見下） |
| 9 | live browser smoke（導遊方案列表徽章／改價送審／新建草稿導向／管理者方案 diff+核准） | ✅ PASS | Playwright chromium 真實瀏覽器 `e2e/guide-plan-review.spec.ts` → **4/4 passed**；併跑 Phase 1 `e2e/guide-activity-review.spec.ts` → **3/3 passed**（admin 頁加方案分頁後無回歸）。全程 `page.route` mock backend。 |

### 建置 manifest 驗證（新路由）
```
ƒ /api/admin/plan-reviews
ƒ /api/admin/plan-reviews/[planId]
ƒ /api/guide/activities/[id]/plans
ƒ /api/guide/activities/[id]/plans/[planId]
ƒ /api/guide/activities/[id]/plans/[planId]/submit
ƒ /guide/activities/[id]/plans                 1.9 kB
ƒ /guide/activities/[id]/plans/[planId]        3.55 kB
```

### live browser smoke 涵蓋情境（真實 chromium）
- 導遊方案列表顯示「審核中／已退回，請修改＋退回原因／新方案草稿」徽章。
- 導遊改已上架方案價格（2200→2600）→ 送出審核 → 出現「已送出審核」＋「前台仍以原方案內容售票」橫幅、`/submit` 被呼叫。
- 導遊新增方案 → 填名稱＋價格 → 建立草稿 → 自動導向新方案編輯頁、出現「送出審核」按鈕、`POST /plans` 被呼叫。
- 管理者切「方案審核」分頁 → 顯示待審方案 → 點開看 `base_price` diff（2200→2600）→ 核准 → 「已核准，方案內容已套用並上架」。

## 安全性重點
- 導遊送來的方案 payload 一律過 `pickGuideEditablePlanFields` 白名單：無法挾帶 `status`（不可自助上下架）、`slug`/`activity_id`/`id`（不可改路由或歸屬）、`legacy_plan_id` 與所有審核欄位（`review_state`/`pending_*`/`review_admin_note`）。
- 每個 guide route：`verifyGuideSession` → CSRF（middleware + route）→ 方案 ownership（經 `activity_plans.activities.guide_id`）；非擁有者一律回 404（不洩漏存在性）；`archived` 方案不可編輯／送審。
- 新建方案以 `inactive` 落地，售票/可預約查詢沿用既有 `status='active'` 過濾，未核准方案**不會**對外售票（沿用既有 36 處 status query，不新增 `draft` 列舉、零 blast radius）。
- 核准套用走純函式 `buildPlanColumnPatch`（部分更新、不寫 null 清空），新方案核准才轉 `active`；核准/退回/送審/新建皆寫 audit log（`audit-log.mjs` 單一實作，action `plan_create`/`plan_submit`/`plan_approve`/`plan_reject`）；audit 失敗 fail-soft。
- 衝突偵測：送審記錄 `pending_base_updated_at`，與當前 `updated_at` 比對，管理者審核頁標示「送審後 live 已被改」（新方案不適用，故略過）。

## 已知限制 / 後續
- 方案編輯器目前開放「基本＋定價（價格/計價方式/時長/人數/預約方式）＋內容（描述/亮點/包含/不包含/注意/退款）」。站點時間表（`plan_itinerary` 物件陣列）、季節供應（`activity_plan_seasons`）等進階欄位仍由管理者於 `/admin/activities/[id]/plans` 維護，列為後續 Phase 3 視需求開放。
- 方案的「下架／封存（active→inactive/archived）」仍為管理者操作；導遊端僅新增＋編輯內容＋送審。若要開放導遊自助下架，建議獨立小 PR（涉及售票中方案的退場流程）。
- DB migration `20260624010000_guide_plan_review_overlay.sql` 需於部署環境套用（含 rollback 檔）。`pending_new_plan` 預設 false，對既有方案無影響。

---

## Phase 2.5 增補：站點時間表（送審）+ 季節供應（即時）

- **增補時間**：2026-06-24 16:30 Asia/Taipei
- **範圍**：依 owner 拍板，把方案的兩項進階欄位開放給導遊：
  1. **站點時間表（`plan_itinerary`）**：方案內容 → **走現有方案審核**（與價格/內容同一送審流程）。
  2. **季節供應（`activity_plan_seasons` + `activity_plans.is_year_round`）**：方案的可預約日期窗口，性質同場次/時間管理 → **即時生效、不送審**。`is_year_round` 因此移出送審白名單，改由即時的季節管理掌控。

### 逐條 AC 證據（增補）
| # | 驗收項目 | 結果 | 證據 |
|---|---------|------|------|
| 10 | 站點時間表：導遊在方案編輯器新增站點（icon/站名/時長/說明/照片）→ 隨方案送審；後端白名單＋`buildPlanColumnPatch` 已支援 | ✅ PASS | E2E `e2e/guide-plan-seasons-itinerary.spec.ts` →「新增站點並送審，PUT 帶 plan_itinerary」passed（真實瀏覽器，斷言 PUT body `plan_itinerary[0].title`） |
| 11 | 季節供應即時：全年供應開關 + 季節窗口 CRUD，皆即時呼叫 API、不經審核 | ✅ PASS | 同 spec「新增季節窗口與切換全年供應，皆即時呼叫對應 API」passed |
| 12 | season gateway/route 接線：ownership(assertPlanEditable)、CSRF、驗證器複用、soft-delete、audit、is_year_round 移出白名單 | ✅ PASS | `tests/api/guide-plan-seasons-contract.test.mjs` → 5/5 綠 |
| 13 | 型別 / Lint / 全套單測 / 建置無回歸 | ✅ PASS | typecheck 0 error；lint 0 error；`npm test` 3757 pass / 0 fail / 3 skip；`npm run build` 成功，新 season routes 入 manifest |
| 14 | 全套 guide E2E 無回歸 | ✅ PASS | `guide-activity-review`(3) + `guide-plan-review`(4) + `guide-plan-seasons-itinerary`(2) → **9/9 真實瀏覽器 passed** |

### 新增路由（建置 manifest）
```
ƒ /api/guide/activities/[id]/plans/[planId]/seasons
ƒ /api/guide/activities/[id]/plans/[planId]/seasons/[seasonId]
ƒ /guide/activities/[id]/plans/[planId]/seasons        2.86 kB
```

### 設計重點
- 站點時間表複用既有 `ImageUpload`（`uploadApiBase="/api/guide/activities"`、type=gallery 3:2），每站一張卡可增刪；空站點於送審時過濾。
- 季節供應採與場次一致的「即時自助」：gateway 全部先過 `assertPlanEditable`（ownership + archived 擋），驗證複用 `activity-plan-seasons.ts` 既有 validators，刪除為 soft-delete（`is_active=false`），全程寫 audit（`plan_season_create/update/delete`、`plan_year_round_set`）。
- `is_year_round` 移出送審白名單，避免「即時季節管理」與「送審改方案」兩條路徑改同一欄位造成衝突。

### Phase 2.5 已知限制
- 季節窗口的「啟用/停用」未在導遊 UI 單獨開放（建立=啟用、移除=soft-delete），與 admin 的 is_active 切換等價；如需暫停而不刪除，後續再加。
- 季節窗口的「編輯」gateway/route（PUT [seasonId]）已實作並測試，導遊 UI 目前以「移除＋重建」操作為主，編輯表單可後續補上。

## 不含
本報告不含任何密鑰／cookie／token／service-role key／完整付款 payload／未遮蔽 PII。
