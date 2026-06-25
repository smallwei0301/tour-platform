# 導遊外部佔位（external hold）防超賣 — 實作驗收報告

- **功能**：導遊後台自助登記「外部已售」座位（OTA／電話／現場走客），讓線上各通路共用同一個庫存池，杜絕外部來源造成的超賣。
- **分支**：`claude/tour-guide-overselling-t4nxpa`
- **基底 commit**：`6f7e79e`（origin/main）
- **驗收環境**：本機 `next dev`（http://localhost:3000），無 Supabase 連線（in-memory／無 DB 模式）
- **時間**：2026-06-24 16:37（Asia/Taipei）
- **判定**：**PASS（程式邏輯／契約／建置層級）**；外部佔位「正向寫入 DB」與「真實瀏覽器 E2E」因環境限制標 `NOT_PROD_EXECUTED` / `NOT_VERIFIED-live`（見下）。

---

## 一、設計重點（為何能防超賣）

1. **單一庫存真實來源** = `activity_schedules.booked_count`，唯一安全寫入點是既有 `fn_book_schedule` / `fn_cancel_booking`（`FOR UPDATE` 行鎖）。外部佔位一律走這條路，不另開平行庫存表。
2. **外部佔位 = 一筆 `bookings` 列**（`source_channel='external'`、`status='external_hold'`），同時：
   - 透過新 RPC `fn_create_external_hold` 呼叫 `fn_book_schedule` **原子扣 `booked_count`**（Gate 2：場次層 `capacity - booked_count`）。
   - 被計入 `CAPACITY_HOLD_BOOKING_STATUSES`（Gate 1：每方案每日群組容量池，`calculateExistingParticipantsForGroup`）。
   - 透過 `resolveBookingPlan` 解析出 `activity_plan_id`（uuid），確保外部佔位與線上預訂落在**同一個群組容量池**。
3. **零孤兒佔位**：`fn_create_external_hold` 在同一交易內完成「扣量 + 建 booking + 寫稽核」，任一步驟丟例外則整個函式 rollback（含 `fn_book_schedule` 的扣量），不會留下「扣了名額卻沒有對應 booking」的孤兒佔位 —— 這是本案最高風險點，採原子 RPC 而非「先扣量、應用層補償」即從根消除。
4. **`external_hold` 算容量、不算成團**：納入 `CAPACITY_HOLD_BOOKING_STATUSES`，但**不**納入 `FORMED_GROUP_BOOKING_STATUSES`（外部佔位佔名額，但不滿足 `min_participants` 成團）。

---

## 二、變更清單

**新增**
- `supabase/migrations/20260624140000_external_hold_source_and_rpc.sql`（＋ `.rollback.sql`）：放寬 `bookings`／`orders` 的 `source_channel`（加 `external`）、`bookings.status`（加 `external_hold`）、`bookings` 新增 nullable `schedule_id` FK；新增 `fn_create_external_hold` / `fn_release_external_hold` RPC。
- `apps/web/src/lib/availability-v2/external-hold-rule.ts`：純函式 `evaluateExternalHoldRequest`，鏡像 `fn_book_schedule` 容量語意（#1376 防線）。
- `apps/web/app/api/guide/schedules/[scheduleId]/external-holds/route.ts`（POST）、`[holdId]/route.ts`（DELETE）。
- 測試：`tests/unit/external-hold-rule.test.mjs`、`tests/api/external-hold-contract.test.mjs`、`e2e/external-hold-guide.spec.ts`。

**修改**
- `apps/web/src/lib/availability-v2/group-booking-rule.ts`：`CAPACITY_HOLD_BOOKING_STATUSES` 加入 `external_hold`。
- `apps/web/app/api/guide/schedules/route.ts`：GET 帶出 `externalHoldCount` / `externalHolds`。
- `apps/web/app/guide/schedules/page.tsx`：場次列新增「外部佔位」欄，可登記／釋放。

---

## 三、逐項驗收證據

| # | 驗收項目 | 方法 | 結果 |
|---|---------|------|------|
| 1 | 外部佔位容量規則鏡像 SQL（足夠/邊界/超量/非open/<1/已超賣防呆） | `node --test tests/unit/external-hold-rule.test.mjs` | **PASS**（15 子測試全綠） |
| 2 | migration 放寬約束 + 新增 schedule_id + 兩支 RPC 重用 fn_book/fn_cancel + 原子性 | `node --test tests/api/external-hold-contract.test.mjs` | **PASS** |
| 3 | `external_hold` 計入 capacity hold、不計入 formed | 同上（contract）＋ 規則純函式 | **PASS** |
| 4 | 路由 wiring：POST/DELETE CSRF＋guide session＋ownership＋原子 RPC；GET 帶出佔位 | 同上（contract） | **PASS** |
| 5 | 後台頁提供登記／釋放操作 | 同上（contract，源碼鎖定） | **PASS** |
| 6 | 全套單元／整合回歸 | `npm test` | **PASS**（tests 3716 / pass 3713 / fail 0 / skip 3） |
| 7 | 型別 | `npm run typecheck` | **PASS** |
| 8 | Lint（Node 22） | `npm run lint` | **PASS**（僅既有 eslintrc deprecation 警告） |
| 9 | Production build（含新路由註冊） | `npm run build` | **PASS**（`/api/guide/schedules/[scheduleId]/external-holds`、`.../[holdId]` 均出現於產物） |
| 10 | 認證層 live smoke（負向） | 對 `next dev` curl 三個端點（無 session） | **PASS**：POST／DELETE／GET 皆 `HTTP 401`「guide session required」，證實路由已掛載且 guide 鑑權 gate 生效 |

---

## 四、未能於本環境實測項目（誠實標註）

- **外部佔位正向寫入 DB（NOT_PROD_EXECUTED）**：實際建立／釋放外部佔位需呼叫 Supabase RPC `fn_create_external_hold` / `fn_release_external_hold`，本機無 `SUPABASE_URL` / service-role key，無法安全連線正式 DB。容量語意已以純函式單元測試 + migration／路由 source-contract 鎖定；上線前須在 staging 套用 migration 後跑一次端到端（建立 → `booked_count` 增加 → 線上 draft 名額同步下降 → 釋放回復）。
- **真實瀏覽器 E2E（NOT_VERIFIED-live）**：`e2e/external-hold-guide.spec.ts` 已撰寫並提交（`setGuideSession` + `page.route` 全 mock，符合 e2e-smoke 規範）。本環境 `npx playwright install chromium` 下載被網路政策阻擋（Playwright CDN 不在 proxy allowlist），無法啟動瀏覽器。spec 可在有瀏覽器的環境／CI 執行。Blocker：browser binary 下載失敗（非程式問題）。

---

## 五、上線注意

- 套用 migration 前後，`booked_count` 既有值不受影響（變更皆 additive）。
- 既有 booking 流程不寫入 `bookings.schedule_id`（維持 NULL），無行為變更；該欄僅供外部佔位釋放定位場次。
- 回收（rollback）前須先以 `fn_release_external_hold` 釋放所有殘留外部佔位，再執行 `.rollback.sql`（檔內已註明前置檢查）。
- 並發保證沿用 `fn_book_schedule` 的 `FOR UPDATE` 行鎖；web／line／admin_pos／external 共享同一把鎖、同一個 `booked_count`，先搶先得、不超賣。
