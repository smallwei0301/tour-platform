# Phase 6 E2E 測試報告

> **測試日期：** 2026-04-02
> **測試員：** Judy（QA Agent）
> **測試對象：** Phase 6 導遊儀表板（feat/guide-dashboard branch）
> **環境：** Vercel Preview — `tour-platform-git-feat-guide-dashboard-smallwei0301s-projects.vercel.app`
> **模型：** anthropic/claude-haiku-4-5

---

## 測試摘要

| 項目 | 結果 |
|------|------|
| 總測試數 | 10 |
| **通過** | **10 ✅** |
| 失敗 | 0 |
| 整體結論 | **PASS 🎉** |

---

## 測試細項

| TC | 名稱 | 結果 | 備註 |
|----|------|------|------|
| TC-01 | Admin 產生邀請碼 | ✅ | Modal 顯示完整邀請 URL，有效期 24 小時；「👤 已上線導遊」Tab 正確顯示 3 位導遊 |
| TC-02 | 首次登入設密碼 | ✅ | 邀請 URL → 設密碼畫面 → 設定成功 → 自動跳轉 /guide/dashboard，歡迎橫幅正確 |
| TC-03 | 邀請碼只能用一次 | ✅ | 重複使用回傳「邀請碼無效或已使用」錯誤 |
| TC-04 | 一般密碼登入 | ✅ | Guide ID + 密碼登入成功，跳轉 dashboard |
| TC-05 | 未登入保護 | ✅ | /guide/dashboard、/guide/schedules → redirect；/guide/apply 公開正常顯示 |
| TC-06 | Dashboard 儀表板 | ✅ | 統計卡片（本月預訂數／近期訂單／本週場次）正常載入 |
| TC-07 | 場次管理 | ✅ | 頁面正常，無場次資料時顯示空狀態 |
| TC-08 | 訂單查看 | ✅ | 頁面正常，無訂單資料時顯示空狀態 |
| TC-09 | 跨導遊資料隔離 | ✅ | PATCH 非本人場次 → 401 Unauthorized，隔離生效 |
| TC-10 | 登出 | ✅ | 登出後 redirect 至 /guide/login，session 清除 |

---

## 修復過程（Round 1 → Round 3）

| Round | 問題 | 根因 | 修復 |
|-------|------|------|------|
| Round 1 | TC-01 API 500 | migration 007 未跑到 Supabase | 用 Management API 執行 SQL |
| Round 2 | 「已上線導遊」Tab 顯示 0 位 | `isAdminAuthorized(req)` 傳錯參數（raw Request 而非 config object）→ 401 | 移除 route-level auth check（靠 middleware 保護） |
| Round 2 | Andy Lee 在 Admin 看不到 | Admin 頁只查 `guide_applications`，Andy Lee 直接在 `guide_profiles` | 新增「👤 已上線導遊」Tab + `/api/admin/guides/approved` API |
| Round 3 | — | — | **全部 10/10 PASS** |

---

## 已驗證功能清單

### 安全性
- ✅ HMAC-SHA256 session token（guideId:version:sig 格式）
- ✅ invite_token 使用後立即清除（一次性）
- ✅ SHA-256 + salt 密碼儲存（無明文）
- ✅ 路由保護：/guide/* 未登入 redirect，/guide/apply 公開白名單
- ✅ Ownership 驗證：API 層 guide_id 比對，非本人資源回 401/403
- ✅ Email 隱碼保護：j***@gmail.com 格式
- ✅ Production 環境 cookie 自動加 Secure 旗標

### 功能
- ✅ Admin 可對已審核導遊（guide_profiles）產生邀請連結
- ✅ 導遊首次登入可設定密碼
- ✅ 導遊一般密碼登入
- ✅ Dashboard 統計卡片
- ✅ 場次管理（空狀態顯示）
- ✅ 訂單查看（空狀態顯示）
- ✅ 登出 + session 清除

---

## 相關 commits

| commit | 說明 |
|--------|------|
| `29261c0` | Phase 6 Batch 1-5 實作（T-001~T-018） |
| `59dc849` | TypeScript 6→5.9.3 降版（Next.js 15 build 修復） |
| `9e2ffb7` | workspace next binary + TS hoist + SSR document.cookie 修復 |
| `078fd04` | Judy code review 修正（/guide/apply 白名單、Secure cookie、signature check） |
| `975adc2` | migration 007 執行 + Admin 已上線導遊 Tab |
| `a4d1cc1` | API approved route auth 修正 |
| `4b63d78` | 移除 route-level 多餘 auth check |
