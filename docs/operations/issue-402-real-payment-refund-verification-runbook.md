# Issue #402：真實付款/退款/Email side-effect 驗證 runbook

**Issue:** [#402 真實金流驗證](https://github.com/smallwei0301/tour-platform/issues/402)
**Owner:** 產品/營運/QA
**Status:** `CLOSED`（issue closed；文件保留為歷史/未來參考）
**Last updated:** 2026-05-17

> 這份文件不再是當前 blocker；文件保留為歷史 runbook / 下一輪人工驗證參考。
> 重要：Go/No-Go 仍以人工 QA sign-off（#500）為先決條件，文件本身僅為歷史驗證參考。

## 1. 文件定位


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
- 退款只回報成功但未同步本地 refunded 狀態（#627 後此項已由 payment_events 自動追蹤）

## 6a. #627 Payment-Domain 模型補充（2026-05）

PR #627 合併後，以下操作規則取代或補充原有流程描述：

### Provider-paid / App-pending 狀態不一致

**舊做法：** 手動直接更新 `orders.status`。

**新做法（#627 起）：** 使用 QueryTradeInfo 對帳，以 provider evidence 驅動修復：
1. 以 `MerchantTradeNo` 呼叫 ECPay QueryTradeInfo，確認 `TradeStatus=1`。
2. 補寫 `payment_events`（或呼叫 `/api/payments/ecpay/reconcile`）。
3. 系統自動將 `orders.status` 更新為 `paid`。
4. **不得**在缺乏 provider evidence 的情況下直接改訂單狀態。

### Void（取消授權）vs Refund（退刷）

| 情境 | 操作 | 備註 |
|------|------|------|
| 付款已授權，尚未請款 | **Void（取消授權）** | ECPay 後台操作；不產生請款紀錄 |
| 付款已請款/已結帳 | **Refund（退刷）** | ECPay 後台操作；3–5 工作天入帳 |
| Provider 狀態不明 | **HOLD** | 未取得明確 provider 狀態前禁止任何退款動作 |

退款操作後，若 ECPay 發回 callback，`payment_events` 自動記錄；若無 callback，請以 QueryTradeInfo 確認後手動補記。

### Post-debit 部分失敗修復

若請款成功但後續步驟（email、狀態更新）部分失敗：
1. **不要重送** ECPay 付款 API（避免重複請款）。
2. 以 QueryTradeInfo 取得 provider evidence，確認金額與狀態。
3. 以 evidence 補寫 `payment_events`，讓系統從正確狀態重試後續動作。
4. 在管理後台或 issue 備註修復時間戳與操作者。

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

## 8. 歷史關閉條件（供追溯）

#402 曾被視為可關閉條件（可作為往後再驗證參考）：
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

> 若後續再有驗證循環，請將 evidence 檢核結果同步到 issue #402 / #504 / #503 對應的檢核清單（必要時註明為重跑）