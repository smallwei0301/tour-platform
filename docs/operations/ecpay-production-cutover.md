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
| 退款流程 | ✅ | NT$18 取消授權成功（G19，2026-05-11）。ECPay 不發退款 callback，訂單狀態需管理員手動更新。自動退款 API 為後續 issue (#304 P1c) |

## 5. 退款操作方法

### 從 ECPay 後台手動退款

1. 登入 `or.ecpay.com.tw`
2. 左側 → **信用卡收單** → **交易明細查詢**
3. 搜尋訂單編號或日期
4. 點入訂單 → 「退款」→ 輸入退款金額
5. 確認退款

### 重要限制

- **ECPay 退款不發 callback** — 取消授權/退刷後，tour-platform 訂單狀態**不會自動更新**，需管理員手動在後台改為 `refunded`
- 信用卡退款通常 3–5 個工作天入帳
- ECPay 退款需在交易後 180 天內發起
- 部分退款：輸入小於原始金額即可
- 自動退款 API（AllRefund）為待實作功能，見 #304 P1c

## 6. 已知限制

- `ALLOW_MOCK_PAYMENT=true` 設定允許測試環境使用模擬付款（正式上線前應移除）
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

---

*本文件由 Claudia (AI) 協助撰寫，2026-05-11*
