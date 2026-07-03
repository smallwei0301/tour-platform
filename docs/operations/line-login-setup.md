# LINE Login 啟用指南（#1526，C′ 後端 idToken 橋接）

> 狀態：**code 已上線，flag 預設 OFF**。本文件為 operator 啟用步驟。
> 設計依據：#1526 decision note（owner 拍板選項 C′）。

## 架構摘要

- **登入頁按鈕**（`app/login/page.tsx`）：`NEXT_PUBLIC_LINE_LOGIN_ENABLED` ON 才顯示「用 LINE 帳號登入」。
- **瀏覽器流程**：按鈕 → LINE OAuth authorize → `GET /auth/line/callback`（server 以 channel secret 換 id_token）→ 驗證 → 簽發 Supabase session → 登入即綁定 → 導回 next。
- **LINE 內（LIFF）流程**：前端取 idToken → `POST /api/auth/line`（帶 idToken）→ 同一 `issueLineSession` 邏輯。
- **session 簽發**：service-role `admin.generateLink(magiclink)` → SSR `verifyOtp` 設 cookie（與 Google 登入同構）。
- **帳號合併**（權威鍵＝`line_user_mapping.line_user_id`）：已綁定→登入既有 user；未綁定→建新帳號（無 email 用 `line_{sub}@line.local` placeholder）。**verified-email 自動連結預設 OFF**（防搶號）。

## Operator 啟用步驟

1. **LINE Developers Console**（LINE Login channel）：
   - 申請 **email 權限**（OpenID `email` scope）。
   - Callback URL 加入 production 與 preview：`https://<host>/auth/line/callback`。
   - 記下 Channel ID 與 Channel Secret。
2. **Vercel 環境變數**（production，encrypted）：
   - `NEXT_PUBLIC_LINE_LOGIN_CHANNEL_ID`（client 端 authorize 用，非機密）
   - `LINE_LOGIN_CHANNEL_ID`（server 驗 aud／換 token）
   - `LINE_LOGIN_CHANNEL_SECRET`（server 換 token，**機密**）
   - `NEXT_PUBLIC_LINE_LOGIN_ENABLED=1`（開關）
   - （選）`LINE_LOGIN_AUTOLINK_VERIFIED_EMAIL=1` — 僅在觀察誤併率後才開啟自動連結
3. **Supabase Dashboard**：
   - 確認 Auth 允許 admin `generateLink` / `verifyOtp`（service-role 預設可）。
   - （若日後要旅客自助連結 Google↔LINE）開啟 manual identity linking。
4. **驗證**：flag ON 後登入頁出現 LINE 按鈕 → 走一次 OAuth → 確認 `line_user_mapping` 新增一筆、session cookie 已設、`/me` 可存取。

## Rollback

`NEXT_PUBLIC_LINE_LOGIN_ENABLED=0`（或移除）→ 按鈕消失、`/api/auth/line` 回 404、`/auth/line/callback` 導回 `/login`。Google 登入完全不受影響。

## 安全

- Channel secret 僅 server env，不落 log／client bundle（`security-env.mjs` 守門）。
- `/api/auth/line`、`/auth/line/callback` 為 issuance 端點，middleware CSRF-exempt；rate-limit 走 `limiters.lineAuth`。
- redirect `next` 僅允許站內相對路徑（open-redirect 防護）。
- verified-email 自動連結預設關閉；開啟前務必確認 LINE email 驗證語意，避免搶號。
