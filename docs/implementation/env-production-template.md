# Production ENV Template (for Vercel)

```env
NEXT_PUBLIC_APP_URL=https://<your-vercel-domain>
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
ECPAY_MERCHANT_ID=<merchant-id>
ECPAY_HASH_KEY=<hash-key>
ECPAY_HASH_IV=<hash-iv>
ECPAY_CALLBACK_URL=https://<your-vercel-domain>/api/payments/ecpay/callback
```

> 注意：`SUPABASE_SERVICE_ROLE_KEY` 只能放在 server 端環境，不可曝露到前端 bundle。
