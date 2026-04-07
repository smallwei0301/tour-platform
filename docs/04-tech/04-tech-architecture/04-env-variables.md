# 環境變數說明

> 最後更新：2026-04-07（Phase 9 完成）

## 完整變數清單

### Supabase（必填）

| 變數名稱 | 說明 | Secret | 範例 |
|----------|------|--------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 專案 URL（前端可見） | ❌ | `https://xxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key（前端可見） | ❌ | `eyJhbGci...` |
| `SUPABASE_URL` | Supabase 專案 URL（後端用） | ❌ | 同上 |
| `SUPABASE_ANON_KEY` | Supabase anon key（後端用） | ❌ | 同上 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key（全權限） | ✅ | `eyJhbGci...` |

**取得方式：** Supabase Dashboard → Settings → API

### Admin（必填）

| 變數名稱 | 說明 | Secret | 範例 |
|----------|------|--------|------|
| `ADMIN_ACCESS_TOKEN` | Admin 登入 token | ✅ | 任意強密碼 |
| `ADMIN_EMAIL_ALLOWLIST` | 允許登入的 Admin email（逗號分隔） | ❌ | `admin@example.com` |

### Google OAuth（Phase 9，必填）

| 變數名稱 | 說明 | Secret | 範例 |
|----------|------|--------|------|
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 Client ID | ❌ | `xxxxx.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 Client Secret | ✅ | `GOCSPX-xxxxx` |

**取得方式：** [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → OAuth 2.0 Client IDs

**注意：**
- Authorized redirect URI 必須設為 `https://<supabase-ref>.supabase.co/auth/v1/callback`
- 還需在 Supabase Dashboard → Authentication → Providers → Google 啟用並填入 Client ID/Secret

### Resend Email（Phase 9，選填）

| 變數名稱 | 說明 | Secret | 範例 |
|----------|------|--------|------|
| `RESEND_API_KEY` | Resend API key | ✅ | `re_xxxxx` |
| `EMAIL_FROM` | 寄件者地址 | ❌ | `Tour Platform <noreply@resend.dev>` |

**取得方式：** [resend.com](https://resend.com) → API Keys

**注意：**
- 未設定 `RESEND_API_KEY` 不會 crash（lazy init），只是不發 email
- 免費方案：100 封/天
- `resend.dev` domain 免驗證，生產環境建議用自訂 domain

### 選填

| 變數名稱 | 說明 | Secret | 用途 |
|----------|------|--------|------|
| `NEXT_PUBLIC_SITE_URL` | 網站公開 URL | ❌ | Email 內連結使用（未設預設 vercel.app） |

---

## 各環境設定差異

| 變數 | Local | Preview | Production |
|------|-------|---------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | 同 | 同 | 同（共用一個 Supabase） |
| `ADMIN_ACCESS_TOKEN` | 弱密碼可 | 同 production | 強密碼 |
| `GOOGLE_CLIENT_ID` | 同 | 同 | 同 |
| `RESEND_API_KEY` | 可不設 | 同 production | 設定 |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | Vercel Preview URL | 正式 domain |

---

## 設定方式

### Local（`.env.local`）
```bash
# 檔案位置：apps/web/.env.local
# ⚠️ 此檔已加入 .gitignore，不會 commit
```

### Vercel
```bash
# 透過 Vercel Dashboard → Settings → Environment Variables
# 或透過 API：
curl -X POST "https://api.vercel.com/v10/projects/<project_id>/env" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '[{"key": "VAR_NAME", "value": "VAR_VALUE", "type": "encrypted", "target": ["production", "preview", "development"]}]'
```

### Supabase Auth Config
```bash
# site_url 和 uri_allow_list 需透過 Supabase Dashboard 或 Management API 設定
# site_url: 正式 domain
# uri_allow_list: 包含所有 Vercel preview URL pattern + localhost
```
