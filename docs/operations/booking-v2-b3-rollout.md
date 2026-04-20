# Booking V2 — Phase B3 切換規劃（Issue #96）

> 目標：在不破壞既有轉單與付款穩定性的前提下，將 booking V2 從 feature flag 漸進切換為主流程。

## 1) 範圍與前提

## 目前已完成（B2）
- flag gate 已落地（`NEXT_PUBLIC_BOOKING_V2_ENABLED`）
- V2 MVP flow 已可用（available-slots → draft → checkout）
- flag-on smoke + fallback 機制已落地

## B3 目標
1. 定義分階段放量策略（不是一次全開）
2. 定義明確回滾條件與回滾操作
3. 定義監控指標與告警門檻
4. 建立 on-call 執行手冊（值班同學可 5 分鐘內操作）

---

## 2) 放量策略（Progressive Rollout）

採用「入口分流 + 流量比例」雙控制：

### Stage 0 — Canary（0~5%）
- 對象：內部測試名單 + 低風險流量
- 期間：至少 24 小時
- 要求：
  - checkout 成功率不低於 legacy - 1%
  - V2 錯誤率（5xx + API fail）< 2%
  - fallback 觸發率 < 5%

### Stage 1 — 25%
- 期間：24~48 小時
- 要求：
  - payment callback 成功率維持與 legacy 同等
  - `SLOT_UNAVAILABLE` / `CAPACITY_EXCEEDED` 分布無異常尖峰
  - 人工客服「付款卡住」工單不增加 > 20%

### Stage 2 — 50%
- 期間：48 小時
- 要求：
  - 成交轉換率不低於 Stage 1
  - 取消率不異常（避免 UX 誤導）
  - draft 建立到 checkout 啟動中位延遲 < 2s

### Stage 3 — 100%
- 條件：Stage 2 指標連續 48h 穩定
- 動作：
  - 將 V2 設為預設
  - 保留 fallback 與 flag 至少 7 天（觀察窗口）

---

## 3) 回滾條件（Rollback Guardrails）

任一條件達成即觸發「立即回滾到 legacy」：

1. **支付異常**
   - callback 失敗率 > 2%（連續 10 分鐘）
   - 或 checkout API 5xx > 1%

2. **容量/狀態異常**
   - `INVALID_STATE_TRANSITION`、`INTERNAL_ERROR` 異常飆升（> 平均 3 倍）
   - 或客服回報出現「成功付款但狀態未更新」案例 >= 2 件

3. **可用性異常**
   - booking 頁 P95 首互動延遲 > 4s（連續 15 分鐘）
   - fallback 點擊率 > 15%

---

## 4) 回滾操作手順（5 分鐘 Runbook）

1. 關閉 V2 流量：
   - 將 `NEXT_PUBLIC_BOOKING_V2_ENABLED=false`
2. 重新部署（或觸發 config 生效流程）
3. 驗證：
   - `/booking/[activityId]` 進入 legacy UI
   - 可成功建立舊流程訂單
   - callback 正常回寫
4. 在 incident thread 更新：
   - 觸發時間、指標、回滾完成時間、初步原因

---

## 5) 監控指標（KPI / SLO）

### 核心漏斗
- booking_page_view
- available_slots_success_rate
- draft_create_success_rate
- checkout_init_success_rate
- payment_callback_success_rate
- booking_completed_rate

### 錯誤指標
- API 4xx/5xx 比率（按 route）
- `VALIDATION_ERROR` / `SLOT_UNAVAILABLE` / `CAPACITY_EXCEEDED` / `INTERNAL_ERROR`
- fallback_click_rate

### 效能指標
- booking 頁 LCP / INP（flag on vs off）
- available-slots API P50/P95 latency
- draft/checkout API P50/P95 latency

---

## 6) 值班與責任分工

- **Release Owner**：負責升級節奏與 go/no-go 判斷
- **On-call Backend**：監控 API 與 callback
- **On-call Frontend**：監控 UI/前端錯誤與 fallback 觸發
- **Support Liaison**：同步客服異常回報

---

## 7) Go / No-Go Checklist

上線前必須全部勾選：
- [ ] B2 smoke 全綠（含 fallback）
- [ ] payment callback 近 7 天穩定
- [ ] rollback drill 至少演練 1 次
- [ ] 監控看板完成並可用
- [ ] on-call 人員與通報鏈已確認

---

## 8) 建議後續任務

1. 新增 booking v2 rollout metrics dashboard（按 flag 分段）
2. 加入 callback correlation id 追蹤（draft → order → payment）
3. 建立每階段自動化 go/no-go 報表（每天固定時間輸出）


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
