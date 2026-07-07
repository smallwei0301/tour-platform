# 後台金流／退款處理說明（ECPay vs 現金）

> 維運用操作指南。對應後台頁面 `/admin/help/payments-refunds`（由訂單詳情的「📖 金流／退款處理說明」連結進入）。**更新時請兩處同步。**

---

## ⓪ 全鏈流程總覽：旅客下單 → 導遊收帳（#1637）

```
下單 → 付款(自動;POS備援) → 已確認(自動;人工切換備援) → 已完成(sweep+掃碼;人工備援)
→ 結算入餘額(每日自動;退款紅沖自動) → 產生出款單(自動;手動產單備援)
→ 確認出帳(唯一純手動步驟) → 導遊已入帳(自動連動) → 月結報表(手動產出)
```

1. **下單**：`pending_payment` 占用名額。備援：admin POS 手動建單。逾期未付由每日 02:00（台北）排程自動取消。
2. **付款**：ECPay callback 驗簽＋金額比對（TradeAmt＝訂單總額）後原子轉態。備援：POS 手動標記已付款；自行匯款查帳後確認。
3. **已確認**：線上付款成功的 V2 訂單**付款當下自動**直上 `confirmed`。備援：舊單／POS 單／方案未設 booking_type 者於訂單管理人工切換。
4. **已完成**：出團後滿 48 小時（每日 02:30 sweep）自動完成，或導遊掃憑證 QR／輸短碼提前核銷（`/guide/redeem`）。備援：人工切換（缺出團時間者只能人工）。
5. **結算入餘額**：每日 10:00 sweep——completed＋有 paid_at＋出團後 T+7＋無 hold → 餘額 +（總額−已退款）×85%；退款自動紅沖。無手動直改餘額（刻意）。
6. **產生出款單**：餘額 ≥ NT$5,000 自動建 pending 單（每導遊一張）。備援：出款管理「手動產生出款單」。
7. **確認出帳**：**唯一純手動步驟**（對應真實銀行匯款）——出款管理填流水號＋「確認出款」；金額過期先「取消」再重產。
8. **導遊端數字**：可結算餘額／待出款／已入帳累計即時自動連動。
9. **月結報表**：`/admin/reports` 手動選月產出（含對帳異常清單＋CSV）。

卡單排查：停在 `paid` → 人工切 `confirmed`；`confirmed` 超過出團後 48h → 查缺出團時間（stalled）；`completed` 沒入餘額 → 查 paid_at／T+7／hold。完整版見 `docs/operations/order-to-payout-flow-map.md`。

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
2. ECPay 付款成功 callback（驗簽＋金額比對）→ **自動**直上 `confirmed`（#1637 起）。停在 `paid` 的是修復前舊單或方案未設 booking_type 者，需人工切「已確認」。
3. 行程結束 → `completed`：出團後滿 48 小時自動完成（每日 02:30 sweep），或導遊掃憑證 QR／輸短碼提前核銷；也可人工切換。
4. `completed` 是唯一進入出帳結算的狀態（結算另要求 paid_at 有值、過 T+7、無 hold），並觸發評價邀請。

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

## ④ 部分退款機制（目前現況）

> **一句話：後台「執行退款」已支援手動輸入部分金額，ECPay 訂單會以該金額實際向 ECPay 退刷、現金訂單記錄為實退金額。**（旅客自助／自動退款與「取消＋退款」按鈕仍為全額。）

### ① 怎麼做部分退款（推薦流程）
1. 訂單需為 `refund_pending`（退款中）。詳情下方「退款執行」區塊有 **「退款金額（NT$）」** 輸入框（`data-guide="refund-amount-input"`）。
2. **留空＝全額退款**；填入較小的整數金額（≤ 訂單總額）即為部分退款。前端先擋「>0 整數、≤ 訂單總額」，後端 `resolveRefundAmount()` 再驗一次。
3. **ECPay 訂單**：系統以你填的金額向 ECPay 送出退刷（`requestEcpayDoAction` 的 `TotalAmount`），成功後 `orders.refunded_amount` 記為該金額、訂單轉 `refunded`。
4. **現金訂單**：需填退款原因；按下後 `refunded_amount` 記為你填的金額（金錢於線下退還）。

> **⚠️ 授權未請款（信用卡尚未請款）只能全額取消授權。** 此情況走 ECPay `DoAction Action=N`（取消授權，全有或全無）；若填入部分金額會被擋下並回 `PARTIAL_REFUND_UNSUPPORTED`（409）。需部分退款請先完成請款後再退刷。

### ② 退款政策仍會算出建議比例（供參考）
分層退款政策（資料表 `refund_policies`，欄位 `tiers`），依「距出發剩餘時數」決定可退比例 `refund_pct`（愈早取消退愈多）。計算函式 `calculateRefundAmount()` 回傳 `refundable_amount`，並於旅客申請時快照到 `refund_requests.policy_snapshot`。維運可**參考**此建議金額填入退款金額欄。旅客申請退款前也會透過退款預覽（`/api/v2/orders/[orderId]/refund-preview` + `RefundPreviewBanner`）看到「預計可退金額／比例」。

### 仍為全額的入口
旅客自助退款、自動退款（`REFUND_AUTO_EXECUTE`）、以及「取消＋退款」按鈕（`createAdminPosRefundEntryDb`）目前仍退**全額 `total_twd`**；`policy_snapshot.refundable_amount` 尚未被這些入口自動採用。需部分退款時請改用退款中訂單的「執行退款」並手動填金額。

### ③ 出帳結算
出帳公式 `(總額 − 已退款) × 85%` 已支援部分金額。透過「執行退款」輸入部分金額時，`refunded_amount` 會正確寫入，導遊出帳即自動反映部分退款。

---

## ⑤ 異常處理與常見問題

### ⚠️ 「狀態下拉」已停用「取消／退款中／已退款」（防呆）
這些終端狀態若用下拉手動設定，只會改狀態、**不會**釋放名額也**不會**建立退款申請，會造成「退款管理看不到、執行退款也失敗」的孤兒訂單。**前端已停用該選項、後端也會擋下（回 409 `MANUAL_STATUS_CHANGE_BLOCKED`）。** 退款一律用「取消＋退款」按鈕或退款中訂單的「執行退款」。

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
