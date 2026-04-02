# Vercel Deploy Checklist — Tour Platform MVP

## 1) Repo / Project
- [ ] GitHub repo 已推送最新 main
- [ ] 在 Vercel 建立專案並指向 `smallwei0301/tour-platform`
- [ ] Root Directory 設為 `.`
- [ ] Build Command：`npm run build -w @tour/web`
- [ ] Install Command：`npm install`

## 2) Environment Variables
### 必填（最小）
- [ ] `NEXT_PUBLIC_APP_URL`
- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `ECPAY_MERCHANT_ID`
- [ ] `ECPAY_HASH_KEY`
- [ ] `ECPAY_HASH_IV`
- [ ] `ECPAY_CALLBACK_URL`

### 建議
- [ ] `NODE_ENV=production`

## 3) Post-Deploy Smoke
- [ ] `GET /api/experiences` 回 200
- [ ] `POST /api/orders` 可建立訂單
- [ ] `POST /api/payments/ecpay/callback` 可更新狀態
- [ ] `GET /api/admin/orders` 可看到毛利欄位
- [ ] 首頁與 4 個關鍵路由可正常打開

## 4) Rollback
- [ ] 保留上一個成功部署（Vercel deployment history）
- [ ] 若 API 異常，先回切上一版再調查
