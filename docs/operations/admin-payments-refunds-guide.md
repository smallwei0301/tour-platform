# 後台金流／退款處理說明（ECPay vs 現金）

> 維運用操作指南。對應後台頁面 `/admin/help/payments-refunds`（由訂單詳情的「📖 金流／退款處理說明」連結進入）。**更新時請兩處同步。**

---

## ① 先分辨：ECPay 訂單 vs 現金訂單

系統以訂單的 `trade_no` 欄位判斷金流類型：

| 類型 | 判斷 | 退款方式 |
| --- | --- | --- |
| ECPay 線上付款 | `trade_no` 有值（ECPay 交易序號） | 透過 ECPay API 自動沖銷／退刷 |
| 現金／線下 | `trade_no` 為空 | 維運人工結案（金錢於線下退還，系統只記錄狀態） |

訂單詳情下方「付款紀錄 trade_no」區塊可確認是否為 ECPay 訂單；執行退款時系統會自動依此選擇 ECPay 沖銷或現金結案。

---

## ② 正常流程（無退款）

### ECPay 線上付款
1. 旅客送出訂單 → `pending_payment`（占用名額等待付款）。
2. ECPay 付款成功 callback → 自動轉 `paid`（計入 GMV、發通知）。
3. （可選）確認 → `confirmed`。
4. 行程結束 → `completed`；唯一進入出帳結算的狀態，並觸發評價邀請。

### 現金／線下付款
1. 建立訂單 → `pending_payment`。
2. 收到現金後，維運於訂單詳情把狀態改為 `paid` 並儲存。
3. 行程結束 → `completed`。

---

## ③ 退款流程（正常）

> **重點觀念：**「退款管理」頁面列的是**退款申請（`refund_requests`）**，不是「狀態為退款中的訂單」。只有真正建立退款申請，訂單才會出現在退款管理。

### 建立退款的兩個正規入口
- **旅客自行申請退款** → 自動建立退款申請、訂單轉 `refund_pending`。
- **後台「取消＋退款」**（訂單詳情按鈕）→ 一次完成：取消訂單、釋放名額、建立**全額**退款記錄並結案為 `refunded`。對應 `POST /api/admin/orders/{orderId}/cancel`，具 `requestId` 冪等性。

### 「執行退款」按鈕（訂單已是退款中時）
- 訂單為 `refund_pending` 時，詳情下方出現「執行退款」。
- **ECPay 訂單**：系統自動向 ECPay 送出全額沖銷／退刷，成功後轉 `refunded`。
- **現金訂單**：必須填寫退款原因，按下後系統標記為已退款（金錢於線下退還）。

---

## ④ 異常處理與常見問題

### ⚠️ 請勿用「狀態下拉」手動改成「取消／退款中」來退款
下拉只改訂單狀態，**不會**釋放名額、**不會**建立退款申請；改完後訂單還會被鎖定，造成「退款管理看不到、執行退款也失敗」的孤兒訂單。**請改用「取消＋退款」按鈕。**

### 鎖定（terminal）狀態
下列狀態切換後訂單即鎖定、無法再用下拉編輯：`completed`、`refunded`、`refund_pending`、`cancelled_by_user`、`cancelled_by_guide`。若需退款請走上述正規入口。

### 「執行退款」失敗時的常見錯誤碼
| 錯誤碼 | 意義 | 處置 |
| --- | --- | --- |
| `INVALID_STATUS` | 訂單不在退款中、或已無可沖銷記錄 | 改走「退款管理」人工處理 |
| `REASON_REQUIRED` | 現金訂單未填退款原因 | 補填原因 |
| `PAYMENT_NOT_REVERSIBLE` | 找不到可沖銷付款或多筆無法判定 | 人工處理 |
| `ECPAY_QUERY_FAILED` / `ECPAY_STATE_UNKNOWN` / `ECPAY_REVERSAL_FAILED` / `ECPAY_REFUND_FAILED` | ECPay 查詢／沖銷失敗 | 稍後再試或改人工退款 |
| `DB_UPDATE_FAILED` | 資料庫寫入失敗，退款未完成 | 重試 |

> 自 [本次修正] 起，後台「執行退款」失敗會直接顯示真正的錯誤碼與訊息，不再只顯示死的「退款執行失敗」。

---

## 一句話結論
要退款就用「**取消＋退款**」按鈕（進行中訂單）或「**執行退款**」按鈕（已是退款中），不要手動拉狀態。退款管理頁是審核／追蹤退款申請用的，不是改訂單狀態用的。

---

## 附錄：本次修正的後端 bug（供工程參考）

過去「取消＋退款」API 在兩條路徑都是壞的，contract 測試只做 regex 檢查所以未抓到：

1. **in-memory**：`cancelOrderAdminDb` fallback 呼叫 store 未 export 的 `getOrders/setOrders`，直接丟 `getOrders is not a function`。
2. **Supabase**：`cancelOrderAdminDb` 先把狀態設成 `cancelled_by_guide`，但 `createRefundRequestDb` 對 `cancelled_by_guide` 直接拒絕（`order cannot request refund in current status`），導致退款 entry 永遠建不出來、訂單卡在 `cancelled_by_guide` 無退款記錄。

修正：fallback 改直接 mutate `store.orders` 並釋放名額；`createRefundRequestDb`／`createRefundRequest` 新增 `allowAdminCancelled` 旗標，由 `createAdminPosRefundEntryDb` 帶入以放行 `cancelled_by_guide`（仍擋 `cancelled_by_user`／`refunded`）。行為測試見 `apps/web/tests/api/admin-cancel-refund-flow.test.mjs`。
