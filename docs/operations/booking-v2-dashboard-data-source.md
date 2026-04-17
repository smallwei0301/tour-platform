# Booking V2 Dashboard — 第一版資料來源與查詢腳本（Issue #103）

## 目的
提供 B3 放量期間可每日/每小時產生的指標快照，支援 Go / Hold / Rollback 判斷。

## 腳本
- `scripts/rollout/booking-v2-dashboard.mjs`
- npm 指令：`npm run dashboard:booking-v2`

## 執行需求
環境變數（任一來源）
- `SUPABASE_URL`（或 `NEXT_PUBLIC_SUPABASE_URL`）
- `SUPABASE_SERVICE_ROLE_KEY`

可選：
- `ROLLUP_HOURS`（預設 24）

## 輸出
執行後會寫入：
- `docs/operations/reports/booking-v2-dashboard-<timestamp>.json`
- `docs/operations/reports/booking-v2-dashboard-<timestamp>.md`
- `docs/operations/reports/booking-v2-dashboard-latest.json`
- `docs/operations/reports/booking-v2-dashboard-latest.md`

## 第一版指標（v1）

### Funnel
- booking_page_view（已改為獨立事件）
  - 可依 `properties.rollout_variant` 分為 `legacy` / `v2`
- booking_v2_fallback_clicked（已新增獨立事件）
- begin_checkout
- purchase_intent
- payment_callback_received
- payment_succeeded

### Orders / Bookings
- orders.paid / orders.failed
- bookings.completed / bookings.cancelled

### Error
- events.error
- error_rate_vs_page_view

### Latency（若事件帶 `properties.latency_ms`）
- available_slots_loaded
- booking_draft_created
- checkout_initiated

## 已知限制（後續迭代）
1. begin_checkout / purchase_intent 目前尚未全面帶 rollout_variant（若需完整 funnel 分群，建議補齊）。
2. fallback 事件目前僅來自 booking v2 頁 fallback CTA，未覆蓋所有可能 fallback path。
3. latency 指標依賴 `properties.latency_ms`，目前樣本可能偏少。

## 建議下一步（Issue #103 子任務）
1. 在 checkout / order 相關事件也補 `rollout_variant`。
2. 將本腳本接入每日排程（銜接 #105）。
3. 加上門檻判定（GO/HOLD/ROLLBACK WATCH）欄位。
