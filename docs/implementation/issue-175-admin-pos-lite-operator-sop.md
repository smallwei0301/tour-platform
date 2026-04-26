# Issue #175 — Admin POS Lite Operator SOP（Truthful MVP 版本）

> 適用範圍：**目前 main branch 已存在的 Admin POS Lite 能力**（非規劃中 API）  
> 更新日期：2026-04-26  
> 目的：讓營運與 QA 能用同一份文件執行「建單 → 收款」最小閉環，並在異常時有明確升級路徑。

---

## 1) 本 SOP 的真實範圍（先講清楚）

### 1.1 目前可用（已落地）
1. 建立 V2 draft booking：`POST /api/v2/bookings/draft`
   - `sourceChannel` 可帶 `admin_pos`
2. 發起 checkout（ECPay）：`POST /api/v2/bookings/:bookingId/checkout`
3. Admin POS 手動收款：`POST /api/v2/admin/pos/bookings/:bookingId/manual-payment`
4. 後台訂單檢視與人工調整（既有頁面）：`/admin/orders`

### 1.2 目前**不在 MVP 內**（不要當成可用）
以下是架構規格曾定義，但此刻 repo 未落地的 Admin POS API：
- `POST /api/v2/admin/pos/orders`
- `POST /api/v2/admin/pos/orders/:orderId/payments`
- `GET /api/v2/admin/pos/orders/:orderId`
- `POST /api/v2/admin/pos/orders/:orderId/refund`

> 結論：現在的 Admin POS Lite 是「沿用 booking draft/checkout + 補 manual-payment route」的最小閉環，不是完整 POS 模組。

---

## 2) 角色與責任

- **Operator（營運）**：依本 SOP 執行建單與收款，填寫必要備註（note/admin note）。
- **QA**：以本文件作為檢查基準，驗證 happy path 與 failure path。
- **工程 on-call（Tracy/Judy 指派）**：處理 API 500、狀態機卡死、資料不一致等故障。

---

## 3) Happy Path（最小可行流程）

## 步驟 A：建立草稿訂單（Admin POS channel）
呼叫：`POST /api/v2/bookings/draft`

最小必要欄位：
- `activityId`（UUID）
- `planId`（UUID）
- `startAt`（ISO 8601）
- `timezone`（例如 `Asia/Taipei`）
- `participants`（整數，且符合 plan 限制）
- `sourceChannel: "admin_pos"`
- `contactName` / `contactPhone` / `contactEmail`

成功判斷：回傳 `success=true` 且有
- `bookingId`
- `orderId`
- `bookingStatus = draft`
- `orderStatus = pending_payment`

---

## 步驟 B：收款（二選一）

### B1. ECPay checkout
呼叫：`POST /api/v2/bookings/:bookingId/checkout`
- 預設 provider 為 `ecpay`
- 成功會回 `paymentFormHtml` 與 `paymentParams`

成功前提（若不符會 400）：
- booking 狀態必須為 `draft`
- order 狀態必須為 `pending_payment`

### B2. 手動收款（Admin POS Lite 核心）
呼叫：`POST /api/v2/admin/pos/bookings/:bookingId/manual-payment`

可帶欄位：
- `amountTwd`（可省略；省略時使用 order.total_twd）
- `note`（建議填：收款來源/班別/操作人備註）
- `adminUserId`（可選）

成功判斷：
- `paymentStatus = paid`
- `orderStatus = paid`
- `bookingStatus` 由狀態機推進（預期 `pending_confirmation`）
- 回傳 `paymentId` 與 `paidAt`

---

## 步驟 C：人工確認結果
在 `/admin/orders` 驗證：
1. 對應訂單狀態是否更新（至少到 `paid`）
2. `Admin Note` 是否可見
3. 必要時查看 `Audit Logs` 區塊是否有新紀錄

---

## 4) Failure Path（操作失敗時怎麼辦）

