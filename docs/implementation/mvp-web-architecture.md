# MVP Web Architecture Scaffold
## Structure
- apps/web: app skeleton (marketing/booking/admin/api)
- packages/ui: shared UI primitives
- packages/config: shared config placeholder
- supabase/migrations: DB schema + rollback
## Routes
/, /experiences/[slug], /checkout, /order/success, /admin/ops/orders
## APIs
GET /api/experiences, POST /api/orders, POST /api/payments/ecpay/callback, GET /api/admin/orders
## Dev
npm install && npm run test && npm run dev
