# ECPay 多元付款（ATM／超商）現況與 follow-up（#1590）

> 健檢 v2 P0-3 第一波：ATM＋超商代碼。

## 現況：程式面已提供

`app/api/v2/bookings/[bookingId]/checkout/route.ts` 與 `src/lib/ecpay-create-orchestration.mjs`
建立 ECPay AioCheckOut 時皆帶 **`ChoosePayment: 'ALL'`**。ECPay 的 `ALL` 代表「顯示商店帳號
**已啟用的全部付款方式**」，包含信用卡、**ATM 轉帳、超商代碼(CVS)**、（視帳號）超商條碼、
WebATM 等。

因此「讓旅客能用 ATM／超商付款」的**程式面已滿足**——旅客在 ECPay 付款頁即可選 ATM/超商，
取得虛擬帳號／繳費代碼並於期限內付款；ECPay 入帳後照既有 callback（`payments/ecpay/callback`）
的 atomic RPC 冪等鏈把訂單轉 paid。

## 需 owner 確認（ECPay 商店後台，非程式碼）

`ALL` 只會顯示**商店帳號已啟用**的方式。owner 需在 ECPay 廠商後台確認 **ATM／超商代碼**
兩項付款已開通（測試環境 stage 與正式環境各一次）。若未開通，付款頁不會出現該選項。

## Follow-up（需 P0-OVERRIDE，凍結區）

以下屬凍結區 `app/api/payments/ecpay/**`（鐵律 3），需使用者 `P0-OVERRIDE` 授權才動：

1. **PaymentInfoURL 回呼**：ATM/CVS 為「先取號、後付款」，ECPay 會非同步 POST 虛擬帳號／
   繳費代碼到 PaymentInfoURL。目前未接該回呼 → 平台不儲存、訂單頁無法**站內重顯**取號資訊
   （旅客只能靠 ECPay 頁面/Email）。接上後可在訂單頁顯示「ATM 虛擬帳號 / CVS 代碼＋繳費期限」。
2. **逾期窗對齊**：ATM/CVS 的付款期限（`ExpireDate`／`StoreExpireDate`）比信用卡長；
   `unpaid-expiry-sweep` 目前以較短窗過期，需對 ATM/CVS 訂單改用取號效期，避免未到期就被判逾期。

上述兩項屬 UX／對帳強化，不影響「旅客已可用 ATM／超商付款」的核心結論。分期與 LINE Pay 為第二波。