## 4.1 Draft 建單失敗
常見回應：
- `400 VALIDATION_ERROR`：欄位格式錯誤（UUID/時間/電話/email）
- `409 SLOT_UNAVAILABLE`：撞到 blackout / booking conflict / past slot
- `404 NOT_FOUND`：plan 不存在或非 active

處置：
1. 修正輸入（時間、plan、participants）
2. 改其他可售時段後重試一次
3. 若同條件重試仍失敗，升級工程 on-call

## 4.2 Checkout 失敗
常見回應：
- `400 INVALID_STATE_TRANSITION`（booking 非 draft 或 order 非 pending_payment）
- `500 Payment provider not configured` / `ECPAY_MERCHANT_ID not configured`

處置：
1. 先到 `/admin/orders` 確認訂單現況
2. 若為 provider 設定問題，不要重複送 checkout，直接升級工程 on-call

## 4.3 Manual payment 失敗
常見回應：
- `400 INVALID_STATE_TRANSITION`（order 非 pending_payment）
- `400 VALIDATION_ERROR`（amountTwd 非非負整數）
- `404 Booking/Order not found`
- `500 Failed to create manual payment`

處置：
1. 先查是否已收款成功（避免重複收款）
2. 若已產生 payment 但 order/booking 未同步，視為狀態不一致，立即升級工程 on-call

---

## 5) Escalation Path（升級路徑）

以下情況 **15 分鐘內**直接升級：
1. 同一 booking 出現重複收款疑慮
2. `payments` 已寫入但 `orders/bookings` 狀態未同步
3. API 持續 `500`（同場景重試 2 次仍失敗）
4. 無法判定是否可安全重試

升級時附上：
- `bookingId`
- `orderId`
- 失敗 API 路徑與 HTTP status
- request payload（可遮罩個資）
- 發生時間（Asia/Taipei）
- 是否已重試與重試次數

---

## 6) QA 可直接引用的驗證點

最小回歸建議：
1. `npm run test:smoke:admin-pos-line`（`apps/web`）
   - 驗證 draft route 保留 `admin_pos` channel
   - 驗證 Admin POS draft/checkout envelope 形狀
2. `node --test tests/api/v2-admin-pos-manual-payment-regression.test.mjs`
   - 驗證 manual-payment route 仍寫入 payments/payment_events 並透過 shared primitives 更新狀態

> 本 SOP 可作為 QA checklist/review artifact 的 source document；若行為改動，請同 PR 更新此檔與 smoke/regression 測試。

---

## 7) Rollback / Observability / Risks

## 7.1 Rollback（文件層）
- 若此 SOP 與實作不一致，以 `main` 實作為準，先回退到前一版 SOP（git revert 此文件變更），再補正新文件。
- 若功能回退（API route 下線），需同步在本檔「1.1 可用範圍」移除，避免營運誤用。

## 7.2 Observability（目前可觀測面）
- API 錯誤：route 內有 `console.error`（draft/checkout/manual-payment）
- 業務痕跡：`payments`、`payment_events`、`booking_status_logs`、`admin/orders` audit logs
- 回歸保護：
  - `tests/api/v2-admin-pos-line-regression.test.mjs`
  - `tests/api/v2-admin-pos-manual-payment-regression.test.mjs`

## 7.3 目前風險（誠實揭露）
1. **POS API 面向未完整落地**：仍依賴 generic booking route + 一支 manual-payment route。
2. **人工流程依賴高**：重試判斷與異常處置高度依賴 operator 判斷。
3. **外部支付設定風險**：ECPay env 缺漏會直接阻斷 checkout。
4. **資料一致性風險**：極端情況可能出現 payment 與 order/booking 狀態不同步，需要人工升級處理。

---

## 8) 文件維護規則

任一變更涉及下列任一項，必須同步更新本 SOP：
- `/api/v2/bookings/draft` 的 channel/回傳契約
- `/api/v2/bookings/:bookingId/checkout` 狀態前提或回傳契約
- `/api/v2/admin/pos/bookings/:bookingId/manual-payment` 欄位或狀態推進
- `/admin/orders` 人工操作與檢視能力
