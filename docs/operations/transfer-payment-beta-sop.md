# 匯款付款 Beta 人工核帳 SOP（Issue #1607）

> 適用範圍：導遊商店的受控匯款 beta。匯款付款 flag 預設關閉；本文件不代表正式上線、廣泛放量或自動開啟 flag。
>
> 本文件不包含任何密鑰、token、銀行帳號、旅客個資或真實訂單資料。所有時間以台北時區計算。

## 1. 角色與責任

- **營運／客服**：依本 SOP 查收款項、留下可追溯備註，並回覆旅客。
- **值班工程師**：處理 API 500、付款／訂單狀態不一致、重複入帳疑慮。
- **功能 owner**：決定是否在 Vercel 開啟 `NEXT_PUBLIC_TRANSFER_PAYMENT_ENABLED=1`，以及何時停止 beta。

## 2. 開啟前檢查

1. 確認商店本身已由 owner 以 `NEXT_PUBLIC_GUIDE_SHOP_ENABLED=1` 開啟。
2. 由 owner 在 Vercel 設定 `NEXT_PUBLIC_TRANSFER_PAYMENT_ENABLED=1`，重新部署後才會生效；不要在本機 commit、Issue、聊天或 log 寫入任何 secret value。
3. 確認值班人員能登入 Admin POS，且可取得 CSRF token。瀏覽器操作使用 admin session cookie；自動化操作使用既有的 `x-admin-token`／`x-admin-email` header。不要把憑證放在 URL query string。
4. 先以一筆內部／低量訂單確認：付款頁出現「自行匯款」、送出後訂單頁出現「等待對帳確認」，且後台可看到 pending 訂單。
5. 若無法完成上述檢查，維持 flag 關閉，不進行 beta 放量。

## 3. 對帳頻率與時效

- 每個營業日最少查兩次（上午一次、下午一次）；量增加時由值班 owner 調高頻率。
- 對旅客承諾：收到匯款後由祕島人工對帳，**1–2 個工作天內確認並通知**。
- 週末與國定假日不算工作天；若遇銀行入帳或人工核帳延遲，先保留訂單並主動通知旅客，不要為了趕 SLA 直接猜測入帳。

## 4. 人工核帳流程

### 4.1 找到待處理訂單

1. 在 Admin POS／管理訂單頁用 `orderId` 或 `bookingId` 找到訂單。
2. 確認訂單仍是 `pending_payment`，且付款資料的 provider 是 `transfer`；確認導遊、行程、日期／時段、旅客人數、聯絡方式與應付金額。
3. 若訂單已是 `paid`、`confirmed`、`cancelled` 或其他非預期狀態，先查看付款事件與 audit log，不要再次送出核帳。

### 4.2 比對銀行入帳

逐項核對銀行交易與訂單：

- 金額完全等於訂單應付金額（不接受只靠備註推定差額）。
- 入帳時間、交易末碼／對方名稱等可核對資訊相符。
- 沒有同一筆銀行交易已被其他訂單使用的跡象。

金額不符、資料不完整、疑似重複或無法判定時，先標記待查並升級工程／財務，不要強行標記已付款。

### 4.3 標記已入帳

使用既有 Admin POS endpoint：

```text
POST /api/v2/admin/pos/bookings/:bookingId/manual-payment
```

request body 僅送必要的非敏感資訊，例如：

```json
{
  "amountTwd": 4800,
  "note": "已核對銀行入帳；交易識別資訊依內部遮罩規範記錄",
  "adminUserId": "<internal-admin-id>"
}
```

成功後應確認：

1. 原本的 `provider=transfer` payment 變為 `paid`（不可另建第二筆同訂單付款）。
2. `orders.status`／`payment_status` 變為 `paid`。
3. booking 依既有狀態機前進，並留下 `payment_events`、`booking_status_logs` 與 admin audit 紀錄。
4. 回應中的 `paymentId`、`orderId`、金額與訂單一致。

若 request timeout 或回應遺失，先重新查狀態再決定是否重試；不得直接重複入帳。

## 5. 通知旅客與未完成匯款

- 核帳成功後，依既有通知流程告知旅客已收到款項／訂單正在確認；不要在公開訊息重複貼出完整銀行帳號。
- 訂單頁的「等待對帳確認」只代表旅客已送出匯款付款意圖，不代表銀行款項已核實入帳。
- 尚未查到入帳時，保留 `pending_payment`，在下一個對帳批次再查；必要時先聯絡旅客確認匯款時間與末碼。
- 不要使用一般未付款清理流程直接取消已取得匯款資訊或已回報的訂單。需要取消時，先完成查無入帳與聯絡紀錄，再依現行取消／退款政策處理。

## 6. 異常與升級

立即停止重試並升級的情況：

- payment 已寫入但訂單／booking 狀態沒有同步。
- 同一訂單看到多筆付款或同一銀行交易疑似重複使用。
- API 回傳 500、權限錯誤或資料庫 constraint 錯誤。
- 金額不符、付款人無法辨識，或無法判斷是否已入帳。

升級資訊只提供遮罩後的 `bookingId`／`orderId`、發生時間、API status、錯誤 code、是否重試；不要附 token、完整銀行資料或未遮罩個資。

## 7. 停止 beta／回滾

1. owner 將 `NEXT_PUBLIC_TRANSFER_PAYMENT_ENABLED` 設為 `0` 或移除，重新部署後停止新的匯款付款入口。
2. 既有 transfer intent 不刪除、不直接改資料庫；依第 4–6 節完成核帳或人工聯絡。
3. 若出現付款資料不一致，先保留 flag 關閉，建立 incident 並由工程師修復／驗證後才重新評估開啟。

## 8. 驗收與證據

在提交或啟用前，至少保留以下證據：

```bash
node --test \
  tests/api/issue1475-transfer-payment.test.mjs \
  tests/ui/shop-landing-contract.test.mjs \
  tests/ui/issue1607-guide-shop-beta-contract.test.mjs
```

真實瀏覽器驗證需分別記錄 flag OFF 與 ON；若執行環境沒有可用 Chromium，不得把 source contract 或 production build 代稱為 live browser pass，應標註為 `NOT_VERIFIED-live`。
