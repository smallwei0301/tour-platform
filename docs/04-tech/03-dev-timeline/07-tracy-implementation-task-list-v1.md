# Tracy Implementation Task List V1 — Booking Engine + POS Lite

> 目的：把 Booking + POS 改造拆成 Tracy 可直接執行的工程任務包。
> 
> 原則：P0 先打底，先 schema、後 engine、再前台與渠道。
> 
> 更新日期：2026-04-09

---

## 0. 執行總原則

1. **先做資料模型，再做 UI**
2. **先做 API 與測試，再接前端頁面**
3. **先做 Web flow，再接 LINE / LIFF**
4. **POS 只做 Lite，不做 ERP**
5. **v1 / v2 並行，不能直接砍舊 flow**

---

## 1. P0 任務包

## TP-BP-001 — Schema Migration Foundation

### 目標
建立 booking + availability + POS 所需的新表與欄位。

### 交付物
- Supabase migration SQL
- schema doc 更新
- seed script（最小可用）

### 範圍
- `activity_plans`
- `guide_availability_rules`
- `guide_blackout_dates`
- `bookings`
- `booking_status_logs`
- `order_items`
- `payment_events`
- `orders` 擴欄（`booking_id`, `source_channel`, `payment_status`, `discount_amount`, `handled_by`）

### 驗收標準
- migration 可在本地與遠端重跑（idempotent）
- 所有 FK / index / check constraints 完整
- schema 文件同步更新

### 估時
1.0d

---

## TP-BP-002 — Backfill Script

### 目標
把既有資料平滑導入新結構。

### 交付物
- backfill SQL / script
- dry-run 報表
- 抽樣驗證紀錄

### 範圍
- activities -> `activity_plans` default plan
- orders + schedules -> `bookings`
- orders -> `order_items`
- payments -> `payment_events`

### 驗收標準
- 20 筆抽樣資料對得上
- 舊訂單不遺失、不重複
- booking status 映射明確

### 估時
0.5d

---

## TP-BP-003 — Slot Generator Engine

### 目標
做出可複用的 booking engine 核心。

### 交付物
- `slot-generator.ts` / service module
- 單元測試

### 必做函式
- `getAvailabilityRules()`
- `getBlackoutWindows()`
- `getExistingBookings()`
- `buildCandidateSlots()`
- `filterConflicts()`
- `serializeSlots()`

### 驗收標準
- 支援 timezone
- 支援 blackout
- 支援 buffer
- 支援不同 duration
- 可正確過濾衝突 booking

### 測試案例
- weekday rules
- duration 不同
- overlap
- blackout
- buffer before/after
- UTC / Asia-Taipei 轉換

### 估時
1.5d

---

## TP-BP-004 — Available Slots API

### 目標
提供前台 / LIFF / POS 共用的可售時段 API。

### 交付物
- `GET /api/v2/activities/:activityId/available-slots`
- request validation
- response serializer

### 驗收標準
- 前台可直接接
- 不依賴 `activity_schedules` 作為主要來源
- server 端時間計算正確

### 估時
0.5d

---

## TP-BP-005 — Booking Draft + Checkout API

### 目標
建立 v2 booking flow。

### 交付物
- `POST /api/v2/bookings/draft`
- `POST /api/v2/bookings/:id/checkout`
- order item 寫入
- payment event 初始寫入

### 驗收標準
- draft booking 可建立
- slot 需 server 端二次驗證
- checkout 能產出 payment session
- order / booking / payment 關聯正確

### 估時
1.0d

---

## 2. P1 任務包

## TP-BP-006 — Booking State Service

### 目標
把 booking status transition 做成 service，不能散在 route handler。

### 交付物
- transition guard
- state service
- `booking_status_logs` 寫入

### 範圍
- confirm
- complete
- cancel
- reschedule_request

### 驗收標準
- 非法 transition 直接 409
- 每次 transition 都留下 log

### 估時
0.5d

---

## TP-BP-007 — Guide Availability Dashboard

### 目標
讓導遊可管理 availability 規則與 blackout。

### 交付物
- 規則列表頁
- 建立 / 編輯表單
- blackout CRUD

### 驗收標準
- guide ownership 正確
- 可以新增每週固定規則
- 可以封鎖單日 / 區間

### 估時
1.0d

---

## TP-BP-008 — Activity Plan Management

### 目標
把現有活動擴成多 plan 結構。

### 交付物
- Admin / Guide plan CRUD
- plan 對應 pricing / duration / booking type

### 驗收標準
- 同 activity 可有多個 plan
- plan 可切換 active/inactive

### 估時
0.75d

---

## TP-BP-009 — Web Booking UI V2

### 目標
前台改接 v2 booking engine。

### 交付物
- activity detail 改讀 plans
- booking 頁改讀 available slots
- submit 改走 booking draft / checkout

### 驗收標準
- 舊 flow 不壞
- feature flag 可切換 v1 / v2
- UX 不退步

### 估時
1.5d

---

## 3. P2 任務包

## TP-BP-010 — Admin POS Lite

### 目標
做出最小版 POS，支援人工建單與收款。

### 交付物
- POS 建單頁
- 加付款頁
- 訂單 timeline
- refund entry

### 驗收標準
- admin 可代客建 booking
- admin 可記錄 manual payment
- 可追溯 line item 與 payment events

### 估時
1.5d

---

## TP-BP-011 — LINE / LIFF Booking Flow

### 目標
把 v2 booking engine 接到 LINE。

### 交付物
- LIFF auth
- LIFF booking page
- `/api/v2/line/*`
- LINE notification template

### 驗收標準
- LINE 進來可完成 draft booking
- source_channel = `line`
- 預約成功可回推訊息

### 估時
1.5d

---

## TP-BP-012 — E2E & Regression Test Pack

### 目標
確保 v2 不把現有 funnel 打爛。

### 測試範圍
- available slots
- draft booking
- checkout
- cancel
- guide blackout
- admin pos create order
- line draft flow（可 mock）

### 驗收標準
- 主要流程 smoke pass
- 舊 v1 訂單流程仍可跑

### 估時
1.0d

---

## 4. 建議執行順序（實際）

### Sprint 1
- TP-BP-001
- TP-BP-002
- TP-BP-003
- TP-BP-004

### Sprint 2
- TP-BP-005
- TP-BP-006
- TP-BP-008
- TP-BP-009

### Sprint 3
- TP-BP-007
- TP-BP-010
- TP-BP-011
- TP-BP-012

---

## 5. Blocker 清單

如果遇到以下 blocker，要立刻停下回報：

1. 既有 `activity_schedules` 與新 slot engine 對不齊
2. 既有 order status 無法可靠映射 booking status
3. ECPay callback 與 v2 payment event 結構衝突
4. 前台需要同時支援 per_person 與 per_group 但舊資料不完整

---

## 6. Tracy 執行標準

- 每完成一個任務包，更新：
  - `04-tech/03-dev-timeline/01-sprint-log.md`
  - `04-tech/04-tech-architecture/02-database-schema.md`
  - `04-tech/04-tech-architecture/03-api-spec.md` 或 v2 doc
- 每個 API 任務都要附：
  - request schema
  - response sample
  - error cases
- 每個 migration 都要附 rollback 思路

---

## 7. 一句話執行指令

**Tracy 不要先畫 UI，先把 booking engine 打穩；沒有 slot engine，就沒有 LINE，也沒有 POS。**
