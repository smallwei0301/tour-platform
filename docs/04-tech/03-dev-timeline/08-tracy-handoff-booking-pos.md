# Tracy Handoff — Booking Engine + POS Lite

> 目的：正式交辦 Tracy 接手 Tour Platform 下一階段的 Booking Engine + POS Lite 開發。
> 
> 這不是 brainstorming；這是進入實作。
> 
> 更新日期：2026-04-09

---

## 1. 任務目標

請將 Tour Platform 從目前的 MVP schedule-based booking，升級為：

1. **Availability-driven booking engine**
2. **Booking / Order / Payment 分層結構**
3. **Admin POS Lite**
4. **可擴充到 LINE / LIFF 的 booking flow**

核心原則：
- 不重造 booking engine
- 借鑑 Cal.com 的 availability / slot generation
- 借鑑 ERPNext 的 commerce skeleton
- 保留 v1 / v2 並行，不可直接打壞現有流程

---

## 2. 你必須先閱讀的文件（依序，不可跳）

### Step 1 — 總方案
先讀：
- `/root/tour-platform/docs/04-tech/04-tech-architecture/08-booking-pos-improvement-plan.md`

你要理解：
- 為什麼現有 `activity_schedules` 不夠
- 為什麼要拆 `bookings`
- 哪些代碼/概念可以參考 Cal.com / ERPNext

### Step 2 — Migration 設計
再讀：
- `/root/tour-platform/docs/04-tech/04-tech-architecture/09-booking-pos-migration-plan.md`

你要理解：
- 要新增哪些表
- 要怎麼 backfill
- 怎麼維持 v1 / v2 並行

### Step 3 — API Spec V2
再讀：
- `/root/tour-platform/docs/04-tech/04-tech-architecture/10-api-spec-v2-booking-pos.md`

你要理解：
- `/api/v2/*` 應該怎麼拆
- booking / order / payment 狀態怎麼分層
- available-slots API 是新核心

### Step 4 — Tracy 任務清單
最後讀：
- `/root/tour-platform/docs/04-tech/03-dev-timeline/07-tracy-implementation-task-list-v1.md`

這是你的執行清單，請照 task id 做。

### Step 5 — 對照現況（避免撞壞）
補讀：
- `/root/tour-platform/docs/04-tech/04-tech-architecture/02-database-schema.md`
- `/root/tour-platform/docs/04-tech/04-tech-architecture/03-api-spec.md`

用途：
- 了解現在已上線的 v1 schema / API
- 避免 migration 與既有流程衝突

---

## 3. 第一波必做任務（不要分心）

### TP-BP-001 — Schema Migration Foundation

你要做：
- 建立新表與擴欄：
  - `activity_plans`
  - `guide_availability_rules`
  - `guide_blackout_dates`
  - `bookings`
  - `booking_status_logs`
  - `order_items`
  - `payment_events`
  - `orders` 擴欄

### TP-BP-002 — Backfill Script

你要做：
- activities -> default plan
- orders/schedules -> bookings
- orders -> order_items
- payments -> payment_events

### TP-BP-003 — Slot Generator Engine

你要做：
- server-side slot generation utility
- timezone / overlap / blackout / buffer 測試

**先做完這三個，再往下做 API。**

---

## 4. 明確禁止事項

- 不要先做 UI 美化
- 不要先做 LINE 前端頁
- 不要直接砍掉 `activity_schedules`
- 不要把 booking / payment / fulfillment 狀態重新混在同一欄
- 不要跳過文件更新

---

## 5. 回報格式

完成第一波後，你必須回報：

1. **migration 檔案列表**
2. **新增/修改 schema 摘要**
3. **slot generator 測試覆蓋**
4. **目前 blocker**
5. **下一步建議（是否可進 TP-BP-004 / TP-BP-005）**

---

## 6. 你更新文件時要改哪些

每完成一個任務包，至少更新：

- `/root/tour-platform/docs/04-tech/03-dev-timeline/01-sprint-log.md`
- `/root/tour-platform/docs/04-tech/04-tech-architecture/02-database-schema.md`
- `/root/tour-platform/docs/04-tech/04-tech-architecture/03-api-spec.md`（若動到 v1 bridge）
- 或對應 v2 文件

---

## 7. 一句話指令

**先打底層，不要碰花活。沒有 slot engine，就沒有下一代 booking，也沒有 LINE，也沒有 POS。**
