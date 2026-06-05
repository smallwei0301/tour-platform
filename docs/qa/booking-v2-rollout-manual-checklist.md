# Booking V2 Rollout — Manual QA Checklist

> 目的：提供 QA 可直接勾選的人工驗收表單，用於 B2/B3 上線前後回歸。

- 測試環境：`https://tour-platform-nine.vercel.app`
- 測試日期：`____-__-__`
- 測試人員：`________`
- 版本/Commit：`________`

---

## A. 站點基礎可用性

- [ ] A-01 首頁可正常開啟
  - URL: `https://tour-platform-nine.vercel.app/`
  - 預期：首屏可見、無 5xx、無白屏
- [ ] A-02 行程列表可正常開啟
  - URL: `https://tour-platform-nine.vercel.app/activities`
  - 預期：列表可見、可點入詳情
- [ ] A-03 行程詳情可正常開啟
  - URL: `https://tour-platform-nine.vercel.app/activities/kaohsiung/kaohsiung-chaishan-cave-experience`
  - 預期：行程資訊/方案區塊顯示正常

---

## B. Booking Legacy Flow（flag = OFF）

- [ ] B-01 帶 plan 參數可進入預約流程
  - URL: `https://tour-platform-nine.vercel.app/booking/kaohsiung-chaishan-cave-experience?plan=half-day&date=2026-04-20`
  - 預期：可進行 Step1→Step2→Step3
- [ ] B-02 不帶 plan 參數不會崩潰
  - URL: `https://tour-platform-nine.vercel.app/booking/kaohsiung-chaishan-cave-experience`
  - 預期：頁面可用、提示清楚
- [ ] B-03 建立訂單按鈕行為正確
  - URL: 同 B-01
  - 預期：資料未填完整時按鈕 disabled / 顯示合理錯誤提示

---

## C. Booking V2 Flow（flag = ON）

> 若環境無法切 flag，可標記 N/A，並於報告註明。

- [ ] C-01 V2 頁面識別文案存在
  - URL: `https://tour-platform-nine.vercel.app/booking/kaohsiung-chaishan-cave-experience?plan=half-day&date=2026-04-20`
  - 預期：可見「V2 預約流程」文案
- [ ] C-02 缺 plan 參數時可 fallback
  - URL: `https://tour-platform-nine.vercel.app/booking/kaohsiung-chaishan-cave-experience`
  - 預期：顯示 fallback 按鈕，點擊後切回 legacy
- [ ] C-03 slots API 失敗時可 fallback
  - 操作：攔截 `/api/v2/activities/*/available-slots` 回 500
  - 預期：顯示 `booking-v2-error` + fallback 按鈕可切回 legacy
- [ ] C-04 public plan → available-slots → draft contract 一致
  - 操作：先 `GET /api/activities/:slug` 記錄 `activityId + plans[].id/slug/status + schedules[].id/planId/startAt`，再用同一組 public plan/schedule 依序呼叫 `/api/v2/activities/:activityId/available-slots` 與 `/api/v2/bookings/draft`
  - 預期：若 public plan 仍被當成可預約選項，`available-slots` 與 `bookings/draft` 必須使用同一 formal `activity_plans` 來源成功驗證；若 formal plan 不存在，public DTO 不應再發出該方案為可預約選項

---

## D. Event Tracking（本次重點）

- [ ] D-01 `booking_page_view` 會寫入 events
  - 預期：legacy/v2 各有事件
- [ ] D-02 `booking_v2_fallback_clicked` 會寫入 events
  - 預期：點 fallback 按鈕後有事件
- [ ] D-03 `rollout_variant` 正確分流
  - 預期：`legacy` 或 `v2` 出現在 `events.properties.rollout_variant`

建議測試 payload 範例：

```json
{
  "event_name": "booking_page_view",
  "properties": {
    "activity_slug": "kaohsiung-chaishan-cave-experience",
    "plan_id": "half-day",
    "rollout_variant": "v2"
  },
  "page_path": "/booking/kaohsiung-chaishan-cave-experience"
}
```

---

## E. Dashboard 腳本驗證（Issue #103）

- [ ] E-01 腳本可執行
  - 指令：`npm run dashboard:booking-v2`
  - 預期：成功輸出 JSON + Markdown
- [ ] E-02 latest 報告檔存在
  - 檔案：
    - `docs/operations/reports/booking-v2-dashboard-latest.json`
    - `docs/operations/reports/booking-v2-dashboard-latest.md`
- [ ] E-03 分流欄位有值
  - 預期欄位：
    - `funnel.bookingPageView`
    - `funnel.bookingPageViewLegacy`
    - `funnel.bookingPageViewV2`
    - `funnel.fallbackClicked`
    - `funnel.fallbackRateVsV2PageViewPct`

---

## F. 結果摘要

- 測試結論：`PASS / PASS with N/A / FAIL`
- 主要風險：
  1. `...`
  2. `...`
- 建議是否可進入放量：`GO / HOLD / ROLLBACK WATCH`


---

## #96 Unified Rollout Gate (2026-04-20)

This document follows the same decision gate for #96 switch-over:

- **GO**
  - booking V2 happy path pass (slots -> draft -> checkout)
  - no regression on payment callback / oversell protections
  - smoke + manual evidence complete and reproducible
- **HOLD**
  - evidence incomplete, or KPI/QA data inconclusive
  - non-blocking defects exist without rollback trigger
- **ROLLBACK**
  - checkout/payment critical failure, or oversell/integrity risk
  - security/compliance blocker impacting booking conversion path
- **Legacy cleanup preconditions**
  - GO decision sustained for at least one full observation window
  - rollback runbook drill + go/no-go packet confirmed
  - legacy path removal has explicit owner + rollback fallback
