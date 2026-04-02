# @tour/web

## Quick start

```bash
cp .env.example .env.local
npm install
npm run dev -w @tour/web
```

Open http://localhost:3000

## 一鍵 Smoke

```bash
bash ../../scripts/demo-smoke.sh
```

## Demo flow
1. `GET /api/experiences`
2. `POST /api/orders` with `{ "experienceSlug": "chaishan-cave-tour" }`
3. `POST /api/payments/ecpay/callback` with `{ "orderId": "<from step2>" }`
4. `GET /api/admin/orders`

## Notes
- With `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, APIs switch to Supabase mode.
- Without env, APIs use in-memory fallback store for quick demo.
