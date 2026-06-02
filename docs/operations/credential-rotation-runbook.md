# Credential Rotation Runbook

> 觸發條件：issue #1121 — git history 中發現 service_role JWT × 7、sbp_ PAT × 5、admin token × 10、anon JWT × 4
> 建立日期：2026-06-03
> 必須在 soft-launch 前完成

**⚠️ 重要：此文件本身不包含任何實際憑證、token、密碼、連線字串或帳號資訊。**

---

## 優先順序

| 等級 | 憑證 | 風險 | 期限 |
|------|------|------|------|
| 🔴 P0 | Supabase `service_role` JWT | 全 DB read/write/admin | **立即，soft-launch 前** |
| 🔴 P0 | Supabase Personal Access Token (sbp_) | Management API（設定、備份、帳單、key rotation）| **立即** |
| 🔴 P0 | `ADMIN_ACCESS_TOKEN` | Admin POS / refund / payout backoffice | **立即** |
| 🟡 P2 | Supabase `anon` JWT | 設計為半公開，但仍建議輪換 | soft-launch 前 |

---

## Step 1：Supabase service_role JWT 輪換

1. 登入 [Supabase Dashboard](https://supabase.com/dashboard) → 選擇 tour-platform project
2. Settings → API → Service role key
3. 點擊 "Reset" / "Regenerate" → 確認
4. **立刻** 更新以下位置（不可延遲）：
   - Vercel: 專案 Settings → Environment Variables → `SUPABASE_SERVICE_ROLE_KEY`
   - 本機 `.env`：`SUPABASE_SERVICE_ROLE_KEY=<新值>`
   - 本機 `.qa-secrets/tour-platform-vercel-production.env`（如有）

**驗證：**
```bash
# 舊 key 應該回傳 401 或 403，不可再讀取 DB
# 新 key 應該可以正常查詢
source .env && curl -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  "$SUPABASE_URL/rest/v1/orders?limit=1"
```

---

## Step 2：Supabase Personal Access Token (sbp_) 輪換

1. 登入 Supabase → 右上角頭像 → Account → Access Tokens
2. 找到 `sbp_` 開頭的 token → 點擊 "Revoke" / "Delete"
3. 建立新 token：Token name = "tour-platform-deploy" → 複製
4. 更新使用此 token 的位置（通常是 CI/CD 腳本或 supabase CLI 設定）

**注意：** sbp_ token 通常不在 runtime `.env`，而是在部署流程中。確認是否有 GitHub Actions secrets 或 CI scripts 使用它。

---

## Step 3：ADMIN_ACCESS_TOKEN 輪換

> 此 token 同時用於：Admin POS backoffice、退款、payout、Andy Lee guide login（已知複用）。輪換後 Andy Lee 的 guide 登入密碼也需同步更新。

1. 產生新的強 token（32 個以上字元）：
   ```bash
   # 使用 openssl 產生安全隨機 token
   openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 40
   ```
2. 更新以下位置：
   - Vercel: `ADMIN_ACCESS_TOKEN=<新值>`
   - 本機 `.env`: `ADMIN_ACCESS_TOKEN=<新值>`
   - 本機 `.qa-secrets/tour-platform-vercel-production.env`
   - Andy Lee guide login password（Admin → Guide 管理 → Andy Lee 帳號 → 重設密碼）
3. **驗證：**
   ```bash
   # 新 token 應該可以正常存取 admin API
   source .env && curl -H "Authorization: Bearer $ADMIN_ACCESS_TOKEN" \
     "$STAGING_HEALTHCHECK_URL/api/health"
   ```

**Apps/web/src/config/security-env.mjs 安全閾值：**
- ADMIN_ACCESS_TOKEN 最短 16 字元（但建議 32+）
- 不要使用舊洩漏的 11 字元值 `@Wei3362499`

---

## Step 4：Supabase anon JWT 輪換（P2）

1. Supabase Dashboard → Settings → API → anon public key
2. 點擊 "Reset"
3. 更新：
   - Vercel: `NEXT_PUBLIC_SUPABASE_ANON_KEY=<新值>`
   - 本機 `.env`
4. **注意**：`NEXT_PUBLIC_` 開頭的變數會打包到前端，需要重新 deploy

---

## Step 5：重新 Deploy

輪換所有 key 後，觸發 Vercel 重新 deploy：
```bash
# 強制 redeploy（最新 commit）
gh workflow run --repo smallwei0301/tour-platform ci.yml
# 或在 Vercel 儀表板點擊 "Redeploy"
```

---

## Step 6：驗證

```bash
# 確認 production health check 正常
curl https://tour-platform-nine.vercel.app/api/health

# 確認 admin API 可以存取（用新 ADMIN_ACCESS_TOKEN）
source .qa-secrets/tour-platform-vercel-production.env
curl -H "Authorization: Bearer $ADMIN_ACCESS_TOKEN" \
  "$NEXT_PUBLIC_SITE_URL/api/health"
```

---

## 完成後

- [ ] 在 issue #1121 上留言確認各 step 完成
- [ ] 更新 `.qa-secrets/tour-platform-vercel-production.env`（私有，不 commit）
- [ ] 通知 Andy Lee 更新他的 guide 登入密碼

---

## 為什麼 git history 無法安全 rewrite？

- GitHub web cache 至少保留 90 天，force-push 不能清除已被爬取的版本
- 若有 fork 或外部工具已 clone，rewrite 無法追回
- 最安全的做法：接受 history 已 compromised，**立刻 rotate 所有洩漏的 credentials**
- 可選擇性執行 `git filter-repo` 清理 history，但這對已 committed 到遠端的洩漏沒有實際保護效果

---

## 不應寫在 repo 裡的東西

- 任何實際 JWT token 字串
- `sbp_` 開頭的 PAT
- `ADMIN_ACCESS_TOKEN` 的實際值
- 資料庫連線字串（含密碼）
- Supabase project password
- ECPay merchant key / hash key（在 `.env`/secrets 中管理）
