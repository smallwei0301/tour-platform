# Tour Platform MVP Demo Runbook

## 1) Setup
- `cd tour-platform`
- `cp apps/web/.env.example apps/web/.env.local`
- fill required env vars (optional for fallback demo)
- `npm install`

## 2) Start server
- `npm run dev -w @tour/web`

## 3) 一鍵 Smoke 驗證
- `bash scripts/demo-smoke.sh`
- 或指定 URL：`bash scripts/demo-smoke.sh http://localhost:3000`

## 4) UI Demo 路徑
- `/`（首頁）
- `/experiences/chaishan-cave-tour`（行程頁）
- `/checkout?slug=chaishan-cave-tour`（下單）
- `/order/success?orderId=...`（成功）
- `/admin/ops/orders`（後台追蹤）

## 5) 對外展示話術（60 秒）
1. 這是「單一導遊可交易 MVP」，先驗證成交閉環，不做大而全。
2. 從首頁進入行程，旅客可一鍵建立訂單。
3. 付款 callback 後，後台即時看到訂單狀態與毛利欄位。
4. 架構已預留 Supabase 與 ECPay，下一步可直接接真金流與真資料。
