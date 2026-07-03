# QA 驗收：#1566 Email OTP（magic link）登入 — 正式環境設定 live 驗證

- **驗收時間**：2026-07-03 17:05（Asia/Taipei）
- **環境**：正式站 `https://tour-platform-nine.vercel.app`；Supabase 專案 `tour platform`（ref `pyoderxmpeyqjwkeliiu`，region ap-northeast-1）
- **對應 commit**：Email OTP 程式碼於 PR #1582 併入 main（`062d66e..` 後），本次驗的是 **Dashboard 設定啟用後的 live 行為**
- **判定**：**PASS**（伺服器端 `mail.send` 實證）

## 背景

#1566 的程式碼（登入頁 email 輸入＋`signInWithOtp`＋送出後狀態）已於 PR #1582 合併並通過 Playwright e2e（mock）。但 magic link 能否真正寄出，取決於 **Supabase Dashboard 兩項設定**，屬 owner 手動：

1. Authentication → Providers → **Email** provider 啟用
2. Authentication → URL Configuration → **Redirect URLs** 白名單納入 `/auth/callback`

owner 已於 2026-07-03 完成上述設定（截圖佐證：Email = Enabled；Redirect URLs 含 `https://tour-platform-nine.vercel.app/auth/callback`、`/**`、Vercel preview 萬用字元、`http://localhost:3000/**`）。

## 驗收方法

以 anon 公鑰對 Supabase Auth 端點發出與前端 `signInWithOtp` 等價的請求，`redirect_to` 帶正式站 callback，收件者為 owner 本人信箱（可自行確認收信）：

```
POST /auth/v1/otp?redirect_to=<正式站 /auth/callback?next=/>
Body: {"email":"<owner 信箱>","create_user":true,"gotrue_meta_security":{}}
```

## 逐項證據

| 驗證項 | 結果 | 證據 |
|---|---|---|
| OTP 端點接受請求（provider 已啟用） | ✅ | HTTP `200`，body `{}`（provider 未啟用會回 422 `email_provider_disabled`） |
| magic link 信件實際寄出 | ✅ | auth log：`{"event":"mail.send","mail_from":"noreply@mail.app.supabase.io","mail_to":"<owner>","mail_type":"magic_link","time":"2026-07-03T09:05:29Z"}` |
| 屬既有帳號登入（非誤建新戶） | ✅ | auth log：`action:"user_recovery_requested"`，actor 為既有 Google 帳號使用者 |
| `redirect_to`（正式站 callback）被接受 | ✅ | 帶白名單內 redirect 仍回 200；未觸發 redirect 拒絕 |

## 待人工完成的最後一哩（非阻擋）

- **點擊信中連結驗證 `/auth/callback` 交換**：需真實瀏覽器 session（持有 PKCE code_verifier cookie）點擊完成，只有 owner 在自己裝置上能執行。已請 owner 於收件匣確認可跳回網站並登入。此步不影響本報告對「寄送鏈路已通」的 PASS 判定。

## 已知限制（非本 issue 缺陷）

- 目前使用 Supabase 內建寄信服務（`noreply@mail.app.supabase.io`），免費方案有每小時寄送上限且投遞品質一般。量大時應於 Project Settings → Authentication → SMTP 換自有 SMTP（Resend／SendGrid 等）。屬營運強化，不阻擋上線。

## 附註（無密鑰）

本報告不含任何 anon/service key、token、cookie 或完整 payload；信箱位址於證據表以 `<owner>` 遮蔽。
