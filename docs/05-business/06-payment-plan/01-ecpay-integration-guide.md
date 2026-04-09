# ECPay 綠界串接指南

> **文件版本**: v1.0
> **最後更新**: 2026-04-09
> **負責人**: 技術團隊

---

## 一、商家帳號申請流程

### 1.1 申請流程總覽

```
1. 準備文件 → 2. 線上申請 → 3. 審核 (3-5 工作天) → 4. 開通通知 → 5. 設定金鑰
```

### 1.2 所需文件清單

| 文件 | 說明 | 必要性 |
|------|------|--------|
| 公司登記證明 | 經濟部商業司核發 | 必要 |
| 負責人身分證 | 正反面影本 | 必要 |
| 銀行帳戶資料 | 撥款帳戶存摺封面 | 必要 |
| 網站資訊 | 網址、營業內容說明 | 必要 |
| 發票設定 | 發票字軌申請 (如需開立) | 選用 |

### 1.3 申請步驟

1. **前往綠界官網**: https://www.ecpay.com.tw/
2. **選擇方案**: 全方位金流 → 信用卡收款
3. **填寫申請表**: 公司資料、負責人資料、網站資訊
4. **上傳文件**: 按要求上傳掃描檔
5. **等待審核**: 約 3-5 個工作天
6. **收到開通信**: 內含商店代號 (MerchantID)、HashKey、HashIV

### 1.4 費率資訊

| 方案 | 手續費 | 撥款週期 |
|------|--------|----------|
| 信用卡 (單筆) | 2.75% | T+7 |
| 信用卡 (分期) | 依期數 3-4% | T+7 |
| ATM 虛擬帳號 | 1% (最低 10 元) | T+1 |
| 超商代碼 | 2% (最低 25 元) | T+2 |

---

## 二、沙箱環境測試

### 2.1 測試環境資訊

| 項目 | 值 |
|------|-----|
| 測試後台 | https://vendor-stage.ecpay.com.tw |
| API 網址 | https://payment-stage.ecpay.com.tw |
| 測試商店代號 | `3002607` |
| 測試 HashKey | `pwFHCqoQZGmho4w6` |
| 測試 HashIV | `EkRm7iFT261dpevs` |

### 2.2 測試信用卡資訊

| 卡號 | 有效期 | CVV | 結果 |
|------|--------|-----|------|
| `4311-9522-2222-2222` | 任意未來日期 | 任意3碼 | 成功 |
| `4311-9522-2222-2220` | 任意未來日期 | 任意3碼 | 失敗 |

### 2.3 環境變數設定

```bash
# .env.local (開發環境)
ECPAY_MERCHANT_ID=3002607
ECPAY_HASH_KEY=pwFHCqoQZGmho4w6
ECPAY_HASH_IV=EkRm7iFT261dpevs
ECPAY_API_URL=https://payment-stage.ecpay.com.tw
```

### 2.4 測試流程

1. **建立測試訂單**: 使用 Admin 後台建立測試行程
2. **前台下單**: 完成預訂流程到付款頁面
3. **模擬付款**: 輸入測試信用卡資訊
4. **驗證 Callback**: 確認訂單狀態更新為 `paid`
5. **檢查日誌**: 確認 `payment_callback_received` 事件記錄

### 2.5 測試案例清單

| # | 測試案例 | 預期結果 | 狀態 |
|---|----------|----------|------|
| T1 | 正常付款 | 訂單狀態 → paid | |
| T2 | 付款失敗 | 訂單狀態維持 pending | |
| T3 | 重複 Callback | 訂單狀態不變 (冪等) | |
| T4 | 偽造 Callback | 回傳 400 INVALID_SIGNATURE | |
| T5 | 超過 Rate Limit | 回傳 429 TOO_MANY_REQUESTS | |

---

## 三、正式環境切換 Checklist

### 3.1 切換前檢查

- [ ] 沙箱環境所有測試通過
- [ ] ECPay 正式商店代號已取得
- [ ] HashKey/HashIV 正式金鑰已取得
- [ ] 撥款銀行帳戶已設定
- [ ] 退款流程已測試

### 3.2 環境變數更新

```bash
# Vercel Production Environment
ECPAY_MERCHANT_ID=<正式商店代號>
ECPAY_HASH_KEY=<正式金鑰>
ECPAY_HASH_IV=<正式金鑰>
ECPAY_API_URL=https://payment.ecpay.com.tw
```

### 3.3 部署步驟

1. **更新 Vercel 環境變數**: Settings → Environment Variables
2. **重新部署**: Deployments → Redeploy (Production)
3. **驗證部署**:
   - 檢查 `/api/health` 回應
   - 確認日誌無錯誤
4. **小額測試**: 以真實信用卡進行 $100 測試交易
5. **驗證撥款**: 確認 T+7 後款項入帳

### 3.4 切換後確認

