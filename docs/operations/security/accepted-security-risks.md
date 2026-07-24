# 已接受的安全風險（advisor WARN 定案清單）

> 用途：Supabase security advisor（或其他掃描）會持續回報某些 WARN，其中部分是 **owner 知情後決定不修**的。
> 本檔是這類決策的 source of truth——**未來 session／advisor 跑到清單內的項目，不得再當「待修」重提**，
> 除非前提改變（例如升級了方案、開了新登入方式）。變更本清單需 owner 同意。

## 定案清單

| # | Advisor lint | 目標 | 決策 | 理由 | 拍板 |
|---|---|---|---|---|---|
| 1 | `auth_leaked_password_protection`（Leaked Password Protection Disabled） | Supabase Auth 設定 | **不修（接受）** | 此功能需 **Supabase Pro 方案**，owner 目前不付費升級。風險有限：traveler 走 Google OAuth 無密碼、完全不受影響；僅 guide 自設登入密碼少一層「比對 HaveIBeenPwned 外洩名單」防護，而 guide 密碼已用 scrypt 雜湊（#1564 升級）。屬 WARN 級、非漏洞。 | owner，2026-07-10 |

## 前提改變時要重新評估

- 上述第 1 項：若日後**升級 Supabase Pro**、或**開放 Email 密碼登入**（讓一般旅客也用密碼），應重新考慮開啟 leaked password protection。
- 開啟位置：Supabase Dashboard → Authentication → Policies／Attack Protection → "Leaked password protection"（見 https://supabase.com/docs/guides/auth/password-security ）。

## 不在本清單＝仍須處理

security advisor 回報但**不在上表**的項目，一律視為待修（走 migration → PR → CI → SQL-OVERRIDE 套用的正常流程；RLS/grants 類參考 `docs/operations/security/rls-grants-preflight-runbook.md`）。
