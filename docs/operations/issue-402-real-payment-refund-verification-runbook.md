# Issue #402：真實付款/退款/Email side-effect 驗證 runbook

**Issue:** [#402 真實金流驗證](https://github.com/smallwei0301/tour-platform/issues/402)
**Owner:** 產品/營運/QA
**Status:** `OPEN`（尚未結案）
**Last updated:** 2026-05-14

> 這份文件是「操作指南」而非已完成證據；執行人可直接複製步驟記錄結果。

## 1. 為什麼是 blocker

- PR #501 只做 **SimulatePaid** callback no-op guard，確保模擬交易不會污染交易與通知。
- #402 的開啟原因是：**未完成真實 ECPay 成功付款、退款、Email side-effect 的可重複驗證證據**。
- 在未提供可驗證證據前，不能視為正式上線完成條件。

## 2. 目標

在受控流程下，證明以下三件事可在本專案可追溯與審核：
1. 以真實（非 SimulatePaid）流程完成付款，訂單狀態更新為 paid 且符合預期。
2. 退款流程可被發起並在訂單層可核對為 refunded（或由系統記錄的等價狀態）。
3. 旅客與管理員側 Email side-effect 可確認送達與內容一致。

## 3. 前置條件（由執行人確認）

### 3.1 必要授權 / 權限
- 有權限登入管理後台並檢視訂單。
- 有權限存取交易方（ECPay）環境，且能查到對帳 / 交易紀錄。
- 有權限讀取發送日誌（或 mail inbox logs）
- 有權限操作/觀看訂單備註、狀態、事件/回呼日誌。

### 3.2 安全與隱私
- **不得**記錄或貼出以下敏感值：`ECPAY_HASH_KEY`, `ECPAY_HASH_IV`, API secret。
- 交易金額需採低額測試交易策略（依公司規定，保留可追溯證明）。
- 若使用測試信箱/測試信箱帳號，記錄為匿名代號，不外流個資。

### 3.3 外部前提（已知限制）
- SimulatePaid 與真實 callback 行為有差異：`ALLOW_MOCK_PAYMENT=true` 僅為測試開關概念，不能取代真實付款流程。
- ECPay 側可能不提供完整退款 callback；需以實際結果與對帳/日誌交叉驗證。

## 4. 執行流程（最小可重複路徑）

### 4.1 付款成功驗證
1. 準備一筆可控的測試/真實低額交易訂單。
2. 確認交易流程進入正式付款域，不走 SimulatePaid path。
3. 執行付款後，核對：
   - 本地訂單頁面/後台的 `status`、`paid_at`、`payment` 紀錄
   - callback endpoint 回傳是否可被追蹤（請記下 callback 時間戳）
   - ECPay/商戶中心是否出現交易紀錄（含 `tradeNo` / `orderId` 對應）
4. 將以下資訊寫進 evidence log：
   - Order ID / internal id
   - ECPay tradeNo 或等價交易識別
   - 交易起始與 callback 時間
   - 訂單最終狀態

### 4.2 退款驗證
1. 啟動退款請求（須有合法授權）。
2. 記錄退款發起時間、操作者、原因代號與金額。
3. 觀察回寫結果：
   - 訂單/交易事件是否被更新
   - 若商戶端未回傳即時 callback，需以供應商後台/對帳資料交叉比對
4. 記錄：
   - Refund request id / 相關交易 id
   - 商戶端回覆或 API 回應摘要
   - 本地訂單最終狀態
   - 若有 manual reconcile，寫明「需人工更新」與時間戳

### 4.3 Email side-effect 驗證
1. 付款成功後確認旅客信箱與管理員信箱各至少 1 則收件。
2. 核對關鍵欄位：
   - 時間戳（send time）
   - 訂單編號/景點名稱/金額
   - 收件主旨與內容關鍵段落（可截短）
3. 以 mail log 或 provider 面板導出 delivery status（若可），至少保留可追溯的 message id。
4. 記錄未送達或延遲情況與重送證據。

## 5. 證據清單（最小可提審包）

- 付款證據：
  - 交易鏈接：訂單頁面截圖（遮罩敏感資訊）
  - 訂單狀態截圖或 log excerpt（只保留非敏感欄位）
  - callback/event 記錄 timestamp
- 退款證據：
  - 退款請求時間與結果
  - 對帳紀錄截取（含 trade/order 對應）
  - 訂單最終狀態變更證據
- Email 證據：
  - 旅客/管理員通知 message id（必要時隱碼）
  - 郵件發送/接收時間
  - delivery status 或 provider log
- 風險註記：
  - 若無退款 callback，需在 issue 討論中清楚標記為 manual/manual-confirmation dependency。

## 6. 風險與阻塞項

- 未取得可控測試 traveler account/信用卡通道
- 交易方 CAPTCHA / OTP 造成自動化難度升高
- SimulatePaid 與 real flow 混淆
- 測試信箱或 sendgrid/resend 日誌不可見
- 退款只回報成功但未同步本地 refunded 狀態

## 7. 交付格式（對 issue / PR 友好）

完成一次流程後回填：
- `issue402_run_id`: （自訂識別）
- `paid_order_id`:
- `trade_no`:
- `paid_at`:
- `refund_requested_at`:
- `refund_final_state`:
- `traveler_email_msg_id`:
- `admin_email_msg_id`:
- `evidence_paths`:（issue comment / repo docs / CI link）
- `blockers`:（有則列出）

## 8. 何時可判定 #402 可被關閉

當以下條件同時成立且可追溯時，才可關閉 #402：
1. 至少一筆真實付款成功且 callback 可驗證
2. 退款閉環有完整追蹤（含必要的 manual reconcile 記錄）
3. 旅客與管理員 email side-effect 可被重複驗證
4. PR #501 的 SimulatePaid guard 被明確視為補強，不被混淆為真實付款證據

---

## 9. 相關鏈結與責任邊界

- 根 README、`docs/README.md`：上線主線導覽
- `docs/operations/booking-v2-b3-rollout.md`：放量與風險節點
- `docs/operations/booking-v2-daily-go-no-go.md`：daily go/no-go 節奏
- `docs/qa/booking-v2-rollout-manual-checklist.md`：人工回歸

> 完成後請將上述 evidence 檢核結果同步到 issue #402 / #504 / #503 所對應的檢核清單。