# 部署檢查清單

> 最後更新：2026-03-31

---

## Pre-Deploy（每次 Production 部署前）

### 程式碼品質
- [ ] `npm run build -w @tour/web` 成功（零 error）
- [ ] `npm run test -w @tour/web` 全綠
- [ ] `bash scripts/preflight-check.sh` 全綠
- [ ] PR Code Review 已通過

### 環境變數確認
- [ ] `NEXT_PUBLIC_APP_URL` — Vercel production URL
- [ ] `SUPABASE_URL` — Production Supabase URL
- [ ] `SUPABASE_ANON_KEY` — Production anon key
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — Production service role key
- [ ] `ECPAY_MERCHANT_ID` — 正式商家 ID（非 sandbox）
- [ ] `ECPAY_HASH_KEY` — 正式 hash key
- [ ] `ECPAY_HASH_IV` — 正式 hash IV
- [ ] `ADMIN_TOKEN` — Admin 登入 token（已輪替）
- [ ] 環境變數已設定於 Vercel Dashboard → Settings → Environment Variables

### 資料庫
- [ ] Supabase Production migration 已執行
- [ ] seed data 已就位（Andy Lee guide_profiles + activities）
- [ ] RLS policy 已啟用且測試通過

### 功能確認（Smoke Test）
- [ ] 首頁可載入
- [ ] 活動列表從 DB 正常顯示
- [ ] 活動詳情頁可正常進入
- [ ] 日期選擇器可操作
- [ ] 預訂流程可走到結帳頁
- [ ] Admin 登入可用
- [ ] Admin 行程列表可正常顯示
- [ ] 手機版 layout 正常

---

## Post-Deploy 確認

- [ ] Production URL 可正常存取
- [ ] 無 console error
- [ ] 行動版檢查（至少 iPhone Safari + Android Chrome）
- [ ] Admin 後台可正常登入與操作
- [ ] 通知團隊部署完成

---

## Rollback 步驟

1. Vercel Dashboard → Deployments → 點擊上一個成功的 deploy → 「Promote to Production」
2. 若需 DB rollback → 執行 Supabase migration rollback（參考 `supabase/` 目錄）
3. 通知團隊 rollback 完成

---

## 參考
- Vercel Deploy Checklist：`docs/implementation/vercel-deploy-checklist.md`
- Production ENV Template：`docs/implementation/env-production-template.md`
- Release Commands：`docs/implementation/release-commands.md`
