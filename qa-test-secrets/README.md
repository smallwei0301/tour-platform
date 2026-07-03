# QA Test Secrets（本機專用）

這個資料夾用來放「導遊後台 / 管理者後台」登入測試所需的環境變數範本。

## 重要安全規則

- **不要把真實 secret、token、email/password 提交到 Git。**
- 真實檔案請命名為 `qa-test-secrets/.env.qa.local`；此資料夾的 `.gitignore` 會阻擋它被提交。
- 如果 token 曾經貼到聊天、issue、log 或 PR，請到 Vercel 重新產生並撤銷舊 token。

## 使用方式

```bash
cp qa-test-secrets/.env.qa.example qa-test-secrets/.env.qa.local
# 編輯 qa-test-secrets/.env.qa.local，填入 Vercel / Supabase / Admin / Guide 測試值
node --env-file=qa-test-secrets/.env.qa.local scripts/qa/validate-auth-env.mjs --target=production
```

## Vercel 環境變數同步建議

Vercel CLI 可用時，請用互動式 `vercel env add` 將以下 key 分別加入 `production`、`preview`、`development`：

- `GUIDE_SESSION_SECRET`
- `ADMIN_ACCESS_TOKEN`
- `ADMIN_EMAIL_ALLOWLIST`
- `SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SITE_URL`
- `GUIDE_DASHBOARD_REPORT_TIER`

這裡只記錄 key 名稱，不記錄值；就像保險箱外面的標籤，只告訴你要放哪幾把鑰匙，不把鑰匙貼在門上。