- [ ] 正式環境訂單建立成功
- [ ] Callback URL 正確 (`https://your-domain.com/api/payments/ecpay/callback`)
- [ ] 付款成功 Email 發送正常
- [ ] Admin 後台訂單狀態正確
- [ ] ECPay 後台可查詢訂單

---

## 四、API 串接說明

### 4.1 付款流程圖

```
[前台] → 建立訂單 → [/api/orders]
                        ↓
              生成 ECPay 付款表單
                        ↓
         [使用者] → ECPay 付款頁 → 輸入卡號
                        ↓
              [ECPay] 處理交易
                        ↓
         [ECPay] → Callback → [/api/payments/ecpay/callback]
                        ↓
              驗證 CheckMacValue
                        ↓
              更新訂單狀態 → paid
                        ↓
              發送確認 Email
```

### 4.2 建立付款表單

```typescript
// 組合 ECPay 付款表單參數
const params = {
  MerchantID: process.env.ECPAY_MERCHANT_ID,
  MerchantTradeNo: orderId,  // 訂單編號 (唯一)
  MerchantTradeDate: formatDate(new Date()),  // yyyy/MM/dd HH:mm:ss
  PaymentType: 'aio',
  TotalAmount: totalTwd,  // 整數金額
  TradeDesc: encodeURIComponent('Tour Platform 行程預訂'),
  ItemName: activityTitle,
  ReturnURL: `${baseUrl}/api/payments/ecpay/callback`,  // Server-to-server
  ClientBackURL: `${baseUrl}/booking/complete/${orderId}`,  // 使用者返回
  ChoosePayment: 'Credit',  // 或 ALL
  EncryptType: 1,  // SHA256
};

// 計算 CheckMacValue
params.CheckMacValue = generateCheckMacValue(params, hashKey, hashIV);
```

### 4.3 Callback 處理

**程式碼位置**: `app/api/payments/ecpay/callback/route.ts`

```typescript
export async function POST(request: Request) {
  // 1. Rate Limiting
  const clientIp = RateLimiter.getClientIp(request);
  const result = limiters.ecpayCallback.check(clientIp);
  if (!result.allowed) {
    return Response.json({ error: 'TOO_MANY_REQUESTS' }, { status: 429 });
  }

  // 2. 解析 Payload
  const raw = await request.text();
  const payload = normalizePayload(request.headers, raw);

  // 3. 驗證 CheckMacValue
  const { hashKey, hashIV } = getECPayCredentials();
  if (!verifyCheckMacValue(payload, hashKey, hashIV)) {
    return Response.json({ error: 'INVALID_SIGNATURE' }, { status: 400 });
  }

  // 4. 更新訂單狀態
  const orderId = payload.MerchantTradeNo;
  await processPaymentCallbackDb({ ...payload, orderId });

  // 5. 發送確認 Email (fire-and-forget)
  sendPaymentSuccess({ ... }).catch(() => {});

  // 6. 回應 ECPay
  return Response.json({ received: true, orderId });
}
```

---

## 五、CheckMacValue 驗簽邏輯

### 5.1 驗簽流程

```
1. 取得所有參數 (排除 CheckMacValue)
2. 按參數名稱 ASCII 排序
3. 組合: key1=value1&key2=value2&...
4. 前後加上金鑰: HashKey=XXX&{query}&HashIV=XXX
5. URL Encode (ECPay 特殊規則)
6. 轉小寫
7. SHA256 雜湊
8. 轉大寫
9. 比對 CheckMacValue
```

### 5.2 程式碼實作

**檔案位置**: `src/lib/ecpay.ts`

```typescript
function urlEncodeForECPay(str: string): string {
  return encodeURIComponent(str)
    .replace(/%20/g, '+')
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A');
}

export function generateCheckMacValue(
  params: Record<string, any>,
  hashKey: string,
  hashIV: string
): string {
  // 1. 移除 CheckMacValue
  const cleanParams = { ...params };
  delete cleanParams.CheckMacValue;

  // 2. 排序並組合
  const sortedKeys = Object.keys(cleanParams).sort();
  const paramStr = sortedKeys
    .map((key) => `${key}=${cleanParams[key]}`)
    .join('&');

  // 3. 加上金鑰
  const rawString = `HashKey=${hashKey}&${paramStr}&HashIV=${hashIV}`;

  // 4. URL Encode → 小寫 → SHA256 → 大寫
  const encodedString = urlEncodeForECPay(rawString);
  const lowerCaseString = encodedString.toLowerCase();
  const hash = crypto
    .createHash('sha256')
    .update(lowerCaseString)
    .digest('hex');

  return hash.toUpperCase();
}

export function verifyCheckMacValue(
  params: Record<string, any>,
  hashKey: string,
  hashIV: string
): boolean {
  const receivedMac = params.CheckMacValue;
  if (!receivedMac) return false;

  const computedMac = generateCheckMacValue(params, hashKey, hashIV);
  return computedMac === receivedMac;
}
```

