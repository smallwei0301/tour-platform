# ECPay 正式商戶切換 + Go-Live 驗證 Runbook

**日期：** 2026-05-11
**執行者：** Wei (smallwei0301@gmail.com)
**對應 Issue：** #315

---

## 1. 商戶帳號資訊

| 項目 | 值 |
|------|-----|
| 商店名稱 | Lazybacktest |
| 商店代號 (MerchantID) | 3472973 |
| 帳號網址 | https://or.ecpay.com.tw |
| 付款方式 | 信用卡一次付清 |

## 2. Production Secrets 設定（Vercel）

以下環境變數已設定於 Vercel project `tour-platform`（production target）：

| 變數名稱 | 說明 |
|----------|------|
| `ECPAY_ENV` | `production` |
| `ECPAY_MERCHANT_ID` | `3472973` |
| `ECPAY_HASH_KEY` | ECPay 後台金流 HashKey |
| `ECPAY_HASH_IV` | ECPay 後台金流 HashIV |
| `ECPAY_CALLBACK_URL` | `https://tour-platform-nine.vercel.app/api/payments/ecpay/callback` |
| `NEXT_PUBLIC_SITE_URL` | `https://tour-platform-nine.vercel.app` |

**取得方法：** ECPay 商家後台 → 系統設定 → 系統介接設定 → 金流/MPOS 的 HashKey / HashIV

## 3. 付款流程架構

```
旅客在 /checkout 選排期 + 填聯絡資料
    ↓
POST /api/orders → 建立 pending_payment 訂單
    ↓
/order/pay 頁面 → 按「前往 ECPay 付款」
    ↓
POST /api/payments/ecpay/create → 呼叫 ECPay AioCheckOut API
    ↓
旅客在 ECPay 頁面輸入信用卡
    ↓
ECPay POST 到 ECPAY_CALLBACK_URL
    ↓
/api/payments/ecpay/callback → 驗證 CheckMacValue → 更新訂單為 paid
    ↓
管理員收到 Email 通知（ADMIN_EMAIL_ALLOWLIST）
    ↓
旅客被 ClientBackURL 導回 /order/success
```

## 4. Go-Live 驗證結果

**驗證日期：** 2026-05-11

| 項目 | 狀態 | 說明 |
|------|------|------|
| 環境變數設定 | ✅ | Vercel production 已設定 |
| 信用卡付款 | ✅ | NT$18 真實交易成功（訂單 `bc53a6eb`）|
| Callback 接收 | ✅ | 訂單自動更新為 `paid`，paid_at 記錄正確 |
| 管理員 Email | ✅ | smallwei0301@gmail.com 收到通知 |
| 返回商店 | ✅ | NEXT_PUBLIC_SITE_URL 設定後，ClientBackURL 正確導回 |
| 退款流程 | ✅ | NT$18 取消授權成功（G19，2026-05-11）。取消授權（void）與退刷（refund）已由 #627 payment-domain 自動化處理，詳見第 8 節。 |

## 5. 退款操作方法

### 從 ECPay 後台手動退款

1. 登入 `or.ecpay.com.tw`
2. 左側 → **信用卡收單** → **交易明細查詢**
3. 搜尋訂單編號或日期
4. 點入訂單 → 「退款」→ 輸入退款金額
5. 確認退款

### 重要限制

- **ECPay 退款不發 callback** — 取消授權/退刷後，tour-platform 透過 #627 payment-domain 自動追蹤狀態；若 callback 未收到，請使用 QueryTradeInfo 對帳（詳見第 8 節）
- 信用卡退款通常 3–5 個工作天入帳
- ECPay 退款需在交易後 180 天內發起
- 部分退款：輸入小於原始金額即可
- **void vs refund 判斷**：已授權未請款 → void（取消授權）；已請款/已結帳 → refund（退刷）；詳見第 8 節

## 6. 已知限制

- `ALLOW_MOCK_PAYMENT=true` 僅允許測試環境使用模擬付款 API；production/soft-launch 的 `/order/pay` 不得出現任何「模擬付款（測試用）」旅客可見 CTA
- ECPay 最低交易金額：信用卡約 NT$10–NT$15
- Callback URL 需為公開可訪問的 HTTPS 網址

## 7. Rollback 方案

若需切換回 sandbox：

```bash
# Vercel → Settings → Environment Variables
ECPAY_ENV=sandbox
ECPAY_MERCHANT_ID=<sandbox MerchantID>
ECPAY_HASH_KEY=<sandbox HashKey>
ECPAY_HASH_IV=<sandbox HashIV>
# 觸發 redeploy
```

## 8. Post-#627 更新 (2026-05)

PR #627 引入 payment-domain 模型，以下為操作層面的重要變更：

### 8.1 付款追蹤層

- `payments` 與 `payment_events` 表成為主要付款狀態來源（取代直接讀寫 `orders.status`）。
- 完整流程：ECPay Callback 收到 → 寫入 `payment_events` → 更新 `orders` 狀態。
- 訂單狀態以 `payment_events` 最後一筆 event 驅動，不再由 callback 直接寫 orders。

### 8.2 Callback 遺失時的 QueryTradeInfo 對帳

若訂單在 ECPay 側顯示已付款，但 app 仍為 `pending_payment`，請執行主動對帳：

1. 從管理後台或 Supabase 取得 `MerchantTradeNo`（訂單內部 ID）。
2. 呼叫 ECPay QueryTradeInfo API，確認 `TradeStatus=1`（付款成功）。
3. 以查詢結果手動補寫 `payment_events`，或觸發 `/api/payments/ecpay/reconcile`（若已部署）。
4. 確認 `orders.status` 自動更新為 `paid`。

> **不要**在 callback 遺失時直接手動改 `orders.status`，應以 provider evidence 驅動修復。

### 8.3 Void vs Refund 決策規則

| 付款狀態 | 操作 | 說明 |
|---------|------|------|
| 已授權，尚未請款（TradeStatus=10）| **Void（取消授權）** | 在 ECPay 後台執行「取消授權」，不產生請款 |
| 已請款/已結帳（TradeStatus=1）| **Refund（退刷）** | 在 ECPay 後台執行「退刷」，3–5 工作天入帳 |
| 狀態不明 | **HOLD** | 不得在未確認 provider 狀態前進行任何退款操作 |

操作後 `payment_events` 將自動記錄退款事件（若 callback 有返回），若無 callback 請以 QueryTradeInfo 確認後手動補記。

### 8.4 Post-debit 部分失敗修復路徑

若訂單在請款後發生部分失敗（例如：付款成功但 email 未發送、訂單狀態未更新）：

1. **不要重新呼叫** ECPay 付款 API（避免重複請款）。
2. 以現有 provider evidence（QueryTradeInfo 回應）確認付款金額與狀態。
3. 根據 evidence 補寫 `payment_events`，讓系統從正確狀態重試後續動作（email、狀態更新）。
4. 在 issue / 管理後台備註修復時間戳與操作者。

---

*本文件由 Claudia (AI) 協助撰寫，2026-05-11；#627 payment-domain 更新補充 2026-05-22*
