# Tour Platform MVP Demo Runbook

## 1) Setup
- `cd tour-platform`
- `cp apps/web/.env.example apps/web/.env.local`
- fill required env vars (optional for fallback demo)
- `npm install`

## 2) Start server
- `npm run dev -w @tour/web`

## 3) Demo script (API first)
- `curl http://localhost:3000/api/experiences`
- `curl -X POST http://localhost:3000/api/orders -H 'content-type: application/json' -d '{"experienceSlug":"chaishan-cave-tour"}'`
- `curl -X POST http://localhost:3000/api/payments/ecpay/callback -H 'content-type: application/json' -d '{"orderId":"ord_0001"}'`
- `curl http://localhost:3000/api/admin/orders`

## 4) UI paths
- `/`
- `/experiences/chaishan-cave-tour`
- `/checkout`
- `/order/success`
- `/admin/ops/orders`
