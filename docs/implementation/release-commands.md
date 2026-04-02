# Release Commands (Copy/Paste)

## 1) Push to GitHub
```bash
cd /root/.openclaw/workspace-tracy/tour-platform
git status
git push origin main
```

## 2) Optional: verify CI locally before push
```bash
bash scripts/preflight-check.sh
```

## 3) Deploy on Vercel CLI (optional)
```bash
npm i -g vercel
vercel login
vercel link
vercel env add NEXT_PUBLIC_APP_URL production
vercel env add SUPABASE_URL production
vercel env add SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add ECPAY_MERCHANT_ID production
vercel env add ECPAY_HASH_KEY production
vercel env add ECPAY_HASH_IV production
vercel env add ECPAY_CALLBACK_URL production
vercel --prod
```

## 4) Post-deploy smoke
```bash
bash scripts/demo-smoke.sh https://<your-vercel-domain>
```