### 5.3 驗簽失敗常見原因

| 原因 | 解決方案 |
|------|----------|
| HashKey/HashIV 錯誤 | 確認使用正確環境的金鑰 |
| URL Encode 規則不符 | 使用 `urlEncodeForECPay()` 函數 |
| 參數排序錯誤 | 確保 ASCII 排序 (區分大小寫) |
| 特殊字元處理 | 注意中文、空白、特殊符號 |

---

## 六、ATM 虛擬帳號流程

### 6.1 付款流程

```
1. 使用者選擇 ATM 付款
2. ECPay 回傳虛擬帳號資訊
3. 使用者於期限內轉帳
4. ECPay 確認入帳後發送 Callback
5. 本平台更新訂單狀態
```

### 6.2 額外回傳參數

| 參數 | 說明 |
|------|------|
| `BankCode` | 銀行代碼 |
| `vAccount` | 虛擬帳號 |
| `ExpireDate` | 繳費期限 (yyyy/MM/dd) |

### 6.3 訂單狀態處理

| 狀態 | 說明 |
|------|------|
| `pending` | 等待付款 (訂單建立) |
| `awaiting_payment` | 已取得虛擬帳號，等待轉帳 |
| `paid` | 付款完成 |
| `expired` | 逾期未付款 |

---

## 七、常見錯誤代碼與處理

### 7.1 ECPay RtnCode

| RtnCode | 說明 | 處理方式 |
|---------|------|----------|
| `1` | 交易成功 | 更新訂單狀態為 `paid` |
| `10100058` | 付款失敗 | 訂單維持 `pending` |
| `10100073` | 卡號錯誤 | 提示使用者重新輸入 |
| `10100090` | 授權失敗 | 提示使用者聯繫銀行 |
| `10100251` | 交易逾時 | 提示使用者重新付款 |
| `10200095` | 訂單已處理 | 忽略 (冪等) |

### 7.2 本平台錯誤碼

| Error Code | HTTP | 說明 |
|------------|------|------|
| `INVALID_REQUEST` | 400 | 缺少必要參數 |
| `INVALID_SIGNATURE` | 400 | CheckMacValue 驗證失敗 |
| `NOT_FOUND` | 404 | 訂單不存在 |
| `BOOKING_CONFLICT` | 409 | 場次已額滿或關閉 |
| `TOO_MANY_REQUESTS` | 429 | 超過 Rate Limit |

### 7.3 錯誤處理範例

```typescript
// Callback route 錯誤處理
try {
  await processPaymentCallbackDb(payload);
} catch (err) {
  const message = err.message;

  if (message.includes('not found')) {
    return Response.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  if (err.code === 'schedule_not_open') {
    return Response.json({ error: 'BOOKING_CONFLICT' }, { status: 409 });
  }

  return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
}
```

---

## 八、測試工具

### 8.1 ECPay 測試工具

- **廠商管理後台 (測試)**: https://vendor-stage.ecpay.com.tw
- **API 文件**: https://www.ecpay.com.tw/Service/API_Dwnld
- **技術客服**: tech_support@ecpay.com.tw

### 8.2 本地測試

```bash
# 執行 ECPay Callback 單元測試
cd apps/web
npm test -- tests/api/ecpay-callback.test.mjs

# 執行 E2E 付款流程測試
npm run test:e2e -- e2e/funnel-booking-payment.spec.ts
```

### 8.3 Callback 模擬

```bash
# 模擬成功付款 Callback
curl -X POST http://localhost:3000/api/payments/ecpay/callback \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "MerchantID=3002607&MerchantTradeNo=TEST123&RtnCode=1&CheckMacValue=..."
```

---

## 九、疑難排解

### 9.1 Callback 未收到

1. 確認 `ReturnURL` 設定正確 (需為可公開存取的 URL)
2. 確認防火牆未阻擋 ECPay IP
3. 檢查 Vercel 日誌是否有錯誤
4. 登入 ECPay 後台查看發送紀錄

### 9.2 重複 Callback

ECPay 可能因網路問題重送 Callback，處理邏輯應為**冪等 (Idempotent)**：
- 檢查訂單是否已為 `paid` 狀態
- 若已處理則直接回應成功
- 不重複扣減庫存或發送 Email

### 9.3 金額不符

- 確認 `TotalAmount` 為**整數** (TWD 以元為單位)
- 確認計算邏輯一致 (前後端)
- 使用 `Decimal` 類型避免浮點誤差

---

## 附錄：ECPay 聯絡資訊

| 類型 | 聯絡方式 |
|------|----------|
| 技術客服 | tech_support@ecpay.com.tw |
| 客服電話 | 02-2655-1775 |
| 營業時間 | 週一至週五 09:00-18:00 |
| 官網 | https://www.ecpay.com.tw |
