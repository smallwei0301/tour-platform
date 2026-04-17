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
- booking_page_view（以 `events.event_name = view_item` 暫代）
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
1. booking_page_view 目前用 `view_item` proxy，建議補獨立事件名。
2. fallback_click_rate 尚未有標準事件，建議新增 `booking_v2_fallback_clicked`。
3. 目前未做 flag-on / flag-off 分群（需在事件 properties 記錄 variant）。

## 建議下一步（Issue #103 子任務）
1. 在 `/api/events` 或前端 track 增加 rollout 維度：`rollout_variant` (`legacy`/`v2`)。
2. 補 fallback 事件。
3. 將本腳本接入每日排程（銜接 #105）。
