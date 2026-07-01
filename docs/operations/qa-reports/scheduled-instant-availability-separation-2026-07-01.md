# 排程預約 vs 即時預約「可用時間來源」嚴格區隔 — QA 驗收

- **驗收時間（Asia/Taipei）**：2026-07-01 08:56 CST
- **環境**：本機 `next dev`（`http://localhost:3000`，已注入 `GUIDE_SESSION_SECRET`／`ADMIN_ACCESS_TOKEN` 佔位值）+ 真實 Chromium（Playwright）；後端契約與純函式以 in-memory fallback（`node --test`）
- **base commit**：`3b24491`（origin/main，含本計畫三個 PR 全數 squash-merge）
- **分支**：`claude/plan-management-admin-options-v0d9c7`
- **相關 PR**：PR1 `#1537`（後端守門）、PR2 `#1539`（設定面 UX）、PR3 `#1541`（預覽正確性）
- **判定**：**PASS**

## 需求（owner 拍板）

- **排程預約（scheduled）只看固定場次（`activity_schedules`），不看導遊可行時間（`guide_availability_rules`）。**
- **即時／申請預約（instant／request）只看導遊可行時間（動態規則），不看固定場次。**
- 範圍涵蓋管理者後台、導遊後台、旅客預約頁的**設定面**與**預覽面**（讀取引擎先前已正確區隔，本計畫聚焦守門＋預覽正確＋instant 收斂）。

## 變更總覽（三階段）

### PR1 `#1537` — 後端守門 + 純函式（對稱 #1495 反向）
- 新增純函式 `isDynamicAvailabilityApplicable(bookingType)`（`src/lib/booking-type-flow.mjs`）：`scheduled`→`false`、`instant`/`request`→`true`。
- 4 條動態規則寫入路由，當綁定方案 `booking_type === 'scheduled'` → `422 RULE_NOT_APPLICABLE_FOR_BOOKING_TYPE`（守門先於 `insert`/`update`）：
  - guide `POST`/`PUT`（`app/api/guide/availability-rules/**`）走 `ensureOwnedUsablePlan`（select 補 `booking_type`）。
  - admin `POST`/`PUT`（`app/api/v2/admin/guides/[guideId]/availability-rules/**`）走共用 `assertPlanBelongsToGuide`（補 `booking_type` 與新結果碼）。
- draft（`app/api/v2/bookings/draft/route.ts`）：instant／request 嚴格忽略傳入 `scheduleId`，固定場次解析閘限定 `booking_type === 'scheduled'`。

### PR2 `#1539` — 設定面 UX
- 純函式 `bookingTypeLabelZh(bookingType)`：`scheduled`→排程預約、`request`→申請預約、其餘→即時預約。
- admin／guide 時段規則表單：方案下拉每個選項標 booking_type；選到排程方案→警示框（`data-testid="rule-booking-type-warning"`）+ 停用送出 + `saveRule` 前端守門。

### PR3 `#1541` — 預覽正確性
- admin／guide 時段預覽路由：previewPlan 為排程方案時短路，回 `previewNotice`「請至場次管理檢視固定場次」與空 `slots`，不跑 `generateAvailableSlots`。
- 前端預覽區顯示提示框（`data-testid="preview-scheduled-notice"`）、隱藏季節／canonical 誤導框；預覽下拉標 booking_type。

## 逐條 AC 驗證證據

| # | 驗證項目 | 方式 | 結果 |
|---|---------|------|------|
| 1 | `isDynamicAvailabilityApplicable`：scheduled→false、instant/request→true、未知值回退 instant→true | `node --test tests/unit/booking-type-flow.test.mjs` | ✓ PASS |
| 2 | `bookingTypeLabelZh`：三模式中文標籤、未知值回退即時預約 | 同上 | ✓ PASS |
| 3 | guide/admin 4 條規則路由：綁排程方案→422 `RULE_NOT_APPLICABLE_FOR_BOOKING_TYPE`，守門先於 insert/update | `node --test tests/api/scheduled-instant-availability-separation.test.mjs`（source-contract + 共用 helper 契約） | ✓ PASS |
| 4 | draft：instant/request 固定場次解析閘限定 `booking_type === 'scheduled'`（即時忽略 scheduleId） | 同上（source-contract） | ✓ PASS |
| 5 | admin 規則表單：選排程方案→警示+停用送出；選即時→無警示可送出；下拉標 booking_type | Playwright `e2e/availability-rule-booking-type-block.spec.ts` | ✓ PASS |
| 6 | guide 規則表單：同 #5 | 同上 | ✓ PASS |
| 7 | admin/guide 預覽路由：排程方案短路回 previewNotice、先於 `generateAvailableSlots` | `node --test tests/api/scheduled-preview-notice.test.mjs` | ✓ PASS |
| 8 | admin/guide 預覽區：排程方案→顯示提示（含「場次管理」）、不跑動態時段 | Playwright `e2e/availability-preview-scheduled-notice.spec.ts` | ✓ PASS |

### 真實瀏覽器 smoke（Playwright / Chromium）

三支 availability E2E 合跑，對本機 `next dev` 實測：

```
6 passed (26.3s)   # availability-rule-booking-type-block + availability-preview-scheduled-notice
```

- admin/guide 規則表單選「排程方案」→ 出現黃色警示「此方案為排程預約，僅使用固定場次…請改用『場次管理』」，儲存鈕停用（disabled）。
- admin/guide 規則表單選「即時方案」→ 無警示、儲存鈕可用；方案下拉顯示「排程方案（排程預約・…）」「即時方案（即時預約・…）」。
- admin/guide 預覽區選排程方案→ 出現藍色提示「排程預約方案…請至『場次管理』檢視固定場次」，時段清單顯示「排程預約方案不套用動態時段預覽…」，不出現動態時段。

### 全域回歸

| 檢查 | 結果 |
|------|------|
| `npm test`（Node built-in runner，全套） | ✓ 4049 pass / 0 fail / 3 skip |
| `npm run typecheck`（`tsc --noEmit`） | ✓ PASS |
| `npm run lint`（ESLint，Node 22） | ✓ PASS |
| `npm run build`（`NODE_ENV=production`） | ✓ PASS |
| CI（PR #1537／#1539／#1541）：scan / test / smoke | ✓ 全綠後 squash-merge |

## 不動範圍（先前已正確，避免破壞）

`available-slots` route-handler 的 scheduled/dynamic 分流、`evaluateScheduledPlanSlots`（硬編 `rules:[]`）、draft `SCHEDULE_REQUIRED`、override 動態時段、旅客預約頁 bookingType 分流、admin「新增場次」#1495 守門、方案編輯選單與 `BookingTypesGuide`。本計畫僅補「設定守門＋預覽正確＋instant 收斂」，未改讀取引擎。

## 後續（可選 follow-up）

一次性清查報表：列出「綁在排程方案上的動態規則」與「掛在 instant/request 上的固定場次」供維運檢視（純報表、無破壞性；引擎已忽略，無立即風險）。

## 合規

本報告不含密鑰／cookie／token／service-role key／完整付款 payload／未遮蔽 PII；環境變數僅為本機測試佔位值。
